import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { redeemLocalMagicLink } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/urls";

export const runtime = "nodejs";

/** Destino de los enlaces mágicos (Supabase `token_hash` o token local). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"), "/admin");
  const fail = NextResponse.redirect(new URL("/admin/ingresar?error=link", request.url));

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") ?? "magiclink") as EmailOtpType;
    const code = params.get("code");
    if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return fail;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail;
    } else {
      return fail;
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  const token = params.get("token");
  if (!token) return fail;
  const result = await redeemLocalMagicLink(token);
  if (!result.ok) return fail;
  return NextResponse.redirect(new URL(result.next, request.url));
}
