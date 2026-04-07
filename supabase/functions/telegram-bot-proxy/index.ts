import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// A shared secret the bot must send to authenticate requests
const BOT_SECRET = Deno.env.get("TELEGRAM_BOT_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get("x-bot-secret");
    if (!BOT_SECRET || authHeader !== BOT_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, data } = body;

    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "get_outlets") {
      const { data: outlets, error } = await supabase
        .from("outlets")
        .select("id, name")
        .eq("is_active", true);

      if (error) throw error;
      return jsonResponse({ outlets });
    }

    if (action === "get_menu_items") {
      const { data: items, error } = await supabase
        .from("menu_items")
        .select("name, price")
        .eq("is_active", true);

      if (error) throw error;
      return jsonResponse({ items });
    }

    if (action === "get_categories") {
      const { data: categories, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("type", "expense");

      if (error) throw error;
      return jsonResponse({ categories });
    }

    if (action === "record_sale") {
      const { outlet_id, items, total } = data;
      const today = new Date().toISOString().split("T")[0];

      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          outlet_id,
          date: today,
          total_revenue: total,
          notes: `Telegram bot entry — ${items.length} item(s)`,
        })
        .select("id")
        .single();

      if (saleErr) throw saleErr;

      const saleItemsRows = items.map((it: any) => ({
        sale_id: sale.id,
        item_name: it.itemName,
        quantity: it.quantity,
        price: it.price,
      }));

      const { error: itemsErr } = await supabase
        .from("sale_items")
        .insert(saleItemsRows);

      if (itemsErr) {
        await supabase.from("sales").delete().eq("id", sale.id);
        throw itemsErr;
      }

      return jsonResponse({ ok: true });
    }

    if (action === "record_expense") {
      const { outlet_id, category_id, items, total } = data;
      const today = new Date().toISOString().split("T")[0];

      const rows = items.map((it: any) => ({
        outlet_id,
        category_id,
        amount: it.price,
        date: today,
        notes: `Telegram bot: ${it.itemName}`,
      }));

      const { error } = await supabase.from("expenses").insert(rows);
      if (error) throw error;

      return jsonResponse({ ok: true });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
