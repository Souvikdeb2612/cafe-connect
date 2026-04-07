/**
 * Cafe Connect Telegram Bot — Message Parser
 * ==========================================
 *
 * Parses messages sent in the Telegram group following the SALE / EXPENSE
 * format. Validates line-item totals against the stated total before any
 * database write is attempted.
 *
 * MESSAGE FORMAT — SALE
 * ---------------------
 * SALE [OutletName]          ← first line: keyword + outlet name + optional date
 * [ItemName] x[qty] @[price] ← one per line; lines without @ are skipped
 * [ItemName] x[qty] @[price]
 * ---
 * [total]                    ← stated total (used for validation)
 *
 * OPTIONAL DATE: "SALE [OutletName] date: 2026-04-05"
 * If omitted, defaults to today. Future dates are rejected.
 *
 * MESSAGE FORMAT — EXPENSE
 * ------------------------
 * EXPENSE [OutletName] date: YYYY-MM-DD  (date is optional)
 * category: Grocery                       (optional — defaults to General)
 * [ItemName] @[price]
 * [ItemName] @[price]
 * ---
 * [total]
 *
 * EDGE CASES HANDLED
 * ------------------
 * - Multiple transactions in one message (split on SALE/EXPENSE keywords)
 * - Invisible Unicode characters stripped before parsing
 * - Zero quantity/price rejected
 * - Upper bounds: qty ≤ 9999, price ≤ 999999
 * - Special characters in item names (apostrophes, accents, etc.)
 * - Date validation: must be real calendar date, not in the future
 * - Case-insensitive type keyword
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const QTY_PATTERN = /x(\d+)/i;
const PRICE_PATTERN = /@\s*(\d+(?:\.\d{1,2})?)/;
const TOTAL_PATTERN = /^\s*(\d+(?:\.\d{1,2})?)\s*$/;
const OUTLET_NAME_PATTERN = /^[A-Za-z0-9 _'-]+$/;
const DATE_CLAUSE_PATTERN = /date:\s*(\d{4}-\d{2}-\d{2})/i;
const CATEGORY_PATTERN = /^category:\s*(.+)$/i;
const SEPARATOR = "---";

const MAX_QUANTITY = 9999;
const MAX_PRICE = 999999;

// Zero-width and invisible Unicode characters to strip
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064]/g;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strips invisible Unicode characters that may come from copy-pasting.
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  return text.replace(INVISIBLE_CHARS, "");
}

/**
 * Validates that a YYYY-MM-DD string represents a real calendar date.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

// ─── Header Parser ──────────────────────────────────────────────────────────

/**
 * Extracts the transaction type, optional date, and outlet name from the first line.
 * @param {string} firstLine
 * @returns {{ type: "SALE" | "EXPENSE", outletName: string, dateStr: string | null } | null}
 */
function parseHeader(firstLine) {
  const trimmed = firstLine.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return null;

  const type = trimmed.slice(0, spaceIdx).toUpperCase();
  if (type !== "SALE" && type !== "EXPENSE") return null;

  const rest = trimmed.slice(spaceIdx + 1).trim();

  // Extract optional "date: YYYY-MM-DD" clause
  const dateMatch = DATE_CLAUSE_PATTERN.exec(rest);
  const dateStr = dateMatch ? dateMatch[1] : null;

  // Remove the date clause to isolate the outlet name
  const outletName = dateStr ? rest.replace(DATE_CLAUSE_PATTERN, "").trim() : rest;

  if (!outletName || !OUTLET_NAME_PATTERN.test(outletName)) return null;

  return { type, outletName, dateStr };
}

// ─── Line Parsers ───────────────────────────────────────────────────────────

/**
 * Parses a single sale line: "Cold Coffee x2 @120"
 * @param {string} line
 * @returns {{ itemName: string, quantity: number, price: number } | null}
 */
function parseSaleLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !PRICE_PATTERN.test(trimmed)) return null;

  const qtyMatch = QTY_PATTERN.exec(trimmed);
  const priceMatch = PRICE_PATTERN.exec(trimmed);
  if (!priceMatch) return null;

  const price = parseFloat(priceMatch[1]);
  if (isNaN(price) || price <= 0 || price > MAX_PRICE) return null;

  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  if (quantity < 1 || quantity > MAX_QUANTITY) return null;

  const priceIdx = trimmed.lastIndexOf(priceMatch[0]);
  const beforePrice = trimmed.slice(0, priceIdx).trim();
  const itemName = qtyMatch ? beforePrice.replace(QTY_PATTERN, "").trim() : beforePrice;

  if (!itemName) return null;

  return { itemName, quantity, price };
}

/**
 * Parses a single expense line: "Auto Rickshaw @45"
 * @param {string} line
 * @returns {{ itemName: string, price: number } | null}
 */
function parseExpenseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !PRICE_PATTERN.test(trimmed)) return null;

  const priceMatch = PRICE_PATTERN.exec(trimmed);
  const price = parseFloat(priceMatch[1]);
  if (isNaN(price) || price <= 0 || price > MAX_PRICE) return null;

  const priceIdx = trimmed.lastIndexOf(priceMatch[0]);
  const itemName = trimmed.slice(0, priceIdx).trim();

  if (!itemName) return null;

  return { itemName, price };
}

// ─── Single Transaction Parser ──────────────────────────────────────────────

/**
 * Parses a single SALE or EXPENSE block.
 * @param {string} text
 * @returns {ParseSuccess | ParseError}
 */
