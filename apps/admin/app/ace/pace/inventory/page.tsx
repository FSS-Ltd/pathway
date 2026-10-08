"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { PaceInventoryWorkspace } from "@/components/ace/pace/inventory/pace-inventory-workspace";
import { usePaceInventoryPage } from "@/components/ace/pace/inventory/use-pace-inventory-page";
import { useAdminAccess } from "@/lib/use-admin-access";
import {
  fetchPaceInventoryAttention,
  fetchPaceInventoryOrders,
  fetchPaceInventoryStock,
  type InventoryPageQuery,
  type PaceInventoryOrderItem,
  type PaceInventoryNextOrderStatus,
} from "@/lib/pace-inventory-api";
import type { PagedInventory } from "@/components/ace/pace/inventory/use-pace-inventory-page";

export default function PaceInventoryPage() {
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const [stockView, setStockView] = React.useState<"attention" | "all">(
    "attention",
  );
  const [inventoryNotice, setInventoryNotice] = React.useState<string | null>(
    null,
  );
  const canRead = permissions?.includes("ace.pace.inventory.read") === true;
  const canManage = permissions?.includes("ace.pace.inventory.manage") === true;
  const enabled = !isLoadingAccess && canRead;
  const orders = usePaceInventoryPage(
    fetchPaceInventoryOrders,
    enabled,
    "Unable to load PACE orders.",
  );
  React.useEffect(
    () => subscribeToActiveSiteChanges(() => setInventoryNotice(null)),
    [],
  );

  if (isLoadingAccess) {
    return <p role="status">Loading inventory access…</p>;
  }
  if (!enabled) {
    return (
      <NoAccessCard
        title="Physical PACE inventory"
        message="You do not have permission to view physical PACE inventory."
      />
    );
  }

  return (
    <PaceInventoryStockView
      key={stockView}
      stockView={stockView}
      onStockViewChange={() =>
        setStockView((current) =>
          current === "attention" ? "all" : "attention",
        )
      }
      orders={orders}
      canManage={canManage}
      inventoryNotice={inventoryNotice}
      onInventoryNotice={setInventoryNotice}
    />
  );
}

function PaceInventoryStockView({
  stockView,
  onStockViewChange,
  orders,
  canManage,
  inventoryNotice,
  onInventoryNotice,
}: {
  stockView: "attention" | "all";
  onStockViewChange: () => void;
  orders: PagedInventory<PaceInventoryOrderItem>;
  canManage: boolean;
  inventoryNotice: string | null;
  onInventoryNotice: (notice: string) => void;
}) {
  const fetchStockPage = React.useCallback(
    (query: InventoryPageQuery) =>
      stockView === "attention"
        ? fetchPaceInventoryAttention(query)
        : fetchPaceInventoryStock(query),
    [stockView],
  );
  const stock = usePaceInventoryPage(
    fetchStockPage,
    true,
    "Unable to load physical PACE stock.",
  );

  function handleCreated(action: "order" | "stock", created: number) {
    onInventoryNotice(
      action === "order"
        ? `Created ${created} physical PACE ${created === 1 ? "order" : "orders"}.`
        : `Added ${created} physical ${created === 1 ? "PACE" : "PACEs"} to stock.`,
    );
    stock.retry();
    orders.retry();
  }

  function handleAdvanced(status: PaceInventoryNextOrderStatus) {
    onInventoryNotice(
      status === "DELIVERED"
        ? "PACE order marked delivered. Physical stock has been updated."
        : "PACE order marked in transit.",
    );
    stock.retry();
    orders.retry();
  }

  return (
    <PaceInventoryWorkspace
      stock={stock}
      stockView={stockView}
      onStockViewChange={onStockViewChange}
      orders={orders}
      notice={inventoryNotice}
      orderCreation={
        canManage
          ? {
              onCreated: (created) => handleCreated("order", created),
            }
          : undefined
      }
      stockEntry={
        canManage
          ? { onCreated: (created) => handleCreated("stock", created) }
          : undefined
      }
      orderTransition={canManage ? { onAdvanced: handleAdvanced } : undefined}
    />
  );
}
