// Route protection: verifies the Supabase session for /admin, redirects to /admin/login if absent
// and away from /admin if the user isn't on the admin allow-list.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { isAdminEmail } from "@/lib/auth/admins";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminLogin = request.nextUrl.pathname === "/admin/login";
  if (request.nextUrl.pathname.startsWith("/admin") && !isAdminLogin) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    // Signed in but not on the admin allow-list (e.g. a client): send them away.
    if (!isAdminEmail(user.email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = { matcher: ["/admin/:path*"] };
