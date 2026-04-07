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
 * SALE [OutletName]          ← first line: keyword + outlet name
 * [ItemName] x[qty] @[price] ← one per line; lines without @ are skipped
 * [ItemName] x[qty] @[price]
 * ---
 * [total]                    ← stated total (used for validation)
 *
 * MESSAGE FORMAT — EXPENSE
 * ------------------------
 * EXPENSE [OutletName]
 * [ItemName] @[price]
 * [ItemName] @[price]
 * ---
 * [total]
 *
 * PARSER RULES
 * ------------
 * - First word must be "SALE" or "EXPENSE" (case-insensitive).
 * - Outlet name is the LAST word of the first line.
 * - Lines without "@" are skipped (e.g. blank lines, headers).
 * - "---" acts as the delimiter between line items and the stated total.
 * - All lines after "---" are considered the "total block"; the parser
 *   extracts the first clean numeric value as the stated total.
 * - Parsed total is computed by summing qty × price for each line item.
 * - If parsed_total !== stated_total → ⚠️ reply with mismatch, no DB write.
 * - Unknown menu items (for SALE) → ⚠️ reply asking for price, no DB write.
 *
 * SUCCESS REPLY FORMAT
 * --------------------
 * ✅ Sale recorded — [Outlet] — ₹[total]
 *   [item x qty], [item x qty]
 *
 * ERROR REPLY FORMAT
 * -----------------
 * ⚠️ [specific error]
 * [details]
 */

/**
 * @typedef {Object} ParsedSale
 * @property {"SALE"} type
 * @property {string} outletName
 * @property {Array<{itemName: string, quantity: number, price: number}>} items
 * @property {number} statedTotal
 * @property {number} parsedTotal
 */

/**
 * @typedef {Object} ParsedExpense
 * @property {"EXPENSE"} type
 * @property {string} outletName
 * @property {Array<{itemName: string, price: number}>} items
 * @property {number} statedTotal
 * @property {number} parsedTotal
 */

/**
 * @typedef {{ valid: false, error: string, details?: string }} ParseError
 * @typedef {{ valid: true } & (ParsedSale | ParsedExpense)} ParseSuccess
 */

/** @type {Readonly<RegExp>} */
const QTY_PATTERN = /x(\d+)/i;
/** @type {Readonly<RegExp>} */
const PRICE_PATTERN = /@\s*(\d+(?:\.\d{1,2})?)/;
/** @type {Readonly<RegExp>} */
const TOTAL_PATTERN = /^\s*(\d+(?:\.\d{1,2})?)\s*$/;
/** @type {Readonly<RegExp>} */
const OUTLET_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
/** @type {Readonly<RegExp>} Matches "date: YYYY-MM-DD" (or similar) at the end of the header */
const DATE_SUFFIX_PATTERN = /\s+date:\s*\S+\s*$/i;
/** @type {Readonly<string[]>} */
const SEPARATOR = "---";

/**
 * Extracts the transaction type and outlet name from the first line.
 * Outlet name is the last whitespace-separated word.
 *
 * @param {string} firstLine — e.g. "SALE DLF Mall" or "EXPENSE Koramangala"
 * @returns {{ type: "SALE" | "EXPENSE", outletName: string } | null}
 */
function parseHeader(firstLine) {
  const trimmed = firstLine.trim();
  const spaceIdx = trimmed.indexOf(" ");

  if (spaceIdx === -1) return null;

  const type = trimmed.slice(0, spaceIdx).toUpperCase();
  if (type !== "SALE" && type !== "EXPENSE") return null;

  let rest = trimmed.slice(spaceIdx + 1).trim();

  // Strip optional "date: YYYY-MM-DD" suffix
  let date = null;
  const dateMatch = DATE_SUFFIX_PATTERN.exec(rest);
  if (dateMatch) {
    const datePart = dateMatch[0].trim().replace(/^date:\s*/i, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      date = datePart;
    }
    rest = rest.slice(0, dateMatch.index).trim();
  }

  // The entire remaining text is the outlet name (supports multi-word names like "Link Road")
  const outletName = rest;

  if (!outletName || !OUTLET_NAME_PATTERN.test(outletName)) return null;

  return { type, outletName, date };
}

