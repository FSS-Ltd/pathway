"use client";

import React from "react";
import { Badge, Button, Card, Label } from "@pathway/ui";
import { ORG_SECTOR_LABELS, type AdminOrgSector } from "../../lib/api-client";

type SectorSettingsCardProps = {
  sector: AdminOrgSector | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onSave: (sector: AdminOrgSector) => void;
};

const sectorOptions = Object.entries(ORG_SECTOR_LABELS) as Array<
  [AdminOrgSector, string]
>;

export function SectorSettingsCard({
  sector,
  isLoading,
  isSaving,
  error,
  onSave,
}: SectorSettingsCardProps) {
  const [candidate, setCandidate] = React.useState<AdminOrgSector | "">(
    sector ?? "",
  );

  React.useEffect(() => {
    setCandidate(sector ?? "");
  }, [sector]);

  const saveDisabled = isLoading || isSaving || !candidate || candidate === sector;

  return (
    <Card
      title="Sector (master org testing)"
      description="Cycle this internal organisation through sectors to test sector-specific UI. Real organisations cannot change sector after purchase."
    >
      {isLoading ? (
        <div className="space-y-2">
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          <span className="block h-9 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            Current sector
            <Badge variant="secondary">
              {sector ? ORG_SECTOR_LABELS[sector] : "Not configured"}
            </Badge>
          </p>

          <div className="space-y-2">
            <Label htmlFor="organisation-sector">Change sector</Label>
            <select
              id="organisation-sector"
              value={candidate}
              disabled={isSaving}
              onChange={(e) => setCandidate(e.target.value as AdminOrgSector)}
              className="h-10 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <option value="" disabled>
                Select a sector
              </option>
              {sectorOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-sm text-status-danger">{error}</p> : null}

          <Button
            size="sm"
            disabled={saveDisabled}
            onClick={() => {
              if (candidate) onSave(candidate);
            }}
          >
            {isSaving ? "Saving…" : "Save sector"}
          </Button>
        </div>
      )}
    </Card>
  );
}
