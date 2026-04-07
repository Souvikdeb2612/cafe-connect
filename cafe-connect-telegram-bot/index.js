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

let _outletCache = { data: null, expiresAt: 0 };

async function getOutletMap() {
  const now = Date.now();
  if (_outletCache.data && _outletCache.expiresAt > now) return _outletCache.data;

  const { data, error } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("is_active", true);

  if (error || !data) {
    console.error("⚠️  Failed to fetch outlets:", error?.message);
    return new Map();
  }

  const map = new Map(data.map((o) => [o.name.toLowerCase(), o.id]));
  _outletCache = { data: map, expiresAt: now + 5 * 60 * 1000 };
  return map;
}

let _menuItemCache = { data: null, expiresAt: 0 };

async function getMenuItemPriceMap() {
  const now = Date.now();
  if (_menuItemCache.data && _menuItemCache.expiresAt > now) return _menuItemCache.data;

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

let _categoryCache = { data: null, expiresAt: 0 };

async function getCategoryMap() {
  const now = Date.now();
  if (_categoryCache.data && _categoryCache.expiresAt > now) return _categoryCache.data;

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

// ─── Duplicate Detection ─────────────────────────────────────────────────────

function buildItemSignature(type, items) {
  return items
    .map((it) => {
      const name = it.itemName.toLowerCase();
      return type === "SALE" ? `${name}|${it.quantity}|${it.price}` : `${name}|${it.price}`;
    })
    .sort()
    .join("||");
}

async function checkDuplicate(type, outletId, date, total, items) {
  const sig = buildItemSignature(type, items);

  if (type === "SALE") {
    const { data: sales, error } = await supabase
      .from("sales")
      .select("id, sale_items(item_name, quantity, price)")
      .eq("outlet_id", outletId)
      .eq("date", date)
      .eq("total_revenue", total);

    if (error || !sales) return false;

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
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("notes, amount")
      .eq("outlet_id", outletId)
      .eq("date", date);

    if (error || !expenses) return false;

    const dbItemCounts = {};
    for (const exp of expenses) {
      const itemName = exp.notes?.replace("Telegram bot: ", "").toLowerCase() ?? "";
      const key = `${itemName}|${exp.amount}`;
      dbItemCounts[key] = (dbItemCounts[key] ?? 0) + 1;
    }

    const submitItemCounts = {};
    for (const it of items) {
      const key = `${it.itemName.toLowerCase()}|${it.price}`;
      submitItemCounts[key] = (submitItemCounts[key] ?? 0) + 1;
    }

    const dbKeys = Object.keys(dbItemCounts).sort().join("||");
    const subKeys = Object.keys(submitItemCounts).sort().join("||");

    const dbTotal = expenses.reduce((s, e) => s + e.amount, 0);
    if (Math.round(dbTotal * 100) !== Math.round(total * 100)) return false;

    return dbKeys === subKeys;
  }
}

// ─── DB Writers ──────────────────────────────────────────────────────────────

async function recordSale(outletId, date, items, total) {
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      outlet_id: outletId,
      date,
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
    await supabase.from("sales").delete().eq("id", sale.id);
    return { ok: false, error: `Sale items insert failed: ${itemsErr.message}` };
  }

  return { ok: true };
}

async function recordExpense(outletId, categoryId, date, items, total) {
  const rows = items.map((it) => ({
    outlet_id: outletId,
    category_id: categoryId,
    amount: it.price,
    date,
    notes: `Telegram bot: ${it.itemName}`,
  }));

  const { error } = await supabase.from("expenses").insert(rows);

  if (error) {
    return { ok: false, error: `Expense insert failed: ${error.message}` };
  }

  return { ok: true };
}

// ─── Message Handler ─────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (!msg.text || !msg.chat) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (ALLOWED_GROUP_IDS.size > 0 && !ALLOWED_GROUP_IDS.has(chatId)) return;
  if (text.length < 10) return;

  const firstWord = text.split(/\s/)[0].toUpperCase();
  if (firstWord !== "SALE" && firstWord !== "EXPENSE") return;

  console.log(`\n📥 [${new Date().toISOString()}] ${msg.chat.title ?? "DM"} / ${msg.from?.first_name}: ${text.slice(0, 80)}`);

  const parsedResults = parseAll(text);

  for (const parsed of parsedResults) {
    if (!parsed.valid) {
      await bot.sendMessage(msg.chat.id, formatErrorReply(parsed), { reply_to_message_id: msg.message_id });
      continue;
    }

    const outletId = await resolveOutletId(parsed.outletName);

    if (!outletId) {
      const knownOutlets = await getOutletMap();
      const names = Array.from(knownOutlets.keys()).join(", ") || "(none)";
      await bot.sendMessage(msg.chat.id, formatErrorReply({
        valid: false,
        error: `Unknown outlet: "${parsed.outletName}"`,
        details: `Known outlets: ${names}. Check spelling or add it in Cafe Connect first.`,
      }), { reply_to_message_id: msg.message_id });
      continue;
    }

    if (parsed.type === "SALE") {
      const unknownItems = [];
      for (const item of parsed.items) {
        const price = await getMenuItemPrice(item.itemName);
        if (price === null) unknownItems.push(item.itemName);
      }

      if (unknownItems.length > 0) {
        await bot.sendMessage(msg.chat.id, formatErrorReply({
          valid: false,
          error: `Unknown item(s): "${unknownItems.join(", ")}"`,
          details: "Add these items to Menu Items in Cafe Connect before logging this sale.",
        }), { reply_to_message_id: msg.message_id });
        continue;
      }
    }

    let categoryId = null;
    if (parsed.type === "EXPENSE") {
      categoryId = await resolveCategoryId(parsed.categoryName);
      if (!categoryId) {
        const categories = await getCategoryMap();
        const names = Array.from(categories.keys()).join(", ") || "(none)";
        const hint = parsed.categoryName
          ? `Unknown category: "${parsed.categoryName}".`
          : "No category specified and no default found.";
        await bot.sendMessage(msg.chat.id, formatErrorReply({
          valid: false,
          error: hint,
          details: `Known categories: ${names}.\nAdd "category: [name]" after the header, or add categories in Cafe Connect.`,
        }), { reply_to_message_id: msg.message_id });
        continue;
      }
    }

    const isDuplicate = await checkDuplicate(parsed.type, outletId, parsed.date, parsed.parsedTotal, parsed.items);
    if (isDuplicate) {
      await bot.sendMessage(msg.chat.id, "⚠️ Duplicate entry detected — this data was already logged.", { reply_to_message_id: msg.message_id });
      continue;
    }

    let recordResult;
    if (parsed.type === "SALE") {
      recordResult = await recordSale(outletId, parsed.date, parsed.items, parsed.parsedTotal);
    } else {
      recordResult = await recordExpense(outletId, categoryId, parsed.date, parsed.items, parsed.parsedTotal);
    }

    if (!recordResult.ok) {
      await bot.sendMessage(msg.chat.id, formatErrorReply({
        valid: false,
        error: "Database write failed",
        details: recordResult.error,
      }), { reply_to_message_id: msg.message_id });
      continue;
    }

    await bot.sendMessage(msg.chat.id, formatSuccessReply(parsed), { reply_to_message_id: msg.message_id });
    console.log(`✅ [${new Date().toISOString()}] ${parsed.type} recorded — ${parsed.outletName} (${parsed.date}) — ₹${parsed.parsedTotal}`);
  }
});

// ─── Error Handling ─────────────────────────────────────────────────────────

bot.on("polling_error", (err) => console.error("❌ Telegram polling error:", err.message));
bot.on("error", (err) => console.error("❌ Bot error:", err.message));

const shutdown = () => { console.log("\n👋 Shutting down..."); bot.stopPolling(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
