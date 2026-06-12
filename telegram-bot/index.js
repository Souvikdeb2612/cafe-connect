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

async function sendReply(chatId, messageId, text) {
  try {
    return await bot.sendMessage(chatId, text, { reply_to_message_id: messageId });
  } catch (error) {
    const description = error?.response?.body?.description || error?.message || "unknown error";
    if (description.includes("message to be replied not found")) {
      console.warn(`Reply target missing for message ${messageId}; sending without reply_to_message_id.`);
      return bot.sendMessage(chatId, text);
    }
    throw error;
  }
}

// ─── Supabase Helpers ────────────────────────────────────────────────────────

class LookupFetchError extends Error {
  constructor(label, error) {
    super(`Failed to fetch ${label}: ${error?.details || error?.message || "unknown error"}`);
    this.name = "LookupFetchError";
    this.label = label;
    this.cause = error;
  }
}

function createLookupCache(label) {
  return { label, data: null };
}

async function loadLookupMap(cache, fetchRows, toEntry) {
  try {
    const rows = await fetchRows();
    const map = new Map(rows.map(toEntry));
    cache.data = map;
    console.log(`ℹ️  Loaded ${cache.label}: ${map.size} row(s).`);
    return map;
  } catch (error) {
    const reason = error?.details || error?.message || "unknown error";
    console.error(`⚠️  Failed to fetch ${cache.label}:`, reason);
    if (cache.data) {
      console.warn(`↩️  Using stale ${cache.label} cache: ${cache.data.size} row(s).`);
      return cache.data;
    }
    throw new LookupFetchError(cache.label, error);
  }
}

function buildLookupUnavailableReply(subject) {
  return formatErrorReply({
    valid: false,
    error: `${subject} lookup unavailable`,
    details: "Supabase fetch failed. Retry shortly. Existing Cafe Connect data was not changed.",
  });
}

let _outletCache = createLookupCache("outlets");

async function getOutletMap() {
  return loadLookupMap(
    _outletCache,
    async () => {
      const { data, error } = await supabase
        .from("outlets")
        .select("id, name")
        .eq("is_active", true);

      if (error || !data) throw error ?? new Error("No outlet data returned");
      return data;
    },
    (outlet) => [outlet.name.toLowerCase(), outlet.id]
  );
}

let _menuItemCache = createLookupCache("menu items");

async function getMenuItemPriceMap() {
  return loadLookupMap(
    _menuItemCache,
    async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("name, price")
        .eq("is_active", true);

      if (error || !data) throw error ?? new Error("No menu item data returned");
      return data;
    },
    (item) => [item.name.toLowerCase(), item.price]
  );
}

let _categoryCache = createLookupCache("categories");

async function getCategoryMap() {
  return loadLookupMap(
    _categoryCache,
    async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("type", "expense");

      if (error || !data) throw error ?? new Error("No category data returned");
      return data;
    },
    (category) => [category.name.toLowerCase(), category.id]
  );
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

  const defaultName = (process.env.DEFAULT_EXPENSE_CATEGORY ?? "Grocery").toLowerCase();
  return categories.get(defaultName) ?? null;
}

async function getLookupSnapshot(type) {
  const [outlets, categories, menuItems] = await Promise.all([
    getOutletMap(),
    type === "EXPENSE" ? getCategoryMap() : Promise.resolve(null),
    type === "SALE" ? getMenuItemPriceMap() : Promise.resolve(null),
  ]);

  return { outlets, categories, menuItems };
}

async function warmLookupCaches() {
  try {
    await getLookupSnapshot("SALE");
    await getLookupSnapshot("EXPENSE");
    console.log("ℹ️  Lookup caches warmed.");
  } catch (error) {
    console.error("⚠️  Lookup warmup incomplete:", error.message);
  }
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
    // Expenses are now stored as a single row with combined notes + total amount
    const newNotes = items.map((it) => `${it.itemName} @${it.price}`).join(", ");

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("notes, amount")
      .eq("outlet_id", outletId)
      .eq("date", date)
      .eq("amount", total);

    if (error || !expenses) return false;

    return expenses.some((exp) => exp.notes === newNotes);
  }
}

