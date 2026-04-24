import { API_BASE_URL } from "../config/settings";
import type {
  Account,
  AccountPayload,
  AccountUpdatePayload,
  BalanceSnapshotGroup,
  BalanceSnapshotGroupCreatePayload,
  BalanceSnapshotGroupUpdatePayload,
  BalanceSnapshotGroupWithSnapshots,
  BalanceSnapshotRead,
  BalanceSnapshotUpsertPayload,
  Client,
  ClientPayload,
  ClientUpdatePayload,
  HouseholdAccountBalanceRow,
  HouseholdBalanceSnapshotRow,
  HouseholdCreate,
  HouseholdRead,
  HouseholdSummary,
  HouseholdUpdate,
  SacsReport,
} from "../types/finance";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

type ApiErrorShape = {
  detail?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as ApiErrorShape;
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      // Keep the generic fallback when the response body is empty.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const householdApi = {
  list: () => request<HouseholdSummary[]>("/households"),
  create: (payload: HouseholdCreate) =>
    request<HouseholdRead>("/households", { method: "POST", body: payload }),
  update: (householdId: number, payload: HouseholdUpdate) =>
    request<HouseholdRead>(`/households/${householdId}`, { method: "PATCH", body: payload }),
  remove: (householdId: number) =>
    request<void>(`/households/${householdId}`, { method: "DELETE" }),
};

export const clientApi = {
  listByHousehold: (householdId: number) =>
    request<Client[]>(`/clients?household_id=${householdId}`),
  create: (payload: ClientPayload) =>
    request<Client>("/clients", { method: "POST", body: payload }),
  update: (clientId: number, payload: ClientUpdatePayload) =>
    request<Client>(`/clients/${clientId}`, { method: "PATCH", body: payload }),
  remove: (clientId: number) => request<void>(`/clients/${clientId}`, { method: "DELETE" }),
};

export const accountApi = {
  listByHousehold: (householdId: number) =>
    request<Account[]>(`/accounts?household_id=${householdId}`),
  listByClient: (clientId: number) => request<Account[]>(`/accounts?client_id=${clientId}`),
  create: (payload: AccountPayload) =>
    request<Account>("/accounts", { method: "POST", body: payload }),
  update: (accountId: number, payload: AccountUpdatePayload) =>
    request<Account>(`/accounts/${accountId}`, { method: "PATCH", body: payload }),
  remove: (accountId: number) => request<void>(`/accounts/${accountId}`, { method: "DELETE" }),
  upsertBalance: (accountId: number, payload: BalanceSnapshotUpsertPayload) =>
    request<BalanceSnapshotRead>(`/accounts/${accountId}/balances`, {
      method: "PUT",
      body: payload,
    }),
};

export const balanceSnapshotApi = {
  listHouseholdAccountsWithBalances: (householdId: number, balanceDate?: string) => {
    const query = balanceDate ? `?balance_date=${encodeURIComponent(balanceDate)}` : "";
    return request<HouseholdAccountBalanceRow[]>(
      `/households/${householdId}/accounts-with-balances${query}`,
    );
  },
  listHouseholdSnapshots: (householdId: number) =>
    request<HouseholdBalanceSnapshotRow[]>(
      `/households/${householdId}/balance-snapshots`,
    ),
  update: (snapshotId: number, payload: BalanceSnapshotUpsertPayload) =>
    request<BalanceSnapshotRead>(`/balance-snapshots/${snapshotId}`, {
      method: "PATCH",
      body: payload,
    }),
  remove: (snapshotId: number) =>
    request<void>(`/balance-snapshots/${snapshotId}`, { method: "DELETE" }),
};

export const balanceSnapshotGroupApi = {
  listByHousehold: (householdId: number) =>
    request<BalanceSnapshotGroupWithSnapshots[]>(
      `/households/${householdId}/balance-snapshot-groups`,
    ),
  create: (payload: BalanceSnapshotGroupCreatePayload) =>
    request<BalanceSnapshotGroup>("/balance-snapshot-groups", {
      method: "POST",
      body: payload,
    }),
  update: (groupId: number, payload: BalanceSnapshotGroupUpdatePayload) =>
    request<BalanceSnapshotGroup>(`/balance-snapshot-groups/${groupId}`, {
      method: "PATCH",
      body: payload,
    }),
  remove: (groupId: number) =>
    request<void>(`/balance-snapshot-groups/${groupId}`, { method: "DELETE" }),
};

export const reportApi = {
  sacs: (groupId: number) =>
    request<SacsReport>(`/balance-snapshot-groups/${groupId}/sacs-report`),
};
