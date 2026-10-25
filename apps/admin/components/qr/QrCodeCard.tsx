"use client";

import React, { useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Card, Button } from "@pathway/ui";

export interface QrCodeCardProps {
  title: string;
  description?: string;
  value: string;
  size?: number;
  /** When true, render only the inner content (no Card wrapper) for embedding. */
  embedded?: boolean;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function truncateUrl(url: string, maxLen = 48): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "...";
}

export function QrCodeCard({
  title,
  description,
  value,
  size = 224,
  embedded = false,
}: QrCodeCardProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const handleCopy = async () => {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied");
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus("Failed to copy");
    }
  };

  const handleDownload = () => {
    setDownloadStatus(null);
    const container = qrRef.current;
    const svg = container?.querySelector("svg");
    if (!svg) {
      setDownloadStatus("Could not get QR image");
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "parent-signup-qr.svg";
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus("Downloaded");
      setTimeout(() => setDownloadStatus(null), 2000);
    } catch {
      setDownloadStatus("Download failed");
    }
  };

  const handlePrint = () => {
    const container = qrRef.current;
    const svg = container?.querySelector("svg");
    if (!svg) return;
    const svgString = new XMLSerializer().serializeToString(svg);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>${escapeHtml(title)}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif;">
          <h1 style="margin-bottom:1rem;font-size:1.25rem;">${escapeHtml(title)}</h1>
          <div>${svgString}</div>
          <p style="margin-top:1rem;font-size:0.75rem;color:#666;word-break:break-all;max-width:20rem;text-align:center;">${escapeHtml(value)}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const inner = (
    <div className="flex flex-col items-center gap-4">
      <div ref={qrRef} className="rounded-md bg-white p-3">
        <QRCode value={value} size={size} level="M" />
      </div>
      <p className="text-xs text-text-muted break-all text-center max-w-xs">
        {truncateUrl(value)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          aria-label="Copy signup link"
          className="focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Copy link
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleDownload}
          aria-label="Download QR code as SVG"
          className="focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Download SVG
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePrint}
          aria-label="Print QR code"
          className="focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Print
        </Button>
      </div>
      {(copyStatus || downloadStatus) && (
        <p className="text-sm text-text-muted" role="status">
          {copyStatus ?? downloadStatus}
        </p>
      )}
    </div>
  );

  if (embedded) return inner;
  return (
    <Card title={title} description={description}>
      {inner}
    </Card>
  );
}