// ─── Total Funds Calculator ──────────────────────────────────────────────────

async function getTotalFunds() {
  const [salesRes, expensesRes, capitalRes] = await Promise.all([
    supabase.from("sales").select("total_revenue"),
    supabase.from("expenses").select("amount"),
    supabase.from("capital_additions").select("amount"),
  ]);

  const totalSales = (salesRes.data || []).reduce((s, r) => s + Number(r.total_revenue), 0);
  const totalExpenses = (expensesRes.data || []).reduce((s, r) => s + Number(r.amount), 0);
  const totalCapital = (capitalRes.data || []).reduce((s, r) => s + Number(r.amount), 0);

  return totalSales + totalCapital - totalExpenses;
}

// ─── DB Writers ──────────────────────────────────────────────────────────────

async function recordSale(outletId, date, items, total) {
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      outlet_id: outletId,
      date,
      total_revenue: total,
      notes: items.map(it => `${it.itemName} x${it.quantity}`).join(", "),
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
  const notes = items.map((it) => `${it.itemName} @${it.price}`).join(", ");

  const { error } = await supabase.from("expenses").insert({
    outlet_id: outletId,
    category_id: categoryId,
    amount: total,
    date,
    notes,
  });

  if (error) {
    return { ok: false, error: `Expense insert failed: ${error.message}` };
  }

  return { ok: true };
}

async function checkGroceryDuplicate(outletId, date, items) {
  const { data: existing } = await supabase
    .from("grocery_purchases")
    .select("item_name, quantity, unit, cost")
    .eq("outlet_id", outletId)
    .eq("date", date);

  if (!existing || existing.length === 0) return false;

  return items.every((it) => {
    const cost = Math.round(it.quantity * it.price * 100) / 100;
    return existing.some(
      (e) =>
        e.item_name.toLowerCase() === it.itemName.toLowerCase() &&
        Number(e.quantity) === it.quantity &&
        (e.unit ?? null) === (it.unit ?? null) &&
        Math.abs(Number(e.cost) - cost) < 0.01
    );
  });
}

