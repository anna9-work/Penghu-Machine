import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL")
}

if (!supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const GROUP_CODE = import.meta.env.VITE_GROUP_CODE || "catchme_penghu"
export const STORE_NAME = import.meta.env.VITE_STORE_NAME || "澎湖店"