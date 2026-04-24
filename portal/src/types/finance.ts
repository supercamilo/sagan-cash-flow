export type HouseholdSummary = {
  id: number;
  name: string;
  monthly_expense: number;
  created_at: string;
  client_count: number;
  account_count: number;
  primary_income_client_id: number | null;
};

export type HouseholdRead = {
  id: number;
  name: string;
  monthly_expense: number;
  created_at: string;
};

export type HouseholdCreate = {
  name: string;
  monthly_expense: number;
};

export type HouseholdUpdate = {
  name?: string;
  monthly_expense?: number;
};

export type Client = {
  id: number;
  household_id: number;
  first_name: string;
  last_name: string;
  day_of_birth: string;
  age: number;
  last_four_ssn: string;
  monthly_salary: number;
  is_primary_income: boolean;
  created_at: string;
};

export type ClientPayload = {
  household_id: number;
  first_name: string;
  last_name: string;
  day_of_birth: string;
  last_four_ssn: string;
  monthly_salary: number;
  is_primary_income: boolean;
};

export type ClientUpdatePayload = Partial<ClientPayload>;

export type AccountType =
  | "retirement"
  | "non-retirement"
  | "trust"
  | "liabilities";

export type Account = {
  id: number;
  client_id: number;
  number: string;
  type: AccountType;
  bank: string;
  interest_rate: number;
  created_at: string;
};

export type AccountPayload = {
  client_id: number;
  number: string;
  type: AccountType;
  bank: string;
  interest_rate: number;
};

export type AccountUpdatePayload = Partial<Omit<AccountPayload, "client_id">>;

export type HouseholdAccountBalanceRow = {
  account_id: number;
  client_id: number;
  client_name: string;
  household_id: number;
  account_number: string;
  account_type: AccountType;
  bank: string;
  balance_date: string | null;
  total_balance: number | null;
  cash_balance: number | null;
};

export type HouseholdBalanceSnapshotRow = {
  snapshot_id: number;
  account_id: number;
  client_id: number;
  client_name: string;
  household_id: number;
  account_number: string;
  account_type: AccountType;
  bank: string;
  balance_date: string;
  total_balance: number;
  cash_balance: number;
  balance_snapshot_group_id: number;
};

export type BalanceSnapshotGroup = {
  id: number;
  household_id: number;
  name: string;
  created_at: string;
};

export type BalanceSnapshotGroupCreatePayload = {
  household_id: number;
  name: string;
};

export type BalanceSnapshotGroupUpdatePayload = {
  name?: string;
};

export type BalanceSnapshotGroupWithSnapshots = BalanceSnapshotGroup & {
  snapshots: HouseholdBalanceSnapshotRow[];
};

export type SacsClientBreakdown = {
  client_id: number;
  client_name: string;
  monthly_salary: number;
};

export type SacsReport = {
  group_id: number;
  group_name: string;
  group_date: string | null;
  household_id: number;
  household_name: string;
  clients: SacsClientBreakdown[];
  monthly_inflow: number;
  monthly_outflow: number;
  monthly_private_reserve: number;
};

export type BalanceSnapshotUpsertPayload = {
  balance_date: string;
  total_balance: number;
  cash_balance: number;
  balance_snapshot_group_id: number;
};

export type BalanceSnapshotRead = {
  id: number;
  account_id: number;
  balance_date: string;
  total_balance: number;
  cash_balance: number;
  created_at: string;
};
