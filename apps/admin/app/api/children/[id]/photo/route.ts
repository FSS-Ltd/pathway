import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const apiBaseUrl =
  process.env.ADMIN_INTERNAL_API_URL ??
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Child ID required" }, { status: 400 });
  }

  const { getToken } = await auth();
  const accessToken = await getToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `${apiBaseUrl.replace(/\/$/, "")}/children/${id}/photo`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to fetch photo" },
      { status: res.status },
    );
  }

  const contentType = res.headers.get("Content-Type") ?? "image/jpeg";
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
