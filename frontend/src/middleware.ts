import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// app.b20factory.xyz/ should open the app directly (the launch + terminal surface),
// while www / apex open the landing. Only runs on "/" so assets are untouched.
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (host.startsWith("app.") && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
