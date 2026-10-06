import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import type {
  PaceInventoryOrderItem,
  PaceInventoryStockItem,
} from "@/lib/pace-inventory-api";
import { PaceInventoryOrderForm } from "./pace-inventory-order-form";
import type { PagedInventory } from "./use-pace-inventory-page";

type InventoryWorkspaceProps = {
  stock: PagedInventory<PaceInventoryStockItem>;
  stockView: "attention" | "all";
  onStockViewChange: () => void;
  orders: PagedInventory<PaceInventoryOrderItem>;
  orderCreation?: { onCreated: (created: number) => void };
  notice?: string | null;
};

const orderDateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function PaceInventoryWorkspace({
  stock,
  stockView,
  onStockViewChange,
  orders,
  orderCreation,
  notice,
}: InventoryWorkspaceProps) {
  const showAllStock = stockView === "all";
  return (
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">ACE / PACE</p>
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary sm:text-3xl">
            Physical PACE inventory
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            Review stock that needs attention and follow physical PACE orders
            for the active site.
          </p>
        </div>
      </header>

      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-status-success/10 px-4 py-3 text-sm text-status-success"
        >
          {notice}
        </p>
      ) : null}

      <Card
        title={showAllStock ? "Physical stock" : "Stock attention"}
        description={
          showAllStock
            ? "Available future PACEs for every active placement at this site."
            : "Active placements with no future physical PACE stock or only one or two available. Orders already pending are identified below."
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={onStockViewChange}
          >
            {showAllStock ? "Show attention only" : "Show all placements"}
          </Button>
        }
      >
        <InventoryList
          label={showAllStock ? "Physical stock" : "Stock attention"}
          page={stock}
          emptyMessage={
            showAllStock
              ? "No active PACE placements are available for this site."
              : "No placements need stock attention at this site."
          }
          loadMoreLabel={
            showAllStock ? "Load more placements" : "Load more stock attention"
          }
          renderItem={(item) => (
            <StockRow
              key={`${item.child.id}:${item.subject.id}`}
              item={item}
              onOrderCreated={orderCreation?.onCreated}
            />
          )}
        />
      </Card>

      <Card
        title="Order history"
        description="Orders move from Ordered to In transit to Delivered. Delivered PACEs appear in available physical stock."
      >
        <InventoryList
          label="PACE orders"
          page={orders}
          emptyMessage="No physical PACE orders have been recorded for this site."
          loadMoreLabel="Load more orders"
          renderItem={(item) => <OrderRow key={item.id} item={item} />}
        />
      </Card>
    </main>
  );
}

function InventoryList<T>({
  label,
  page,
  emptyMessage,
  loadMoreLabel,
  renderItem,
}: {
  label: string;
  page: PagedInventory<T>;
  emptyMessage: string;
  loadMoreLabel: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  if (page.isLoading) {
    return (
      <div role="status" aria-label={`Loading ${label.toLowerCase()}…`}>
        <span className="sr-only">Loading {label.toLowerCase()}…</span>
        <div className="h-16 rounded-md bg-muted motion-safe:animate-pulse" />
      </div>
    );
  }

  if (page.error) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-status-danger">
          {page.error}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          onClick={page.retry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (page.items.length === 0) {
    return (
      <p role="status" className="text-sm text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul aria-label={label} className="divide-y divide-border-subtle">
        {page.items.map(renderItem)}
      </ul>
      {page.loadMoreError ? (
        <p role="alert" className="text-sm text-status-danger">
          {page.loadMoreError} Your earlier results are still shown.
        </p>
      ) : null}
      {page.nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={page.isLoadingMore}
          onClick={page.loadMore}
        >
          {page.isLoadingMore ? "Loading…" : loadMoreLabel}
        </Button>
      ) : null}
    </div>
  );
}

function StockRow({
  item,
  onOrderCreated,
}: {
  item: PaceInventoryStockItem;
  onOrderCreated?: (created: number) => void;
}) {
  const [isOrdering, setIsOrdering] = React.useState(false);
  const orderTrigger = React.useRef<HTMLButtonElement>(null);
  const wasOrdering = React.useRef(false);
  React.useEffect(() => {
    if (wasOrdering.current && !isOrdering) orderTrigger.current?.focus();
    wasOrdering.current = isOrdering;
  }, [isOrdering]);
  const current =
    item.currentPace < 1000 ? item.currentPace + 1000 : item.currentPace;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-text-primary">
            {item.child.displayName} · {item.subject.name}
          </p>
          <p className="text-sm leading-6 text-text-muted">
            Current PACE {item.currentPace} · Available next:{" "}
            {item.futurePaceNumbers.length > 0
              ? item.futurePaceNumbers.join(", ")
              : "none"}
          </p>
          {item.hasPendingOrder ? (
            <p className="text-sm text-text-muted">
              A future PACE is on order.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Badge
            variant={
              item.stockState === "NO_STOCK"
                ? "danger"
                : item.stockState === "LOW_STOCK"
                  ? "warning"
                  : "success"
            }
            className="self-start"
          >
            {item.stockState === "NO_STOCK"
              ? "No stock"
              : `${item.availableCount} available`}
          </Badge>
          {onOrderCreated && current < 1144 && !isOrdering ? (
            <Button
              ref={orderTrigger}
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setIsOrdering(true)}
            >
              Create order
            </Button>
          ) : null}
        </div>
      </div>
      {isOrdering && onOrderCreated ? (
        <PaceInventoryOrderForm
          item={item}
          onCancel={() => setIsOrdering(false)}
          onCreated={(created) => {
            setIsOrdering(false);
            onOrderCreated(created);
          }}
        />
      ) : null}
    </li>
  );
}

function OrderRow({ item }: { item: PaceInventoryOrderItem }) {
  const status = {
    ORDERED: { label: "Ordered", variant: "default" },
    IN_TRANSIT: { label: "In transit", variant: "accent" },
    DELIVERED: { label: "Delivered", variant: "success" },
  } as const;

  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-text-primary">
          {item.child.displayName} · {item.subject.name}
        </p>
        <p className="text-sm leading-6 text-text-muted">
          PACE {item.paceNumber} · Ordered{" "}
          <time dateTime={item.orderedAt}>
            {orderDateFormatter.format(new Date(item.orderedAt))}
          </time>{" "}
          UTC
        </p>
      </div>
      <Badge variant={status[item.status].variant} className="self-start">
        {status[item.status].label}
      </Badge>
    </li>
  );
}
