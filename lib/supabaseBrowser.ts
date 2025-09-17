"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createBrowserSupabaseClient(): SupabaseClient {
  if (!url || !anon) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
}
export type { SupabaseClient };
