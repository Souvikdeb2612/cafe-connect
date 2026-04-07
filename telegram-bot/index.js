/**
 * Cafe Connect Telegram Bot — Entry Point
 * =========================================
 *
 * Listens for SALE / EXPENSE messages in a Telegram group, parses them,
 * validates totals, checks for duplicates, writes to Supabase, and replies
 * with ✅ or ⚠️.
 *
 * ENVIRONMENT VARIABLES (required)
 * ---------------------------------
 * TELEGRAM_BOT_TOKEN   — bot token from @BotFather
 * SUPABASE_URL         — e.g. https://your-project.supabase.co
 * SUPABASE_ANON_KEY    — anon key from Cafe Connect project
 *
 * OPTIONAL
 * --------
 * ALLOWED_GROUP_IDS    — comma-separated list of allowed Telegram group IDs.
 *                        If set, messages from other groups are ignored.
 * DEFAULT_EXPENSE_CATEGORY — category name to use for expenses when no
 *                            category is specified (default: "General")
 * BOT_NAME             — display name used in console logs
 */

import TelegramBot from "node-telegram-bot-api";
import { supabase } from "./supabase.js";
import { parseAll, formatSuccessReply, formatErrorReply } from "./parser.js";

// ─── Environment ────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is required.");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const BOT_NAME = process.env.BOT_NAME ?? "CafeConnectBot";

