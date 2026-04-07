/**
 * Supabase client for Cafe Connect Telegram bot.
 *
 * Uses the same Supabase project as the main Cafe Connect app.
 * Credentials are injected via environment variables so they don't
 * end up in committed code.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);
