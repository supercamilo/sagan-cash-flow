import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  InputAdornment,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Fragment, useEffect, useState } from "react";
import { accountApi, ApiError, clientApi, householdApi } from "../lib/api";
import {
  formatCurrencyInput,
  normalizeCurrencyInput,
  normalizePercentInput,
  parseCurrencyInput,
  parsePercentInput,
} from "../lib/currency";
import type {
  Account,
  AccountPayload,
  AccountType,
  AccountUpdatePayload,
  Client,
  ClientPayload,
  ClientUpdatePayload,
  HouseholdSummary,
  HouseholdUpdate,
} from "../types/finance";

type HouseholdFormState = {
  name: string;
  monthly_expense: string;
};

type ClientFormState = {
  first_name: string;
  last_name: string;
  day_of_birth: string;
  last_four_ssn: string;
  monthly_salary: string;
  is_primary_income: boolean;
};

type AccountFormState = {
  number: string;
  type: AccountType;
  bank: string;
  interest_rate: string;
};

const emptyHouseholdForm: HouseholdFormState = {
  name: "",
  monthly_expense: "",
};

const emptyClientForm: ClientFormState = {
  first_name: "",
  last_name: "",
  day_of_birth: "",
  last_four_ssn: "",
  monthly_salary: "",
  is_primary_income: false,
};

const emptyAccountForm: AccountFormState = {
  number: "",
  type: "non-retirement",
  bank: "",
  interest_rate: "",
};

