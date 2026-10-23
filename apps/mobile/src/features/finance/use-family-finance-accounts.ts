import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

import { ApiError } from "@/lib/api/client";
import {
  listFamilyInvoices,
  listFamilyPayerAccounts,
  listFamilyStatements,
  type FamilyInvoice,
  type FamilyPayerAccount,
  type FamilyStatement,
} from "./family-finance-api";

export type FinanceHistoryKind = "invoices" | "statements";
export interface FinanceHistoryPage<Item> {
  items: Item[];
  nextCursor: string | null;
  status: "idle" | "loading" | "error";
}
interface AccountData {
  account: FamilyPayerAccount;
  invoices: FinanceHistoryPage<FamilyInvoice>;
  statements: FinanceHistoryPage<FamilyStatement>;
}
type FinanceViewState = { scopeKey: string | null } & (
  | { status: "loading" | "unavailable" | "error" }
  | { status: "ready"; accounts: AccountData[]; updatedAt: Date }
);

interface FamilyFinanceAccountsState {
  state: FinanceViewState;
  refresh: () => Promise<boolean>;
  loadMore: (accountId: string, kind: FinanceHistoryKind) => Promise<void>;
  denyAccess: () => void;
  isCurrent: () => boolean;
}

export function useFamilyFinanceAccounts(
  scopeKey: string | null,
  canReadInvoices: boolean,
  canReadStatements: boolean,
): FamilyFinanceAccountsState {
  const [state, setState] = useState<FinanceViewState>({
    status: "loading",
    scopeKey,
  });
  const scope = useRef(scopeKey);
  scope.current = scopeKey;
  const generation = useRef(0);
  const focused = useRef(false);
  const pageRequests = useRef(new Set<string>());

  const clear = useCallback((status: "loading" | "unavailable") => {
    generation.current += 1;
    pageRequests.current.clear();
    setState({ status, scopeKey: scope.current });
  }, []);

  const refresh = useCallback(async () => {
    if (!focused.current || scope.current !== scopeKey) return false;
    clear(scopeKey ? "loading" : "unavailable");
    if (!scopeKey) return false;
    const requestGeneration = generation.current;
    try {
      const payerAccounts = await listFamilyPayerAccounts();
      if (generation.current !== requestGeneration) return false;
      const accounts = await Promise.all(
        payerAccounts.map(async (account) => {
          const [invoices, statements] = await Promise.all([
            canReadInvoices
              ? listFamilyInvoices(account.id)
              : Promise.resolve({ items: [], nextCursor: null }),
            canReadStatements
              ? listFamilyStatements(account.id)
              : Promise.resolve({ items: [], nextCursor: null }),
          ]);
          return {
            account,
            invoices: { ...invoices, status: "idle" as const },
            statements: { ...statements, status: "idle" as const },
          };
        }),
      );
      if (generation.current === requestGeneration) {
        setState({
          status: "ready",
          scopeKey,
          accounts,
          updatedAt: new Date(),
        });
        return true;
      }
      return false;
    } catch (error) {
      if (generation.current !== requestGeneration) return false;
      if (isAccessDenied(error)) clear("unavailable");
      else setState({ status: "error", scopeKey });
      return false;
    }
  }, [scopeKey, canReadInvoices, canReadStatements, clear]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      return () => {
        focused.current = false;
        clear("loading");
      };
    }, [refresh, clear]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh();
      else clear("loading");
    });
    return () => subscription.remove();
  }, [refresh, clear]);

  const renderGeneration = generation.current;
  const isCurrent = () =>
    focused.current &&
    scope.current === scopeKey &&
    generation.current === renderGeneration;
  const denyAccess = () => {
    if (isCurrent()) clear("unavailable");
  };

  const loadMore = async (accountId: string, kind: FinanceHistoryKind) => {
    if (!isCurrent() || state.status !== "ready") return;
    const account = state.accounts.find(
      (item) => item.account.id === accountId,
    );
    const cursor = account?.[kind].nextCursor;
    const requestKey = `${accountId}:${kind}`;
    if (!cursor || pageRequests.current.has(requestKey)) return;
    const requestGeneration = generation.current;
    pageRequests.current.add(requestKey);
    const updatePage = (update: (item: AccountData) => AccountData) => {
      if (generation.current !== requestGeneration) return;
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              accounts: current.accounts.map((item) =>
                item.account.id === accountId ? update(item) : item,
              ),
            }
          : current,
      );
    };
    updatePage((item) => ({
      ...item,
      [kind]: { ...item[kind], status: "loading" },
    }));
    try {
      if (kind === "invoices") {
        const page = await listFamilyInvoices(accountId, cursor);
        updatePage((item) => ({
          ...item,
          invoices: {
            items: appendUnique(item.invoices.items, page.items),
            nextCursor: page.nextCursor,
            status: "idle",
          },
        }));
      } else {
        const page = await listFamilyStatements(accountId, cursor);
        updatePage((item) => ({
          ...item,
          statements: {
            items: appendUnique(item.statements.items, page.items),
            nextCursor: page.nextCursor,
            status: "idle",
          },
        }));
      }
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      if (isAccessDenied(error)) clear("unavailable");
      else
        updatePage((item) => ({
          ...item,
          [kind]: { ...item[kind], status: "error" },
        }));
    } finally {
      if (generation.current === requestGeneration)
        pageRequests.current.delete(requestKey);
    }
  };

  const visibleState: FinanceViewState =
    state.scopeKey === scopeKey ? state : { status: "loading", scopeKey };
  return { state: visibleState, refresh, loadMore, denyAccess, isCurrent };
}

function appendUnique<Item extends { id: string }>(
  current: Item[],
  next: Item[],
): Item[] {
  const existing = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !existing.has(item.id))];
}
function isAccessDenied(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 401 || error.status === 403)
  );
}
