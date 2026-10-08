import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Allow auth routes, login page, and health/static assets without a session.
const isPublicRoute = createRouteMatcher([
  "/login",
  "/health",
  "/favicon.ico",
  "/(.*).png",
  "/(.*).jpg",
  "/(.*).jpeg",
  "/(.*).svg",
  "/(.*).css",
  "/(.*).js",
]);

export default clerkMiddleware(async (auth, req) => {
  // API handlers authenticate themselves, but Clerk still needs to run here
  // so their auth() calls can read the request context.
  if (isPublicRoute(req) || req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|login).*)"],
};