async function recordGrocery(outletId, date, items) {
  const rows = items.map((it) => ({
    outlet_id: outletId,
    item_name: it.itemName,
    quantity: it.quantity,
    unit: it.unit ?? null,
    cost: Math.round(it.quantity * it.price * 100) / 100,
    date,
  }));

  const { error } = await supabase.from("grocery_purchases").insert(rows);
  if (error) return { ok: false, error: `Grocery insert failed: ${error.message}` };
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
  if (firstWord !== "SALE" && firstWord !== "EXPENSE" && firstWord !== "GROCERY") return;

  console.log(`\n📥 [${new Date().toISOString()}] ${msg.chat.title ?? "DM"} / ${msg.from?.first_name}: ${text.slice(0, 80)}`);

  try {
    const parsedResults = parseAll(text);

    for (const parsed of parsedResults) {
      if (!parsed.valid) {
        await sendReply(msg.chat.id, msg.message_id, formatErrorReply(parsed));
        continue;
      }

      let outletId;
      let categoryId = null;

      try {
        const lookups = await getLookupSnapshot(parsed.type);

        outletId = lookups.outlets.get(parsed.outletName.toLowerCase()) ?? null;
        if (!outletId) {
          const names = Array.from(lookups.outlets.keys()).join(", ") || "(none)";
          await sendReply(msg.chat.id, msg.message_id, formatErrorReply({
            valid: false,
            error: `Unknown outlet: "${parsed.outletName}"`,
            details: `Known outlets: ${names}. Check spelling or add it in Cafe Connect first.`,
          }));
          continue;
        }

        if (parsed.type === "SALE") {
          const unknownItems = parsed.items
            .filter((item) => !lookups.menuItems?.has(item.itemName.toLowerCase()))
            .map((item) => item.itemName);

          if (unknownItems.length > 0) {
            await sendReply(msg.chat.id, msg.message_id, formatErrorReply({
              valid: false,
              error: `Unknown item(s): "${unknownItems.join(", ")}"`,
              details: "Add these items to Menu Items in Cafe Connect before logging this sale.",
            }));
            continue;
          }
        }

        if (parsed.type === "EXPENSE") {
          const categoryName = parsed.categoryName
            ? parsed.categoryName.toLowerCase()
            : (process.env.DEFAULT_EXPENSE_CATEGORY ?? "Grocery").toLowerCase();

          categoryId = lookups.categories?.get(categoryName) ?? null;
          if (!categoryId) {
            const names = Array.from(lookups.categories?.keys() ?? []).join(", ") || "(none)";
            const hint = parsed.categoryName
              ? `Unknown category: "${parsed.categoryName}".`
              : "No category specified and no default found.";
            await sendReply(msg.chat.id, msg.message_id, formatErrorReply({
              valid: false,
              error: hint,
              details: `Known categories: ${names}.\nAdd "category: [name]" after the header, or add categories in Cafe Connect.`,
            }));
            continue;
          }
        }
      } catch (error) {
        if (error instanceof LookupFetchError) {
          await sendReply(msg.chat.id, msg.message_id, buildLookupUnavailableReply("Lookup data"));
          continue;
        }
        throw error;
      }

      const isDuplicate = parsed.type === "GROCERY"
        ? await checkGroceryDuplicate(outletId, parsed.date, parsed.items)
        : await checkDuplicate(parsed.type, outletId, parsed.date, parsed.parsedTotal, parsed.items);

      if (isDuplicate) {
        await sendReply(msg.chat.id, msg.message_id, "⚠️ Duplicate entry detected — this data was already logged.");
        continue;
      }

      let recordResult;
      if (parsed.type === "SALE") {
        recordResult = await recordSale(outletId, parsed.date, parsed.items, parsed.parsedTotal);
      } else if (parsed.type === "GROCERY") {
        recordResult = await recordGrocery(outletId, parsed.date, parsed.items);
      } else {
        recordResult = await recordExpense(outletId, categoryId, parsed.date, parsed.items, parsed.parsedTotal);
      }

      if (!recordResult.ok) {
        await sendReply(msg.chat.id, msg.message_id, formatErrorReply({
          valid: false,
          error: "Database write failed",
          details: recordResult.error,
        }));
        continue;
      }

      let fundsText = "";
      try {
        const totalFunds = await getTotalFunds();
        fundsText = `\n\n💰 Updated Funds: ₹${totalFunds.toLocaleString("en-IN")}`;
      } catch (e) {
        console.error("⚠️  Failed to fetch total funds:", e.message);
      }

      await sendReply(msg.chat.id, msg.message_id, formatSuccessReply(parsed) + fundsText);
      console.log(`✅ [${new Date().toISOString()}] ${parsed.type} recorded — ${parsed.outletName} (${parsed.date}) — ₹${parsed.parsedTotal}`);
    }
  } catch (error) {
    console.error("❌ Message handler failed:", error);
    try {
      await sendReply(msg.chat.id, msg.message_id, "⚠️ Bot hit an unexpected error. Retry same message once.");
    } catch (replyError) {
      console.error("❌ Failed to send fallback error reply:", replyError?.message || replyError);
    }
  }
});

// ─── Error Handling ─────────────────────────────────────────────────────────

bot.on("polling_error", (err) => console.error("❌ Telegram polling error:", err.message));
bot.on("error", (err) => console.error("❌ Bot error:", err.message));

void warmLookupCaches();

const shutdown = () => { console.log("\n👋 Shutting down..."); bot.stopPolling(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
