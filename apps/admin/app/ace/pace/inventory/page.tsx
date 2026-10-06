"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { PaceInventoryWorkspace } from "@/components/ace/pace/inventory/pace-inventory-workspace";
import { usePaceInventoryPage } from "@/components/ace/pace/inventory/use-pace-inventory-page";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";
import {
  fetchPaceInventoryAttention,
  fetchPaceInventoryOrders,
  fetchPaceInventoryStock,
  type InventoryPageQuery,
  type PaceInventoryOrderItem,
} from "@/lib/pace-inventory-api";
import type { PagedInventory } from "@/components/ace/pace/inventory/use-pace-inventory-page";

export default function PaceInventoryPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const [stockView, setStockView] = React.useState<"attention" | "all">(
    "attention",
  );
  const canRead = permissions?.includes("ace.pace.inventory.read") === true;
  const enabled =
    sessionStatus === "authenticated" &&
    session !== null &&
    !isLoadingAccess &&
    canRead;
  const orders = usePaceInventoryPage(
    fetchPaceInventoryOrders,
    enabled,
    "Unable to load PACE orders.",
  );

  if (isLoadingAccess || sessionStatus === "loading") {
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
    />
  );
}

function PaceInventoryStockView({
  stockView,
  onStockViewChange,
  orders,
}: {
  stockView: "attention" | "all";
  onStockViewChange: () => void;
  orders: PagedInventory<PaceInventoryOrderItem>;
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

  return (
    <PaceInventoryWorkspace
      stock={stock}
      stockView={stockView}
      onStockViewChange={onStockViewChange}
      orders={orders}
    />
  );
}
