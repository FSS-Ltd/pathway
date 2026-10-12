"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Card } from "@pathway/ui";
import {
  AdminAnnouncementDetail,
  fetchAnnouncementById,
} from "../../../lib/api-client";

const statusTone: Record<
  AdminAnnouncementDetail["status"],
  "default" | "accent" | "success" | "warning"
> = {
  draft: "default",
  scheduled: "accent",
  sent: "success",
  archived: "default",
  unknown: "warning",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function NoticeDetailPage() {
  const params = useParams<{ announcementId: string }>();
  const router = useRouter();
  const announcementId = params.announcementId;

  const [announcement, setAnnouncement] =
    React.useState<AdminAnnouncementDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchAnnouncementById(announcementId);
      if (!result) {
        setNotFound(true);
        setAnnouncement(null);
      } else {
        setAnnouncement(result);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load notice",
      );
      setAnnouncement(null);
    } finally {
      setIsLoading(false);
    }
  }, [announcementId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const renderBody = (body: string | null) => {
    if (!body) return <p className="text-sm text-text-muted">No message content available.</p>;
    return body.split("\n").map((para, idx) => (
      <p key={idx} className="text-sm text-text-primary">
        {para}
      </p>
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/notices" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to notices
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href={`/notices/${announcementId}/edit`}>Edit notice</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Notice Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find an announcement with id <strong>{announcementId}</strong>.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/notices")}>
              Back to notices
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Something Went Wrong">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/notices")}>
              Back
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : announcement ? (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary font-heading">
                  {announcement.title}
                </h1>
                <Badge variant={statusTone[announcement.status] ?? "default"}>
                  {announcement.status}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                {announcement.audienceLabel ?? "Audience not specified"}
              </p>
            </div>
          </Card>

          <Card title="Message">
            {renderBody(announcement.body)}
          </Card>

          <Card title="Delivery & Schedule">
            <div className="space-y-1 text-sm text-text-primary">
              <div>Created: {formatDateTime(announcement.createdAt)}</div>
              <div>Scheduled: {formatDateTime(announcement.scheduledAt)}</div>
              <div>Sent/published: {formatDateTime(announcement.publishedAt)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Channels:</span>
                {announcement.channels && announcement.channels.length ? (
                  announcement.channels.map((ch) => (
                    <Badge key={ch} variant="secondary">
                      {ch}
                    </Badge>
                  ))
                ) : (
                  <span className="text-text-muted">Delivery channels not specified.</span>
                )}
              </div>
            </div>
          </Card>

          <Card title="Audience & Targeting">
            <p className="text-sm text-text-primary">
              {announcement.targetsSummary ??
                "Audience targeting is summarised on the list view; additional detail may be available in safeguarding/billing reports."}
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