/** @type {Set<string>} */
const ALLOWED_GROUP_IDS = new Set(
  (process.env.ALLOWED_GROUP_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

// ─── Bot Setup ──────────────────────────────────────────────────────────────

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log(`🤖 ${BOT_NAME} started — polling for messages...`);

// ─── Supabase Helpers ────────────────────────────────────────────────────────

/**
 * Fetches all outlets from Supabase and returns a map of name → id.
 * Results are cached for 5 minutes to avoid excessive queries.
 *
 * @returns {Promise<Map<string, string>>} outlet name (lowercase) → outlet id
 */
let _outletCache = { data: null, expiresAt: 0 };

async function getOutletMap() {
  const now = Date.now();
  if (_outletCache.data && _outletCache.expiresAt > now) {
    return _outletCache.data;
  }

  const { data, error } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("is_active", true);

  if (error || !data) {
    console.error("⚠️  Failed to fetch outlets from Supabase:", error?.message);
    return new Map();
  }

  const map = new Map(data.map((o) => [o.name.toLowerCase(), o.id]));
  _outletCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

/**
 * Fetches active menu items from Supabase, returning a map of name → price.
 * Cached for 5 minutes.
 *
 * @returns {Promise<Map<string, number>>} menu item name (lowercase) → price
 */
let _menuItemCache = { data: null, expiresAt: 0 };

async function getMenuItemPriceMap() {
  const now = Date.now();
  if (_menuItemCache.data && _menuItemCache.expiresAt > now) {
    return _menuItemCache.data;
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select("name, price")
    .eq("is_active", true);

  if (error || !data) {
    console.error("⚠️  Failed to fetch menu items:", error?.message);
    return new Map();
  }

  const map = new Map(data.map((m) => [m.name.toLowerCase(), m.price]));
  _menuItemCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

/**
 * Fetches expense categories from Supabase.
 *
 * @returns {Promise<Map<string, string>>} category name (lowercase) → category id
 */
let _categoryCache = { data: null, expiresAt: 0 };

async function getCategoryMap() {
  const now = Date.now();
  if (_categoryCache.data && _categoryCache.expiresAt > now) {
    return _categoryCache.data;
  }

  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("type", "expense");

  if (error || !data) {
    console.error("⚠️  Failed to fetch categories:", error?.message);
    return new Map();
  }

  const map = new Map(data.map((c) => [c.name.toLowerCase(), c.id]));
  _categoryCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

/**
 * Looks up the outlet id by name. If not found, returns null and the caller
 * should reply with an ⚠️ error.
 *
 * @param {string} outletName
 * @returns {Promise<string | null>}
 */
async function resolveOutletId(outletName) {
  const outlets = await getOutletMap();
  return outlets.get(outletName.toLowerCase()) ?? null;
}

/**
 * Looks up menu item price. If item not found, returns null.
 *
 * @param {string} itemName
 * @returns {Promise<number | null>}
 */
async function getMenuItemPrice(itemName) {
  const menu = await getMenuItemPriceMap();
  return menu.get(itemName.toLowerCase()) ?? null;
}

/**
 * Looks up category id by name. Falls back to the default expense category
 * from env or "General".
 *
 * @param {string} [categoryName]
 * @returns {Promise<string | null>}
 */
async function resolveCategoryId(categoryName) {
  const categories = await getCategoryMap();

  if (categoryName) {
    const found = categories.get(categoryName.toLowerCase());
    if (found) return found;
  }

  // Fall back to default
  const defaultName = (process.env.DEFAULT_EXPENSE_CATEGORY ?? "General").toLowerCase();
  return categories.get(defaultName) ?? null;
}

/**
 * Builds a normalized item-signature string for duplicate detection.
 * - SALE: "itemName|quantity|price" per item, joined by "||"
 * - EXPENSE: "itemName|price" per item, joined by "||"
 *
 * @param {"SALE" | "EXPENSE"} type
 * @param {Array<any>} items
 * @returns {string}
 */
function buildItemSignature(type, items) {
  return items
    .map((it) => {
      const name = it.itemName.toLowerCase();
      if (type === "SALE") {
        return `${name}|${it.quantity}|${it.price}`;
      } else {
        return `${name}|${it.price}`;
      }
    })
    .sort()
    .join("||");
}

/**
 * Checks whether a duplicate entry (same outlet, date, total, and items)
 * already exists in the database.
 *
 * For SALE: compares outlet_id + date + total_revenue AND item signatures
 *           via a subquery on sale_items (item_name, quantity, price).
 * For EXPENSE: compares outlet_id + date + amount AND item signatures
 *              (each expense row has one item; multiple rows = multiple items).
 *
 * @param {"SALE" | "EXPENSE"} type
 * @param {string} outletId
 * @param {string} date  — YYYY-MM-DD
 * @param {number} total — total_revenue (SALE) or sum of amounts (EXPENSE)
 * @param {Array<any>} items
 * @returns {Promise<boolean>} true if duplicate found, false otherwise
 */
async function checkDuplicate(type, outletId, date, total, items) {
  const sig = buildItemSignature(type, items);

  if (type === "SALE") {
    // Find sales with same outlet, date, and total
    const { data: sales, error: saleErr } = await supabase
      .from("sales")
      .select("id, sale_items(item_name, quantity, price)")
      .eq("outlet_id", outletId)
      .eq("date", date)
      .eq("total_revenue", total);

    if (saleErr || !sales) return false;

    for (const sale of sales) {
      const existingSig = buildItemSignature(
        "SALE",
        sale.sale_items.map((si) => ({
          itemName: si.item_name,
          quantity: si.quantity,
          price: si.price,
        }))
      );
      if (existingSig === sig) return true;
    }
    return false;
  } else {
    // EXPENSE: each item is a separate row
    // Find expense entries with same outlet, date, and total
    const { data: expenses, error: expenseErr } = await supabase
      .from("expenses")
      .select("id, item_name:notes, amount") // notes field stores "Telegram bot: {itemName}"
      .eq("outlet_id", outletId)
      .eq("date", date);

    if (expenseErr || !expenses) return false;

    // Group by sale/entry: expenses from the same bot entry share a created_at window
    // We use a simpler approach: find rows that, when grouped by some identifier,
    // have matching item signatures.
    // Since there's no grouping column, we compare the raw rows directly.
    // If the same item/amount appears the same number of times, it's a duplicate.

    // Build a signature for the expense set: sorted list of "itemName|amount"
    const expenseSig = items
      .map((it) => `${it.itemName.toLowerCase()}|${it.price}`)
      .sort()
      .join("||");

    // Find if any expense row with the same date+outlet+total has matching item
    // We check if there's a set of expense rows with the same count of each item
    const { data: matchingExpenses, error: matchErr } = await supabase
      .from("expenses")
      .select("notes, amount")
      .eq("outlet_id", outletId)
      .eq("date", date);

    if (matchErr || !matchingExpenses) return false;

    // Count items in DB vs submitted
    const dbItemCounts = {};
    for (const exp of matchingExpenses) {
      // notes format: "Telegram bot: {itemName}"
      const itemName = exp.notes?.replace("Telegram bot: ", "").toLowerCase() ?? "";
      const key = `${itemName}|${exp.amount}`;
      dbItemCounts[key] = (dbItemCounts[key] ?? 0) + 1;
    }

    const submitItemCounts = {};
    for (const it of items) {
      const key = `${it.itemName.toLowerCase()}|${it.price}`;
      submitItemCounts[key] = (submitItemCounts[key] ?? 0) + 1;
    }

    // Compare counts
    const dbKeys = Object.keys(dbItemCounts).sort().join("||");
    const subKeys = Object.keys(submitItemCounts).sort().join("||");

    // Also verify total matches
    const dbTotal = matchingExpenses.reduce((s, e) => s + e.amount, 0);
    if (Math.round(dbTotal * 100) !== Math.round(total * 100)) return false;

    return dbKeys === subKeys;
  }
}

/**
 * Records a SALE in Supabase:
 *   1. Inserts a row in `sales` (outlet_id, date, total_revenue, notes).
 *   2. Inserts one row per item in `sale_items` (sale_id, item_name, qty, price).
 *
 * @param {string} outletId
 * @param {string} date  — YYYY-MM-DD
 * @param {Array<{itemName: string, quantity: number, price: number}>} items
 * @param {number} total
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function recordSale(outletId, date, items, total) {
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      outlet_id: outletId,
      date,
      total_revenue: total,
      notes: items.map(it => it.quantity > 1 ? `${it.itemName} ${it.quantity}` : it.itemName).join(", "),
    })
    .select("id")
    .single();

  if (saleErr || !sale) {
    return { ok: false, error: `Sale insert failed: ${saleErr?.message}` };
  }

  const saleItemsRows = items.map((it) => ({
    sale_id: sale.id,
    item_name: it.itemName,
    quantity: it.quantity,
    price: it.price,
  }));

  const { error: itemsErr } = await supabase.from("sale_items").insert(saleItemsRows);

  if (itemsErr) {
    // Rollback: delete the sale row we just inserted
    await supabase.from("sales").delete().eq("id", sale.id);
    return { ok: false, error: `Sale items insert failed: ${itemsErr.message}` };
  }

  return { ok: true };
}

/**
 * Records an EXPENSE in Supabase.
 * Each line item becomes a separate expense row with the same date and notes.
 *
 * @param {string} outletId
 * @param {string | null} categoryId
 * @param {string} date  — YYYY-MM-DD
 * @param {Array<{itemName: string, price: number}>} items
 * @param {number} total
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function recordExpense(outletId, categoryId, date, items, total) {
  const rows = items.map((it) => ({
    outlet_id: outletId,
    category_id: categoryId,
    amount: it.price,
    date,
    notes: `Telegram bot: ${it.itemName}`,
  }));

  const { error: expenseErr } = await supabase.from("expenses").insert(rows);

  if (expenseErr) {
    return { ok: false, error: `Expense insert failed: ${expenseErr.message}` };
  }

  return { ok: true };
}

// ─── Message Handler ─────────────────────────────────────────────────────────

/**
 * Main handler — called for every message the bot receives.
 */
bot.on("message", async (msg) => {
  // Ignore non-text messages (photos, stickers, etc.)
  if (!msg.text || !msg.chat) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  // ── Group ID allowlist check ───────────────────────────────────────────
  if (ALLOWED_GROUP_IDS.size > 0 && !ALLOWED_GROUP_IDS.has(chatId)) {
    console.log(`📪 Message from unauthorized group ${chatId} — ignored.`);
    return;
  }

  // ── Ignore very short messages (not a transaction) ───────────────────
  if (text.length < 10) return;

  // ── Quick check: must start with SALE or EXPENSE ─────────────────────
  const firstWord = text.split(/\s/)[0].toUpperCase();
  if (firstWord !== "SALE" && firstWord !== "EXPENSE") return;

  console.log(`\n📥 [${new Date().toISOString()}] ${msg.chat.title ?? "DM"} / ${msg.from?.first_name}: ${text.slice(0, 80)}`);

  // ── Parse ALL transactions in the message ─────────────────────────────────
  const parsedResults = parseAll(text);

  // Process each transaction block
  for (const parsed of parsedResults) {
    if (!parsed.valid) {
      const reply = formatErrorReply(parsed);
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      continue;
    }

    // ── Resolve outlet ────────────────────────────────────────────────────
    const outletId = await resolveOutletId(parsed.outletName);

    if (!outletId) {
      const knownOutlets = await getOutletMap();
      const names = Array.from(knownOutlets.keys()).join(", ") || "(none found)";
      const reply = formatErrorReply({
        valid: false,
        error: `Unknown outlet: "${parsed.outletName}"`,
        details: `Known outlets: ${names}. Check spelling or add the outlet in Cafe Connect first.`,
      });
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      continue;
    }

    // ── For SALE: validate each item against menu_items table ─────────────
    if (parsed.type === "SALE") {
      const unknownItems = [];

      for (const item of parsed.items) {
        const price = await getMenuItemPrice(item.itemName);
        if (price === null) {
          unknownItems.push(item.itemName);
        }
      }

      if (unknownItems.length > 0) {
        const reply = formatErrorReply({
          valid: false,
          error: `Unknown item(s): "${unknownItems.join(", ")}"`,
          details:
            "Add these items to the Menu Items list in Cafe Connect before logging a sale that includes them.",
        });
        await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
        continue;
      }
    }

    // ── For EXPENSE: resolve category ─────────────────────────────────────
    let categoryId = null;
    if (parsed.type === "EXPENSE") {
      categoryId = await resolveCategoryId(parsed.categoryName);
      if (!categoryId) {
        const reply = formatErrorReply({
          valid: false,
          error: "No expense category found",
          details:
            `Add at least one category with type "expense" in Cafe Connect, or set DEFAULT_EXPENSE_CATEGORY env var.`,
        });
        await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
        continue;
      }
    }

    // ── Duplicate detection ───────────────────────────────────────────────
    const isDuplicate = await checkDuplicate(
      parsed.type,
      outletId,
      parsed.date,
      parsed.parsedTotal,
      parsed.items
    );

    if (isDuplicate) {
      const reply = `⚠️ Duplicate entry detected — this data was already logged today.`;
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      continue;
    }

    // ── Write to Supabase ─────────────────────────────────────────────────
    let recordResult;
    if (parsed.type === "SALE") {
      recordResult = await recordSale(outletId, parsed.date, parsed.items, parsed.parsedTotal);
    } else {
      recordResult = await recordExpense(outletId, categoryId, parsed.date, parsed.items, parsed.parsedTotal);
    }

    if (!recordResult.ok) {
      const reply = formatErrorReply({
        valid: false,
        error: "Database write failed",
        details: recordResult.error,
      });
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      continue;
    }

    // ── Success reply ──────────────────────────────────────────────────────
    const reply = formatSuccessReply(parsed);
    await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
    console.log(`✅ [${new Date().toISOString()}] ${parsed.type} recorded — ${parsed.outletName} (${parsed.date}) — ₹${parsed.parsedTotal}`);
  } // end forEach transaction block
});

// ─── Error Handling ─────────────────────────────────────────────────────────

bot.on("polling_error", (err) => {
  console.error("❌ Telegram polling error:", err.message);
});

bot.on("error", (err) => {
  console.error("❌ Bot error:", err.message);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const shutdown = () => {
  console.log("\n👋 Shutting down bot...");
  bot.stopPolling();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
