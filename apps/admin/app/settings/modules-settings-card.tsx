"use client";

import { Badge, Card } from "@pathway/ui";
import { Checkbox } from "../../components/ui/checkbox";
import {
  MODULE_LABELS,
  type AdminModule,
  type AdminOrgModule,
} from "../../lib/api-client";

type ModulesSettingsCardProps = {
  modules: AdminOrgModule[];
  canToggle: boolean;
  isLoading: boolean;
  savingModule: AdminModule | null;
  error: string | null;
  onToggle: (module: AdminModule, active: boolean) => void;
};

const moduleOptions = Object.entries(MODULE_LABELS) as Array<
  [AdminModule, string]
>;

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusVariant(
  status: string | null,
): "success" | "warning" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "EXPIRED") return "warning";
  return "default";
}

export function ModulesSettingsCard({
  modules,
  canToggle,
  isLoading,
  savingModule,
  error,
  onToggle,
}: ModulesSettingsCardProps) {
  const modulesByName = new Map(
    modules.map((module) => [module.module, module]),
  );

  return (
    <Card
      title="Modules"
      description="Review optional product modules and their entitlement status."
      className="md:col-span-2"
    >
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {moduleOptions.map(([module]) => (
            <span
              key={module}
              className="block h-24 animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {moduleOptions.map(([module, label]) => {
              const record = modulesByName.get(module);
              const status = record?.status ?? null;
              const isActive = status === "ACTIVE";
              const isSaving = savingModule === module;

              return (
                <div
                  key={module}
                  className="rounded-md border border-border-subtle bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          {label}
                        </p>
                        <Badge variant={statusVariant(status)}>
                          {status ?? "Not installed"}
                        </Badge>
                      </div>
                      <dl className="space-y-1 text-xs text-text-muted">
                        <div className="flex gap-1">
                          <dt>Purchased / activated:</dt>
                          <dd>{formatDate(record?.activatedAt ?? null)}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>Expiry:</dt>
                          <dd>{formatDate(record?.expiresAt ?? null)}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>Billing source:</dt>
                          <dd>{record?.billingSource ?? "Not available"}</dd>
                        </div>
                      </dl>
                    </div>

                    {canToggle ? (
                      <label className="flex items-center gap-2 text-xs text-text-muted">
                        <span className="sr-only">Toggle {label}</span>
                        <Checkbox
                          checked={isActive}
                          disabled={savingModule !== null}
                          onChange={(event) =>
                            onToggle(module, event.target.checked)
                          }
                          aria-label={`Toggle ${label}`}
                        />
                      </label>
                    ) : null}
                  </div>
                  {isSaving ? (
                    <p className="mt-2 text-xs text-text-muted">
                      Saving module...
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!canToggle ? (
            <p className="text-sm text-text-muted">
              Organisation admins can change modules only outside production.
            </p>
          ) : null}
          {error ? <p className="text-sm text-status-danger">{error}</p> : null}
        </div>
      )}
    </Card>
  );
}
