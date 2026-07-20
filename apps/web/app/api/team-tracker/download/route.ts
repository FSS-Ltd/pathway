import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { redeemDownloadToken } from "../../../../lib/redeem-download-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workbookPath = path.join(
  process.cwd(),
  "content",
  "resources",
  "Nexsteps_One_Page_Team_Tracker.xlsx",
);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    const redeemed = await redeemDownloadToken(token);
    if (!redeemed.ok) {
      return NextResponse.json(
        { error: redeemed.status === 401 ? "Invalid or expired token" : "Unable to validate token" },
        { status: redeemed.status === 401 ? 401 : 502 },
      );
    }

    const workbook = await readFile(workbookPath);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Nexsteps_One_Page_Team_Tracker.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[team-tracker/download] Error:", error);
    return NextResponse.json({ error: "Unable to download the tracker" }, { status: 500 });
  }
}
