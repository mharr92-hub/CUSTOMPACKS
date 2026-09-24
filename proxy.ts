import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAuthConfigured, LOCAL_SESSION_COOKIE, verifyLocalSession } from "@/lib/auth/local-session";

/**
 * Guardia del panel interno: sin sesión, /admin redirige al login. Con
 * Supabase además refresca las cookies de sesión. La autorización por rol se
 * verifica en cada layout, página y Server Action (lib/auth.requireStaff).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublicAdminPath = pathname.startsWith("/admin/ingresar") || pathname.startsWith("/admin/sin-acceso");
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (isSupabaseAuthConfigured()) {
    const supabase = createServerClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_ANON_KEY!.trim(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } else {
    signedIn = (await verifyLocalSession(request.cookies.get(LOCAL_SESSION_COOKIE)?.value)) !== null;
  }

  if (!signedIn && !isPublicAdminPath) {
    const login = new URL("/admin/ingresar", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