/**
 * Parses a single sale line: "Cold Coffee x2 @120" → { itemName, quantity, price }
 * Returns null if the line doesn't match the expected format.
 *
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
  if (isNaN(price) || price < 0) return null;

  // quantity defaults to 1 if not specified
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  if (quantity < 1) return null;

  // item name is everything before the @price
  const priceIdx = trimmed.lastIndexOf(priceMatch[0]);
  const beforePrice = trimmed.slice(0, priceIdx).trim();
  // remove the " xQty" suffix if present
  const itemName = qtyMatch ? beforePrice.replace(QTY_PATTERN, "").trim() : beforePrice;

  if (!itemName) return null;

  return { itemName, quantity, price };
}

/**
 * Parses a single expense line: "Auto Rickshaw @45" → { itemName, price }
 *
 * @param {string} line
 * @returns {{ itemName: string, price: number } | null}
 */
function parseExpenseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !PRICE_PATTERN.test(trimmed)) return null;

  const priceMatch = PRICE_PATTERN.exec(trimmed);
  const price = parseFloat(priceMatch[1]);
  if (isNaN(price) || price < 0) return null;

  // item name is everything before the @price
  const priceIdx = trimmed.lastIndexOf(priceMatch[0]);
  const itemName = trimmed.slice(0, priceIdx).trim();

  if (!itemName) return null;

  return { itemName, price };
}

/**
 * Main parse function. Splits the message at "---" and delegates to the
 * appropriate line parser based on transaction type.
 *
 * @param {string} text — raw message text from Telegram
 * @returns {ParseSuccess | ParseError}
 */
export function parseMessage(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { valid: false, error: "Empty message", details: "Send a SALE or EXPENSE message." };
  }

  // --- Step 1: Parse the header (type + outlet name) ---
  const header = parseHeader(lines[0]);
  if (!header) {
    return {
      valid: false,
      error: "Invalid header format",
      details: 'First line must be "SALE [OutletName]" or "EXPENSE [OutletName]".',
    };
  }

  // --- Step 2: Find the separator ("---") ---
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

  // --- Step 3: Parse line items ---
  const rawItemLines = lines.slice(1, sepIndex);
  const parseLine = header.type === "SALE" ? parseSaleLine : parseExpenseLine;

  /** @type {any[]} */
  const items = [];
  for (const line of rawItemLines) {
    const parsed = parseLine(line);
    if (parsed) items.push(parsed);
    // Lines without @ are intentionally skipped (blank lines, labels, etc.)
  }

  if (items.length === 0) {
    return {
      valid: false,
      error: "No valid items found",
      details: "At least one item with a price (@[price]) is required above the --- line.",
    };
  }

  // --- Step 4: Extract stated total (first numeric line after ---) ---
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

  // --- Step 5: Compute parsed total and validate ---
  const parsedTotal = items.reduce((sum, item) => {
    return sum + (item.quantity ?? 1) * item.price;
  }, 0);

  // Allow for floating point comparison with 2 decimal precision
  const parsedRounded = Math.round(parsedTotal * 100);
  const statedRounded = Math.round(statedTotal * 100);

  if (parsedRounded !== statedRounded) {
    return {
      valid: false,
      error: "Total mismatch",
      details: `Stated total (₹${statedTotal}) ≠ calculated total (₹${parsedTotal.toFixed(2)}). Please check item quantities and prices.`,
    };
  }

  // --- Step 6: Return structured result ---
  if (header.type === "SALE") {
    return {
      valid: true,
      type: "SALE",
      outletName: header.outletName,
      items,
      statedTotal,
      parsedTotal,
    };
  } else {
    return {
      valid: true,
      type: "EXPENSE",
      outletName: header.outletName,
      items,
      statedTotal,
      parsedTotal,
    };
  }
}

/**
 * Formats a parsed result for a success reply message.
 * @param {ParseSuccess} result
 * @returns {string}
 */
export function formatSuccessReply(result) {
  const outlet = result.outletName;
  const total = result.statedTotal.toFixed(2);

  if (result.type === "SALE") {
    const itemList = result.items
      .map((it) => (it.quantity > 1 ? `${it.itemName} x${it.quantity}` : it.itemName))
      .join(", ");
    return `✅ Sale recorded — ${outlet} — ₹${total}\n  ${itemList}`;
  } else {
    const itemList = result.items.map((it) => it.itemName).join(", ");
    return `✅ Expense recorded — ${outlet} — ₹${total}\n  ${itemList}`;
  }
}

/**
 * Formats a parse error for a Telegram reply.
 * @param {ParseError} error
 * @returns {string}
 */
export function formatErrorReply(error) {
  return `⚠️ ${error.error}\n${error.details ?? ""}`;
}
