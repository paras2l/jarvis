import { createClient } from '@supabase/supabase-js'

// ─── Omni-Learning Agent — Supabase Config ────────────────────────────────
// Personal app config — connected to paras's Supabase project

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}

const SUPABASE_URL = env.VITE_SUPABASE_URL ?? 'https://example.supabase.co'
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? 'public-anon-key-not-configured'
export const STORAGE_BUCKET = 'studio-assets'
export const DEFAULT_USER = 'paras'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Cloud features will be limited.')
}

if (env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Supabase] Ignoring VITE_SUPABASE_SERVICE_ROLE_KEY in client runtime. Privileged writes must run server-side.')
}

// Public client (read/write for normal ops)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
