// Route protection. Phase 0.4 adds the real Supabase session check for /admin.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  // TODO Phase 0.4: verify Supabase session for /admin, redirect to /login if absent.
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
