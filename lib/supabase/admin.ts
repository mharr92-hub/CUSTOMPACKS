import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Cliente con service role para Storage (URLs firmadas) y administración de
 * usuarios (invitaciones). Solo servidor. null sin credenciales.
 */
export function createSupabaseAdminClient() {
  const { supabase } = getServerEnv();
  if (!supabase) return null;
  return createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
