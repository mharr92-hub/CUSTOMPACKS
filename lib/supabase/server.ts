import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

/**
 * Cliente de Supabase ligado a las cookies de la petición (Auth por enlace
 * mágico). Devuelve null si no hay credenciales: la app usa entonces el modo
 * local de lib/auth.
 */
export async function createSupabaseServerClient() {
  const { supabase } = getServerEnv();
  if (!supabase) return null;
  const cookieStore = await cookies();
  return createServerClient(supabase.url, supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}
