/**
 * Cafe Connect Telegram Bot — Entry Point
 * =========================================
 *
 * Listens for SALE / EXPENSE messages in a Telegram group, parses them,
 * validates totals, and writes to Supabase via an Edge Function proxy.
 *
 * ENVIRONMENT VARIABLES (required)
 * ---------------------------------
 * TELEGRAM_BOT_TOKEN      — bot token from @BotFather
 * EDGE_FUNCTION_URL       — e.g. https://rfzcqgrjtjsckbzgaowi.supabase.co/functions/v1/telegram-bot-proxy
 * TELEGRAM_BOT_SECRET     — shared secret for authenticating with the edge function
 *
 * OPTIONAL
 * --------
 * ALLOWED_GROUP_IDS       — comma-separated list of allowed Telegram group IDs
 * DEFAULT_EXPENSE_CATEGORY — category name for expenses (default: "General")
 * BOT_NAME                — display name used in console logs
 */

import TelegramBot from "node-telegram-bot-api";
import { parseMessage, formatSuccessReply, formatErrorReply } from "./parser.js";

// ─── Environment ────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is required.");
  process.exit(1);
}

const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;
if (!EDGE_FUNCTION_URL) {
  console.error("❌ EDGE_FUNCTION_URL environment variable is required.");
  process.exit(1);
}

const TELEGRAM_BOT_SECRET = process.env.TELEGRAM_BOT_SECRET;
if (!TELEGRAM_BOT_SECRET) {
  console.error("❌ TELEGRAM_BOT_SECRET environment variable is required.");
  process.exit(1);
}

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

// ─── Edge Function Helpers ──────────────────────────────────────────────────

/**
 * Calls the Edge Function proxy with the given action and data.
 *
 * @param {string} action
 * @param {any} [data]
 * @returns {Promise<any>}
 */
async function callProxy(action, data) {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-secret": TELEGRAM_BOT_SECRET,
    },
    body: JSON.stringify({ action, data }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Proxy returned ${res.status}`);
  }
  return json;
}

// ─── Cached Lookups via Proxy ───────────────────────────────────────────────

let _outletCache = { data: null, expiresAt: 0 };

async function getOutletMap() {
  const now = Date.now();
  if (_outletCache.data && _outletCache.expiresAt > now) return _outletCache.data;

  const { outlets } = await callProxy("get_outlets");
  const map = new Map(outlets.map((o) => [o.name.toLowerCase(), o.id]));
  _outletCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

let _menuItemCache = { data: null, expiresAt: 0 };

async function getMenuItemPriceMap() {
  const now = Date.now();
  if (_menuItemCache.data && _menuItemCache.expiresAt > now) return _menuItemCache.data;

  const { items } = await callProxy("get_menu_items");
  const map = new Map(items.map((m) => [m.name.toLowerCase(), m.price]));
  _menuItemCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

let _categoryCache = { data: null, expiresAt: 0 };

async function getCategoryMap() {
  const now = Date.now();
  if (_categoryCache.data && _categoryCache.expiresAt > now) return _categoryCache.data;

  const { categories } = await callProxy("get_categories");
  const map = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  _categoryCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

async function resolveOutletId(outletName) {
  const outlets = await getOutletMap();
  return outlets.get(outletName.toLowerCase()) ?? null;
}

async function getMenuItemPrice(itemName) {
  const menu = await getMenuItemPriceMap();
  return menu.get(itemName.toLowerCase()) ?? null;
}

async function resolveCategoryId(categoryName) {
  const categories = await getCategoryMap();

  if (categoryName) {
    const found = categories.get(categoryName.toLowerCase());
    if (found) return found;
  }

  const defaultName = (process.env.DEFAULT_EXPENSE_CATEGORY ?? "General").toLowerCase();
  return categories.get(defaultName) ?? null;
}

// ─── Message Handler ─────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (!msg.text || !msg.chat) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (ALLOWED_GROUP_IDS.size > 0 && !ALLOWED_GROUP_IDS.has(chatId)) {
    console.log(`📪 Message from unauthorized group ${chatId} — ignored.`);
    return;
  }

  if (text.length < 10) return;

  const firstWord = text.split(/\s/)[0].toUpperCase();
  if (firstWord !== "SALE" && firstWord !== "EXPENSE") return;

  console.log(`\n📥 [${new Date().toISOString()}] ${msg.chat.title ?? "DM"} / ${msg.from?.first_name}: ${text.slice(0, 80)}`);

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

  // ── For SALE: validate items against menu ─────────────────────────────
  if (parsed.type === "SALE") {
    const unknownItems = [];
    for (const item of parsed.items) {
      const price = await getMenuItemPrice(item.itemName);
      if (price === null) unknownItems.push(item.itemName);
    }

    if (unknownItems.length > 0) {
      const reply = formatErrorReply({
        valid: false,
        error: `Unknown item(s): "${unknownItems.join(", ")}"`,
        details: "Add these items to the Menu Items list in Cafe Connect before logging a sale.",
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
        details: `Add at least one category with type "expense" in Cafe Connect, or set DEFAULT_EXPENSE_CATEGORY env var.`,
      });
      await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
      return;
    }
  }

  // ── Write via Edge Function proxy ─────────────────────────────────────
  try {
    if (parsed.type === "SALE") {
      await callProxy("record_sale", {
        outlet_id: outletId,
        items: parsed.items,
        total: parsed.parsedTotal,
      });
    } else {
      await callProxy("record_expense", {
        outlet_id: outletId,
        category_id: categoryId,
        items: parsed.items,
        total: parsed.parsedTotal,
      });
    }
  } catch (err) {
    const reply = formatErrorReply({
      valid: false,
      error: "Database write failed",
      details: err.message,
    });
    await bot.sendMessage(msg.chat.id, reply, { reply_to_message_id: msg.message_id });
    return;
  }

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