const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: "retirement", label: "Retirement" },
  { value: "non-retirement", label: "Non-retirement" },
  { value: "trust", label: "Trust" },
  { value: "liabilities", label: "Liabilities" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAccountType(value: AccountType) {
  return (
    accountTypeOptions.find((option) => option.value === value)?.label ?? value
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong while talking to the API.";
}

function buildClientPayload(
  householdId: number,
  form: ClientFormState,
): ClientPayload {
  return {
    household_id: householdId,
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    day_of_birth: form.day_of_birth,
    last_four_ssn: form.last_four_ssn.trim(),
    monthly_salary: parseCurrencyInput(form.monthly_salary),
    is_primary_income: form.is_primary_income,
  };
}

function buildAccountPayload(
  clientId: number,
  form: AccountFormState,
): AccountPayload {
  return {
    client_id: clientId,
    number: form.number.trim(),
    type: form.type,
    bank: form.bank.trim(),
    interest_rate: parsePercentInput(form.interest_rate),
  };
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function groupAccountsByClient(accounts: Account[]) {
  return accounts.reduce<Record<number, Account[]>>((accumulator, account) => {
    accumulator[account.client_id] = [
      ...(accumulator[account.client_id] ?? []),
      account,
    ];
    return accumulator;
  }, {});
}

export default function ClientsPage() {
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | null>(
    null,
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [accountsByClient, setAccountsByClient] = useState<
    Record<number, Account[]>
  >({});
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);

  const [loadingHouseholds, setLoadingHouseholds] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [householdForm, setHouseholdForm] =
    useState<HouseholdFormState>(emptyHouseholdForm);
  const [editingHousehold, setEditingHousehold] =
    useState<HouseholdSummary | null>(null);
  const [editingHouseholdName, setEditingHouseholdName] = useState("");
  const [editingHouseholdMonthlyExpense, setEditingHouseholdMonthlyExpense] =
    useState("");
  const [submittingHousehold, setSubmittingHousehold] = useState(false);

  const [clientForm, setClientForm] =
    useState<ClientFormState>(emptyClientForm);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingClientForm, setEditingClientForm] =
    useState<ClientFormState>(emptyClientForm);
  const [submittingClient, setSubmittingClient] = useState(false);
  const [isCreateClientDialogOpen, setIsCreateClientDialogOpen] =
    useState(false);

  const [accountForm, setAccountForm] =
    useState<AccountFormState>(emptyAccountForm);
  const [accountTargetClient, setAccountTargetClient] = useState<Client | null>(
    null,
  );
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [isCreateAccountDialogOpen, setIsCreateAccountDialogOpen] =
    useState(false);

  const selectedHousehold =
    households.find((household) => household.id === selectedHouseholdId) ??
    null;
  const hasReachedClientLimit = clients.length >= 2;

  async function loadHouseholds(preferredHouseholdId?: number | null) {
    setLoadingHouseholds(true);
    try {
      const data = await householdApi.list();
      setHouseholds(data);
      setSelectedHouseholdId((current) => {
        if (
          preferredHouseholdId &&
          data.some((item) => item.id === preferredHouseholdId)
        ) {
          return preferredHouseholdId;
        }
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingHouseholds(false);
    }
  }

  async function loadClients(householdId: number) {
    setLoadingClients(true);
    try {
      const data = await clientApi.listByHousehold(householdId);
      setClients(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingClients(false);
    }
  }

  async function loadAccounts(householdId: number) {
    setLoadingAccounts(true);
    try {
      const data = await accountApi.listByHousehold(householdId);
      setAccountsByClient(groupAccountsByClient(data));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function refreshHouseholdWorkspace(householdId: number) {
    await Promise.all([
      loadClients(householdId),
      loadAccounts(householdId),
      loadHouseholds(householdId),
    ]);
  }

  useEffect(() => {
    void loadHouseholds();
  }, []);

  useEffect(() => {
    if (selectedHouseholdId === null) {
      setClients([]);
      setAccountsByClient({});
      setExpandedClientId(null);
      return;
    }
    void Promise.all([
      loadClients(selectedHouseholdId),
      loadAccounts(selectedHouseholdId),
    ]);
  }, [selectedHouseholdId]);

  async function handleCreateHousehold() {
    setSubmittingHousehold(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const created = await householdApi.create({
        name: householdForm.name.trim(),
        monthly_expense: parseCurrencyInput(householdForm.monthly_expense),
      });
      setHouseholdForm(emptyHouseholdForm);
      await loadHouseholds(created.id);
      setSuccessMessage("Household created.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingHousehold(false);
    }
  }

  async function handleUpdateHousehold() {
    if (!editingHousehold) {
      return;
    }
    setSubmittingHousehold(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload: HouseholdUpdate = {
        name: editingHouseholdName.trim(),
        monthly_expense: parseCurrencyInput(editingHouseholdMonthlyExpense),
      };
      await householdApi.update(editingHousehold.id, payload);
      setEditingHousehold(null);
      setEditingHouseholdName("");
      setEditingHouseholdMonthlyExpense("");
      await loadHouseholds(editingHousehold.id);
      setSuccessMessage("Household updated.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingHousehold(false);
    }
  }

  async function handleDeleteHousehold(household: HouseholdSummary) {
    const confirmed = window.confirm(
      `Delete "${household.name}" and all nested clients, accounts, and snapshots?`,
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await householdApi.remove(household.id);
      await loadHouseholds();
      setSuccessMessage("Household deleted.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleCreateClient() {
    if (!selectedHouseholdId) {
      return false;
    }
    setSubmittingClient(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await clientApi.create(
        buildClientPayload(selectedHouseholdId, clientForm),
      );
      setClientForm(emptyClientForm);
      await refreshHouseholdWorkspace(selectedHouseholdId);
      setSuccessMessage("Client created.");
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setSubmittingClient(false);
    }
  }

  async function handleUpdateClient() {
    if (!editingClient) {
      return;
    }
    setSubmittingClient(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload: ClientUpdatePayload = buildClientPayload(
        editingClient.household_id,
        editingClientForm,
      );
      await clientApi.update(editingClient.id, payload);
      setEditingClient(null);
      setEditingClientForm(emptyClientForm);
      await refreshHouseholdWorkspace(editingClient.household_id);
      setSuccessMessage("Client updated.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingClient(false);
    }
  }

  async function handleDeleteClient(client: Client) {
    const confirmed = window.confirm(
      `Delete client "${client.first_name} ${client.last_name}"?`,
    );
    if (!confirmed) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await clientApi.remove(client.id);
      setExpandedClientId((current) =>
        current === client.id ? null : current,
      );
      await refreshHouseholdWorkspace(client.household_id);
      setSuccessMessage("Client deleted.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleCreateAccount() {
    if (!accountTargetClient) {
      return false;
    }
    setSubmittingAccount(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await accountApi.create(
        buildAccountPayload(accountTargetClient.id, accountForm),
      );
      setAccountForm(emptyAccountForm);
      await refreshHouseholdWorkspace(accountTargetClient.household_id);
      setExpandedClientId(accountTargetClient.id);
      setSuccessMessage("Account created.");
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally {
      setSubmittingAccount(false);
    }
  }

  async function handleUpdateAccount() {
    if (!editingAccount || !accountTargetClient) {
      return;
    }
    setSubmittingAccount(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload: AccountUpdatePayload = {
        number: accountForm.number.trim(),
        type: accountForm.type,
        bank: accountForm.bank.trim(),
        interest_rate: parsePercentInput(accountForm.interest_rate),
      };
      await accountApi.update(editingAccount.id, payload);
      await refreshHouseholdWorkspace(accountTargetClient.household_id);
      setExpandedClientId(accountTargetClient.id);
      setEditingAccount(null);
      setAccountTargetClient(null);
      setAccountForm(emptyAccountForm);
      setSuccessMessage("Account updated.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmittingAccount(false);
    }
  }

  async function handleDeleteAccount(client: Client, account: Account) {
    const confirmed = window.confirm(
      `Delete account "${account.number}" at ${account.bank}?`,
    );
    if (!confirmed) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await accountApi.remove(account.id);
      await refreshHouseholdWorkspace(client.household_id);
      setExpandedClientId(client.id);
      setSuccessMessage("Account deleted.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function openEditHouseholdDialog(household: HouseholdSummary) {
    setEditingHousehold(household);
    setEditingHouseholdName(household.name);
    setEditingHouseholdMonthlyExpense(String(household.monthly_expense));
  }

  function openEditClientDialog(client: Client) {
    setEditingClient(client);
    setEditingClientForm({
      first_name: client.first_name,
      last_name: client.last_name,
      day_of_birth: client.day_of_birth,
      last_four_ssn: client.last_four_ssn,
      monthly_salary: String(client.monthly_salary),
      is_primary_income: client.is_primary_income,
    });
  }

  function openCreateClientDialog() {
    setClientForm(emptyClientForm);
    setIsCreateClientDialogOpen(true);
  }

  function closeCreateClientDialog() {
    setIsCreateClientDialogOpen(false);
    setClientForm(emptyClientForm);
  }

  function openCreateAccountDialog(client: Client) {
    setAccountTargetClient(client);
    setEditingAccount(null);
    setAccountForm(emptyAccountForm);
    setIsCreateAccountDialogOpen(true);
  }

  function closeCreateAccountDialog() {
    setIsCreateAccountDialogOpen(false);
    setAccountTargetClient(null);
    setAccountForm(emptyAccountForm);
  }

  function openEditAccountDialog(client: Client, account: Account) {
    setAccountTargetClient(client);
    setEditingAccount(account);
    setAccountForm({
      number: account.number,
      type: account.type,
      bank: account.bank,
      interest_rate: String(account.interest_rate ?? 0),
    });
  }

  function closeEditAccountDialog() {
    setEditingAccount(null);
    setAccountTargetClient(null);
    setAccountForm(emptyAccountForm);
  }

  function toggleClientAccounts(clientId: number) {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">Clients</Typography>
        <Typography color="text.secondary">
          Manage households, clients, and their accounts from a single
          workspace.
        </Typography>
      </Stack>

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      {successMessage ? (
        <Alert severity="success">{successMessage}</Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: {
            xs: "1fr",
            lg: "320px minmax(0, 1fr)",
          },
          alignItems: "start",
        }}
      >
        <Stack spacing={3}>
          <Card
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider" }}
          >
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <AddRoundedIcon color="primary" />
                  <Typography variant="h6">New Household</Typography>
                </Stack>
                <TextField
                  label="Household name"
                  value={householdForm.name}
                  onChange={(event) =>
                    setHouseholdForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  size="small"
                />
                <TextField
                  label="Monthly expense"
                  value={formatCurrencyInput(householdForm.monthly_expense)}
                  onChange={(event) =>
                    setHouseholdForm((current) => ({
                      ...current,
                      monthly_expense: normalizeCurrencyInput(
                        event.target.value,
                      ),
                    }))
                  }
                  size="small"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={() => void handleCreateHousehold()}
                  disabled={
                    submittingHousehold ||
                    householdForm.name.trim().length === 0
                  }
                >
                  Create household
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider" }}
          >
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="h6">Households</Typography>
                  {loadingHouseholds ? <CircularProgress size={18} /> : null}
                </Stack>

                {households.length === 0 && !loadingHouseholds ? (
                  <Paper
                    variant="outlined"
                    sx={{ p: 2.5, bgcolor: "background.default" }}
                  >
                    <Typography color="text.secondary">
                      Create your first household to begin adding clients.
                    </Typography>
                  </Paper>
                ) : null}

                <List sx={{ display: "grid", gap: 1, p: 0 }}>
                  {households.map((household) => (
                    <Paper
                      key={household.id}
                      variant="outlined"
                      sx={{
                        overflow: "hidden",
                        borderColor:
                          household.id === selectedHouseholdId
                            ? "primary.main"
                            : "divider",
                      }}
                    >
                      <ListItemButton
                        onClick={() => setSelectedHouseholdId(household.id)}
                      >
                        <ListItemText
                          primary={household.name}
                          secondary={`${household.client_count} clients - ${household.account_count} accounts - ${formatCurrency(household.monthly_expense)} monthly expense`}
                        />
                      </ListItemButton>
                      <Divider />
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ px: 1.5, py: 1 }}
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Chip
                          size="small"
                          color={
                            household.primary_income_client_id
                              ? "success"
                              : "default"
                          }
                          label={
                            household.primary_income_client_id
                              ? "Primary set"
                              : "Primary missing"
                          }
                        />
                        <Box>
                          <IconButton
                            size="small"
                            onClick={() => openEditHouseholdDialog(household)}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                              void handleDeleteHousehold(household)
                            }
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </List>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Stack spacing={3}>
          <Card
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider" }}
          >
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="h5">
                      {selectedHousehold?.name ?? "Select a household"}
                    </Typography>
                    {selectedHousehold ? (
                      <Typography color="text.secondary">
                        Monthly expense:{" "}
                        {formatCurrency(selectedHousehold.monthly_expense)}
                      </Typography>
                    ) : null}
                  </Box>
                  {selectedHousehold ? (
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      alignItems="center"
                    >
                      <Chip label={`${clients.length} clients`} />
                      <Chip
                        color={
                          selectedHousehold.primary_income_client_id
                            ? "success"
                            : "warning"
                        }
                        label={
                          selectedHousehold.primary_income_client_id
                            ? "Primary income assigned"
                            : "Primary income required"
                        }
                      />
                      <Button
                        startIcon={<PersonAddAlt1RoundedIcon />}
                        variant="contained"
                        onClick={openCreateClientDialog}
                        disabled={!selectedHouseholdId || hasReachedClientLimit}
                      >
                        Add client
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>

                {selectedHouseholdId && hasReachedClientLimit ? (
                  <Alert severity="info">
                    This household already has 2 clients, which is the current
                    limit.
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider" }}
          >
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="h6">Clients</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {loadingAccounts ? <CircularProgress size={18} /> : null}
                    {loadingClients ? <CircularProgress size={18} /> : null}
                  </Stack>
                </Stack>

                {!selectedHouseholdId ? (
                  <Paper
                    variant="outlined"
                    sx={{ p: 3, bgcolor: "background.default" }}
                  >
                    <Typography color="text.secondary">
                      Select a household to view and manage its clients.
                    </Typography>
                  </Paper>
                ) : clients.length === 0 && !loadingClients ? (
                  <Paper
                    variant="outlined"
                    sx={{ p: 3, bgcolor: "background.default" }}
                  >
                    <Typography color="text.secondary">
                      No clients yet. Add the primary income client first.
                    </Typography>
                  </Paper>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Age</TableCell>
                        <TableCell>Last 4 SSN</TableCell>
                        <TableCell>Monthly salary</TableCell>
                        <TableCell>Primary</TableCell>
                        <TableCell>Accounts</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {clients.map((client) => {
                        const clientAccounts =
                          accountsByClient[client.id] ?? [];
                        const isExpanded = expandedClientId === client.id;

                        return (
                          <Fragment key={client.id}>
                            <TableRow hover>
                              <TableCell>
                                <Stack spacing={0.5}>
                                  <Typography fontWeight={600}>
                                    {client.first_name} {client.last_name}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    DOB {client.day_of_birth}
                                  </Typography>
                                </Stack>
                              </TableCell>
                              <TableCell>{client.age}</TableCell>
                              <TableCell>{client.last_four_ssn}</TableCell>
                              <TableCell>
                                {formatCurrency(client.monthly_salary)}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  color={
                                    client.is_primary_income
                                      ? "success"
                                      : "default"
                                  }
                                  label={
                                    client.is_primary_income
                                      ? "Primary"
                                      : "Secondary"
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="small"
                                  variant="text"
                                  endIcon={
                                    isExpanded ? (
                                      <ExpandLessRoundedIcon fontSize="small" />
                                    ) : (
                                      <ExpandMoreRoundedIcon fontSize="small" />
                                    )
                                  }
                                  onClick={() =>
                                    toggleClientAccounts(client.id)
                                  }
                                >
                                  {clientAccounts.length} accounts
                                </Button>
                              </TableCell>
                              <TableCell align="right">
                                <IconButton
                                  onClick={() => openEditClientDialog(client)}
                                >
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  color="error"
                                  onClick={() =>
                                    void handleDeleteClient(client)
                                  }
                                >
                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                sx={{ py: 0, borderBottom: 0 }}
                              >
                                <Collapse
                                  in={isExpanded}
                                  timeout="auto"
                                  unmountOnExit
                                >
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      p: 2,
                                      mb: 2,
                                      bgcolor: "background.default",
                                    }}
                                  >
                                    <Stack spacing={2}>
                                      <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={2}
                                        justifyContent="space-between"
                                        alignItems={{
                                          xs: "stretch",
                                          sm: "center",
                                        }}
                                      >
                                        <Box>
                                          <Typography
                                            variant="subtitle1"
                                            fontWeight={600}
                                          >
                                            Accounts for {client.first_name}{" "}
                                            {client.last_name}
                                          </Typography>
                                          <Typography
                                            variant="body2"
                                            color="text.secondary"
                                          >
                                            Add and manage banking, retirement,
                                            trust, and liability accounts.
                                          </Typography>
                                        </Box>
                                        <Button
                                          startIcon={<AddRoundedIcon />}
                                          variant="contained"
                                          onClick={() =>
                                            openCreateAccountDialog(client)
                                          }
                                        >
                                          Add account
                                        </Button>
                                      </Stack>

                                      {clientAccounts.length === 0 ? (
                                        <Paper
                                          variant="outlined"
                                          sx={{ p: 2.5 }}
                                        >
                                          <Typography color="text.secondary">
                                            No accounts yet for this client.
                                          </Typography>
                                        </Paper>
                                      ) : (
                                        <Box
                                          sx={{
                                            display: "grid",
                                            gap: 1.5,
                                            gridTemplateColumns: {
                                              xs: "1fr",
                                              md: "repeat(2, minmax(0, 1fr))",
                                            },
                                          }}
                                        >
                                          {clientAccounts.map((account) => (
                                            <Paper
                                              key={account.id}
                                              variant="outlined"
                                              sx={{
                                                p: 2,
                                                bgcolor: "background.paper",
                                              }}
                                            >
                                              <Stack spacing={1.5}>
                                                <Stack
                                                  direction="row"
                                                  justifyContent="space-between"
                                                  alignItems="flex-start"
                                                  spacing={1}
                                                >
                                                  <Box>
                                                    <Typography
                                                      fontWeight={600}
                                                    >
                                                      {account.bank}
                                                    </Typography>
                                                    <Typography
                                                      variant="body2"
                                                      color="text.secondary"
                                                    >
                                                      {account.number}
                                                    </Typography>
                                                    <Typography
                                                      variant="body2"
                                                      color="text.secondary"
                                                    >
                                                      Interest rate:{" "}
                                                      {formatPercent(
                                                        account.interest_rate ??
                                                          0,
                                                      )}
                                                    </Typography>
                                                  </Box>
                                                  <Chip
                                                    size="small"
                                                    label={formatAccountType(
                                                      account.type,
                                                    )}
                                                  />
                                                </Stack>
                                                <Stack
                                                  direction="row"
                                                  justifyContent="flex-end"
                                                  spacing={1}
                                                >
                                                  <Button
                                                    size="small"
                                                    onClick={() =>
                                                      openEditAccountDialog(
                                                        client,
                                                        account,
                                                      )
                                                    }
                                                  >
                                                    Edit
                                                  </Button>
                                                  <Button
                                                    size="small"
                                                    color="error"
                                                    onClick={() =>
                                                      void handleDeleteAccount(
                                                        client,
                                                        account,
                                                      )
                                                    }
                                                  >
                                                    Delete
                                                  </Button>
                                                </Stack>
                                              </Stack>
                                            </Paper>
                                          ))}
                                        </Box>
                                      )}
                                    </Stack>
                                  </Paper>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>

      <Dialog
        open={Boolean(editingHousehold)}
        onClose={() => setEditingHousehold(null)}
        fullWidth
      >
        <DialogTitle>Edit household</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              label="Household name"
              fullWidth
              value={editingHouseholdName}
              onChange={(event) => setEditingHouseholdName(event.target.value)}
            />
            <TextField
              label="Monthly expense"
              fullWidth
              value={formatCurrencyInput(editingHouseholdMonthlyExpense)}
              onChange={(event) =>
                setEditingHouseholdMonthlyExpense(
                  normalizeCurrencyInput(event.target.value),
                )
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingHousehold(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleUpdateHousehold()}
            disabled={
              submittingHousehold || editingHouseholdName.trim().length === 0
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editingClient)}
        onClose={() => setEditingClient(null)}
        fullWidth
      >
        <DialogTitle>Edit client</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            <TextField
              label="First name"
              value={editingClientForm.first_name}
              onChange={(event) =>
                setEditingClientForm((current) => ({
                  ...current,
                  first_name: event.target.value,
                }))
              }
            />
            <TextField
              label="Last name"
              value={editingClientForm.last_name}
              onChange={(event) =>
                setEditingClientForm((current) => ({
                  ...current,
                  last_name: event.target.value,
                }))
              }
            />
            <TextField
              label="Date of birth"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={editingClientForm.day_of_birth}
              onChange={(event) =>
                setEditingClientForm((current) => ({
                  ...current,
                  day_of_birth: event.target.value,
                }))
              }
            />
            <TextField
              label="Last four SSN"
              inputProps={{ maxLength: 4 }}
              value={editingClientForm.last_four_ssn}
              onChange={(event) =>
                setEditingClientForm((current) => ({
                  ...current,
                  last_four_ssn: event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 4),
                }))
              }
            />
            <TextField
              label="Monthly salary"
              value={formatCurrencyInput(editingClientForm.monthly_salary)}
              onChange={(event) =>
                setEditingClientForm((current) => ({
                  ...current,
                  monthly_salary: normalizeCurrencyInput(event.target.value),
                }))
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editingClientForm.is_primary_income}
                    onChange={(event) =>
                      setEditingClientForm((current) => ({
                        ...current,
                        is_primary_income: event.target.checked,
                      }))
                    }
                  />
                }
                label="Primary income client"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingClient(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleUpdateClient()}
            disabled={
              submittingClient ||
              editingClientForm.first_name.trim().length === 0 ||
              editingClientForm.last_name.trim().length === 0 ||
              editingClientForm.day_of_birth.length === 0 ||
              editingClientForm.last_four_ssn.length !== 4 ||
              editingClientForm.monthly_salary.length === 0
            }
          >
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isCreateClientDialogOpen}
        onClose={closeCreateClientDialog}
        fullWidth
      >
        <DialogTitle>Add client</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            <TextField
              label="First name"
              value={clientForm.first_name}
              onChange={(event) =>
                setClientForm((current) => ({
                  ...current,
                  first_name: event.target.value,
                }))
              }
            />
            <TextField
              label="Last name"
              value={clientForm.last_name}
              onChange={(event) =>
                setClientForm((current) => ({
                  ...current,
                  last_name: event.target.value,
                }))
              }
            />
            <TextField
              label="Date of birth"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={clientForm.day_of_birth}
              onChange={(event) =>
                setClientForm((current) => ({
                  ...current,
                  day_of_birth: event.target.value,
                }))
              }
            />
            <TextField
              label="Last four SSN"
              inputProps={{ maxLength: 4 }}
              value={clientForm.last_four_ssn}
              onChange={(event) =>
                setClientForm((current) => ({
                  ...current,
                  last_four_ssn: event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 4),
                }))
              }
            />
            <TextField
              label="Monthly salary"
              value={formatCurrencyInput(clientForm.monthly_salary)}
              onChange={(event) =>
                setClientForm((current) => ({
                  ...current,
                  monthly_salary: normalizeCurrencyInput(event.target.value),
                }))
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={clientForm.is_primary_income}
                    onChange={(event) =>
                      setClientForm((current) => ({
                        ...current,
                        is_primary_income: event.target.checked,
                      }))
                    }
                  />
                }
                label="Primary income client"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateClientDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const created = await handleCreateClient();
              if (created) {
                closeCreateClientDialog();
              }
            }}
            disabled={
              !selectedHouseholdId ||
              hasReachedClientLimit ||
              submittingClient ||
              clientForm.first_name.trim().length === 0 ||
              clientForm.last_name.trim().length === 0 ||
              clientForm.day_of_birth.length === 0 ||
              clientForm.last_four_ssn.length !== 4 ||
              clientForm.monthly_salary.length === 0
            }
          >
            Add client
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isCreateAccountDialogOpen}
        onClose={closeCreateAccountDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Add account
          {accountTargetClient ? ` for ${accountTargetClient.first_name}` : ""}
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            <TextField
              label="Account number"
              value={accountForm.number}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
            />
            <TextField
              select
              label="Account type"
              value={accountForm.type}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  type: event.target.value as AccountType,
                }))
              }
            >
              {accountTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Bank"
              value={accountForm.bank}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  bank: event.target.value,
                }))
              }
            />
            <TextField
              label="Interest rate"
              value={accountForm.interest_rate}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  interest_rate: normalizePercentInput(event.target.value),
                }))
              }
              placeholder="0.00"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateAccountDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              const created = await handleCreateAccount();
              if (created) {
                closeCreateAccountDialog();
              }
            }}
            disabled={
              !accountTargetClient ||
              submittingAccount ||
              accountForm.number.trim().length === 0 ||
              accountForm.bank.trim().length === 0
            }
          >
            Add account
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editingAccount)}
        onClose={closeEditAccountDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit account</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
            }}
          >
            <TextField
              label="Account number"
              value={accountForm.number}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
            />
            <TextField
              select
              label="Account type"
              value={accountForm.type}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  type: event.target.value as AccountType,
                }))
              }
            >
              {accountTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Bank"
              value={accountForm.bank}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  bank: event.target.value,
                }))
              }
            />
            <TextField
              label="Interest rate"
              value={accountForm.interest_rate}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  interest_rate: normalizePercentInput(event.target.value),
                }))
              }
              placeholder="0.00"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditAccountDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleUpdateAccount()}
            disabled={
              !editingAccount ||
              submittingAccount ||
              accountForm.number.trim().length === 0 ||
              accountForm.bank.trim().length === 0
            }
          >
            Save changes
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
