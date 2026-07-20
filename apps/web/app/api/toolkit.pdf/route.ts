import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ToolkitPdfDocument } from "../../../lib/toolkit-pdf-document";
import { redeemDownloadToken } from "../../../lib/redeem-download-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 }
    );
  }

  try {
    const res = await redeemDownloadToken(token);

    if (!res.ok) {
      if (res.status === 401) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Unable to validate token" },
        { status: 502 }
      );
    }

    const { orgName: apiOrgName } = res.data;
    const orgNameFromQuery = request.nextUrl.searchParams.get("orgName");
    const orgName = apiOrgName ?? orgNameFromQuery ?? null;

    const doc = React.createElement(ToolkitPdfDocument, { orgName });
    const pdfBuffer = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="nexsteps-toolkit-v2.pdf"',
      },
    });
  } catch (err) {
    console.error("[toolkit.pdf] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
