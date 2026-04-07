/**
 * Cafe Connect Telegram Bot — Entry Point
 * =========================================
 *
 * Listens for SALE / EXPENSE messages in a Telegram group, parses them,
 * validates totals, writes to Supabase, and replies with ✅ or ⚠️.
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
import { parseMessage, formatSuccessReply, formatErrorReply } from "./parser.js";

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
 * Records a SALE in Supabase:
 *   1. Inserts a row in `sales` (outlet_id, date, total_revenue, notes).
 *   2. Inserts one row per item in `sale_items` (sale_id, item_name, qty, price).
 *
 * @param {string} outletId
 * @param {Array<{itemName: string, quantity: number, price: number}>} items
 * @param {number} total
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function recordSale(outletId, items, total, dateOverride) {
  const today = dateOverride || new Date().toISOString().split("T")[0];

  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      outlet_id: outletId,
      date: today,
      total_revenue: total,
      notes: `Telegram bot entry — ${items.length} item(s)`,
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
 * @param {Array<{itemName: string, price: number}>} items
 * @param {number} total
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function recordExpense(outletId, categoryId, items, total, dateOverride) {
  const today = dateOverride || new Date().toISOString().split("T")[0];

  const rows = items.map((it) => ({
    outlet_id: outletId,
    category_id: categoryId,
    amount: it.price,
    date: today,
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

  // ── Parse the message ─────────────────────────────────────────────────
  const parsed = parseMessage(text);

  if (!parsed.valid) {
    const reply = formatErrorReply(parsed);
    await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
    return;
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
    return;
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
      return;
    }
  }

  // ── For EXPENSE: resolve category ─────────────────────────────────────
  let categoryId = null;
  if (parsed.type === "EXPENSE") {
    categoryId = await resolveCategoryId();
    if (!categoryId) {
      const reply = formatErrorReply({
        valid: false,
        error: "No expense category found",
        details:
          `Add at least one category with type "expense" in Cafe Connect, or set DEFAULT_EXPENSE_CATEGORY env var.`,
      });
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      return;
    }
  }

  // ── Write to Supabase ─────────────────────────────────────────────────
  let recordResult;
  if (parsed.type === "SALE") {
    recordResult = await recordSale(outletId, parsed.items, parsed.parsedTotal, parsed.date);
  } else {
    recordResult = await recordExpense(outletId, categoryId, parsed.items, parsed.parsedTotal, parsed.date);
  }

  if (!recordResult.ok) {
    const reply = formatErrorReply({
      valid: false,
      error: "Database write failed",
      details: recordResult.error,
    });
    await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
    return;
  }

  // ── Success reply ──────────────────────────────────────────────────────
  const reply = formatSuccessReply(parsed);
  await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
  console.log(`✅ [${new Date().toISOString()}] ${parsed.type} recorded — ${parsed.outletName} — ₹${parsed.parsedTotal}`);
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
