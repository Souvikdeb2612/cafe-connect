import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rfzcqgrjtjsckbzgaowi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Jdw2ohhNctE5zR0N60hOfQ_kqKHFpX-";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
