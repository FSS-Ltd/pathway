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
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  return NextResponse.next();
});

// API routes do their own auth() check per-handler (see app/api/**/route.ts)
// and are excluded here, matching the previous NextAuth middleware's scope.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|login).*)"],
};