export function parseMessage(text) {
  const lines = sanitizeText(text).split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { valid: false, error: "Empty message", details: "Send a SALE or EXPENSE message." };
  }

  // --- Step 1: Parse header ---
  const header = parseHeader(lines[0]);
  if (!header) {
    return {
      valid: false,
      error: "Invalid header format",
      details: 'First line must be "SALE [OutletName]" or "EXPENSE [OutletName]".',
    };
  }

  // --- Step 2: Validate & resolve date ---
  const todayStr = new Date().toISOString().split("T")[0];
  const entryDate = header.dateStr ?? todayStr;

  if (header.dateStr && !isValidDate(header.dateStr)) {
    return {
      valid: false,
      error: "Invalid date",
      details: `"${header.dateStr}" is not a valid calendar date. Use YYYY-MM-DD format (e.g. 2026-04-07).`,
    };
  }

  if (entryDate > todayStr) {
    return {
      valid: false,
      error: "Future date not allowed",
      details: `Date ${entryDate} is in the future. Omit the date to use today, or use a past date.`,
    };
  }

  // --- Step 3: Find separator ---
  const sepIndex = lines.findIndex((l) => l === SEPARATOR);
  if (sepIndex === -1) {
    return {
      valid: false,
      error: "Missing separator",
      details: 'Add a line with "---" to separate items from the total.',
    };
  }

  if (sepIndex < 2) {
    return {
      valid: false,
      error: "Separator in wrong position",
      details: "There must be at least one line item before the --- separator.",
    };
  }

  // --- Step 3.5: Extract optional category line (EXPENSE only) ---
  let categoryName = null;
  const rawItemLines = lines.slice(1, sepIndex);
  const itemLines = [];

  for (const line of rawItemLines) {
    const catMatch = CATEGORY_PATTERN.exec(line);
    if (catMatch && header.type === "EXPENSE" && !categoryName) {
      categoryName = catMatch[1].trim();
    } else {
      itemLines.push(line);
    }
  }

  // --- Step 4: Parse line items ---
  const parseLine = header.type === "SALE" ? parseSaleLine : parseExpenseLine;

  const items = [];
  for (const line of itemLines) {
    const parsed = parseLine(line);
    if (parsed) items.push(parsed);
  }

  if (items.length === 0) {
    return {
      valid: false,
      error: "No valid items found",
      details: "At least one item with a price (@[price]) is required above the --- line.",
    };
  }

  // --- Step 5: Extract and validate total ---
  const totalBlock = lines.slice(sepIndex + 1);
  const statedTotalLine = totalBlock.find((l) => TOTAL_PATTERN.test(l));

  if (!statedTotalLine) {
    return {
      valid: false,
      error: "Missing total",
      details: "Add the total amount on a line after the --- separator (e.g. 450 or 325.50).",
    };
  }

  const statedTotal = parseFloat(TOTAL_PATTERN.exec(statedTotalLine)[1]);

  const parsedTotal = items.reduce((sum, item) => {
    return sum + (item.quantity ?? 1) * item.price;
  }, 0);

  const parsedRounded = Math.round(parsedTotal * 100);
  const statedRounded = Math.round(statedTotal * 100);

  if (parsedRounded !== statedRounded) {
    return {
      valid: false,
      error: "Total mismatch",
      details: `Stated total (₹${statedTotal}) ≠ calculated total (₹${parsedTotal.toFixed(2)}). Please check item quantities and prices.`,
    };
  }

  // --- Step 6: Return result ---
  return {
    valid: true,
    type: header.type,
    outletName: header.outletName,
    date: entryDate,
    categoryName,
    items,
    statedTotal,
    parsedTotal,
  };
}

// ─── Multi-Transaction Parser ───────────────────────────────────────────────

/**
 * Parses ALL transactions in a single message.
 * Splits on lines that start with SALE or EXPENSE (case-insensitive)
 * to identify individual transaction blocks, each containing its own
 * items and --- total.
 *
 * @param {string} text
 * @returns {Array<ParseSuccess | ParseError>}
 */
export function parseAll(text) {
  const sanitized = sanitizeText(text);
  const lines = sanitized.split("\n");

  // Find indices of lines that start a new transaction block
  const blockStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const firstWord = lines[i].trim().split(/\s/)[0]?.toUpperCase();
    if (firstWord === "SALE" || firstWord === "EXPENSE") {
      blockStarts.push(i);
    }
  }

  if (blockStarts.length === 0) {
    return [{ valid: false, error: "No transaction found", details: "Message must start with SALE or EXPENSE." }];
  }

  // Extract each block (from one header to the next)
  const results = [];
  for (let i = 0; i < blockStarts.length; i++) {
    const start = blockStarts[i];
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : lines.length;
    const blockText = lines.slice(start, end).join("\n").trim();
    if (blockText) {
      results.push(parseMessage(blockText));
    }
  }

  return results;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Formats a success reply for Telegram.
 * @param {object} result
 * @returns {string}
 */
export function formatSuccessReply(result) {
  const outlet = result.outletName;
  const total = result.statedTotal.toFixed(2);
  const dateNote = result.date ? ` (${result.date})` : "";

  if (result.type === "SALE") {
    const itemList = result.items
      .map((it) => it.quantity > 1 ? `${it.itemName} ${it.quantity}` : it.itemName)
      .join(", ");
    return `✅ Sale recorded — ${outlet}${dateNote} — ₹${total}\n  ${itemList}`;
  } else {
    const catNote = result.categoryName ? ` [${result.categoryName}]` : "";
    const itemList = result.items.map((it) => it.itemName).join(", ");
    return `✅ Expense recorded — ${outlet}${dateNote}${catNote} — ₹${total}\n  ${itemList}`;
  }
}

/**
 * Formats a parse error for Telegram.
 * @param {object} error
 * @returns {string}
 */
export function formatErrorReply(error) {
  return `⚠️ ${error.error}\n${error.details ?? ""}`;
}
