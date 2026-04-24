import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
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
import { Link as RouterLink } from "react-router-dom";
import {
  accountApi,
  ApiError,
  balanceSnapshotApi,
  balanceSnapshotGroupApi,
  householdApi,
} from "../lib/api";
import {
  formatCurrencyInput,
  normalizeCurrencyInput,
  parseCurrencyInput,
} from "../lib/currency";
import type {
  Account,
  BalanceSnapshotGroupWithSnapshots,
  HouseholdBalanceSnapshotRow,
  HouseholdSummary,
} from "../types/finance";

type EditableSnapshotRow = HouseholdBalanceSnapshotRow & {
  balance_date_input: string;
  total_balance_input: string;
  cash_balance_input: string;
};

type GroupState = {
  id: number;
  household_id: number;
  name: string;
  created_at: string;
  snapshots: EditableSnapshotRow[];
};

type AddSnapshotForm = {
  account_id: number | "";
  balance_date: string;
  total_balance: string;
  cash_balance: string;
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isBalancePairInvalid(total: number, cash: number) {
  return total >= 0 && cash >= total;
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

function toEditableRow(row: HouseholdBalanceSnapshotRow): EditableSnapshotRow {
  return {
    ...row,
    balance_date_input: row.balance_date,
    total_balance_input: row.total_balance.toString(),
    cash_balance_input: row.cash_balance.toString(),
  };
}

function toGroupState(group: BalanceSnapshotGroupWithSnapshots): GroupState {
  return {
    id: group.id,
    household_id: group.household_id,
    name: group.name,
    created_at: group.created_at,
    snapshots: group.snapshots.map(toEditableRow),
  };
}

const EMPTY_ADD_FORM: AddSnapshotForm = {
  account_id: "",
  balance_date: getTodayDate(),
  total_balance: "",
  cash_balance: "",
};

export default function BalanceSnapshotsPage() {
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | "">(
    "",
  );
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [householdAccounts, setHouseholdAccounts] = useState<Account[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  const [loadingHouseholds, setLoadingHouseholds] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createGroupName, setCreateGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [renameGroupId, setRenameGroupId] = useState<number | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState(false);

  const [addDialogGroupId, setAddDialogGroupId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<AddSnapshotForm>(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHouseholds() {
      setLoadingHouseholds(true);
      try {
        const data = await householdApi.list();
        setHouseholds(data);
        setSelectedHouseholdId((current) => current || data[0]?.id || "");
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setLoadingHouseholds(false);
      }
    }

    void loadHouseholds();
  }, []);

  useEffect(() => {
    if (!selectedHouseholdId) {
      setGroups([]);
      setHouseholdAccounts([]);
      setExpandedGroupId(null);
      return;
    }
    void handleLoadGroups();
    void loadHouseholdAccounts();
  }, [selectedHouseholdId]);

  async function loadHouseholdAccounts() {
    if (!selectedHouseholdId) {
      return;
    }
    try {
      const data = await accountApi.listByHousehold(Number(selectedHouseholdId));
      setHouseholdAccounts(data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleLoadGroups() {
    if (!selectedHouseholdId) {
      return;
    }
    setLoadingGroups(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await balanceSnapshotGroupApi.listByHousehold(
        Number(selectedHouseholdId),
      );
      setGroups(data.map(toGroupState));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoadingGroups(false);
    }
  }

  async function handleCreateGroup() {
    if (!selectedHouseholdId || createGroupName.trim().length === 0) {
      return;
    }
    setCreatingGroup(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await balanceSnapshotGroupApi.create({
        household_id: Number(selectedHouseholdId),
        name: createGroupName.trim(),
      });
      setCreateGroupName("");
      await handleLoadGroups();
      setSuccessMessage("Balance snapshot group created.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setCreatingGroup(false);
    }
  }

  function openRenameDialog(group: GroupState) {
    setRenameGroupId(group.id);
    setRenameGroupName(group.name);
  }

  async function handleRenameGroup() {
    if (renameGroupId === null || renameGroupName.trim().length === 0) {
      return;
    }
    setRenamingGroup(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await balanceSnapshotGroupApi.update(renameGroupId, {
        name: renameGroupName.trim(),
      });
      setRenameGroupId(null);
      setRenameGroupName("");
      await handleLoadGroups();
      setSuccessMessage("Group renamed.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRenamingGroup(false);
    }
  }

  async function handleDeleteGroup(group: GroupState) {
    const confirmed = window.confirm(
      `Delete group "${group.name}"? All of its snapshots will be deleted as well.`,
    );
    if (!confirmed) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await balanceSnapshotGroupApi.remove(group.id);
      await handleLoadGroups();
      setSuccessMessage("Group deleted.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function updateSnapshotValue(
    groupId: number,
    snapshotId: number,
    field:
      | "total_balance_input"
      | "cash_balance_input"
      | "balance_date_input",
    value: string,
  ) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              snapshots: group.snapshots.map((row) =>
                row.snapshot_id === snapshotId
                  ? { ...row, [field]: value }
                  : row,
              ),
            }
          : group,
      ),
    );
  }

  async function handleSaveGroup(groupId: number) {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group || group.snapshots.length === 0) {
      return;
    }

    setSavingGroupId(groupId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      for (const row of group.snapshots) {
        if (
          row.total_balance_input.trim().length === 0 ||
          row.cash_balance_input.trim().length === 0 ||
          row.balance_date_input.trim().length === 0
        ) {
          continue;
        }
        const total = parseCurrencyInput(row.total_balance_input);
        const cash = parseCurrencyInput(row.cash_balance_input);
        if (isBalancePairInvalid(total, cash)) {
          setErrorMessage(
            `Total balance must be higher than cash balance (${row.bank} ${row.account_number} on ${row.balance_date_input}).`,
          );
          setSavingGroupId(null);
          return;
        }
        await balanceSnapshotApi.update(row.snapshot_id, {
          balance_date: row.balance_date_input,
          total_balance: total,
          cash_balance: cash,
          balance_snapshot_group_id: groupId,
        });
      }
      await handleLoadGroups();
      setSuccessMessage("Balance snapshot values saved.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingGroupId(null);
    }
  }

  async function handleDeleteSnapshot(snapshotId: number) {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await balanceSnapshotApi.remove(snapshotId);
      await handleLoadGroups();
      setSuccessMessage("Balance snapshot deleted.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function openAddDialog(groupId: number) {
    setAddError(null);
    setAddDialogGroupId(groupId);
    let accounts = householdAccounts;
    if (accounts.length === 0 && selectedHouseholdId) {
      try {
        accounts = await accountApi.listByHousehold(
          Number(selectedHouseholdId),
        );
        setHouseholdAccounts(accounts);
      } catch (error) {
        setAddError(getErrorMessage(error));
        return;
      }
    }
    setAddForm({
      ...EMPTY_ADD_FORM,
      account_id: accounts[0]?.id ?? "",
    });
  }

  async function handleCreateSnapshot() {
    if (addDialogGroupId === null) {
      return;
    }
    if (
      addForm.account_id === "" ||
      !addForm.balance_date ||
      addForm.total_balance.trim().length === 0 ||
      addForm.cash_balance.trim().length === 0
    ) {
      setAddError("Please fill in every field.");
      return;
    }

    const total = parseCurrencyInput(addForm.total_balance);
    const cash = parseCurrencyInput(addForm.cash_balance);
    if (isBalancePairInvalid(total, cash)) {
      setAddError("Total balance must be higher than cash balance.");
      return;
    }

    setAddSaving(true);
    setAddError(null);
    try {
      await accountApi.upsertBalance(Number(addForm.account_id), {
        balance_date: addForm.balance_date,
        total_balance: total,
        cash_balance: cash,
        balance_snapshot_group_id: addDialogGroupId,
      });
      setAddDialogGroupId(null);
      await handleLoadGroups();
      setSuccessMessage("Balance snapshot added.");
    } catch (error) {
      setAddError(getErrorMessage(error));
    } finally {
      setAddSaving(false);
    }
  }

  function toggleGroup(groupId: number) {
    setExpandedGroupId((current) => (current === groupId ? null : groupId));
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4">Balance Snapshots</Typography>
        <Typography color="text.secondary">
          Pick a household, manage its balance snapshot groups, and edit the
          snapshots inside each group.
        </Typography>
      </Stack>

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      {successMessage ? (
        <Alert severity="success">{successMessage}</Alert>
      ) : null}

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <CardContent>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", lg: "center" }}
          >
            <TextField
              select
              label="Household"
              value={selectedHouseholdId}
              onChange={(event) =>
                setSelectedHouseholdId(Number(event.target.value))
              }
              disabled={loadingHouseholds}
              sx={{ minWidth: { lg: 280 } }}
            >
              {households.map((household) => (
                <MenuItem key={household.id} value={household.id}>
                  {household.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!selectedHouseholdId ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Select a household to view its balance snapshot groups.
          </Typography>
        </Paper>
      ) : (
        <Card
          elevation={0}
          sx={{ border: "1px solid", borderColor: "divider" }}
        >
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ xs: "stretch", md: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="h6">Balance snapshot groups</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create a group to bundle snapshot records together.
                  </Typography>
                </Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <TextField
                    size="small"
                    label="New group name"
                    value={createGroupName}
                    onChange={(event) => setCreateGroupName(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    startIcon={
                      creatingGroup ? (
                        <CircularProgress size={16} />
                      ) : (
                        <AddRoundedIcon />
                      )
                    }
                    onClick={() => void handleCreateGroup()}
                    disabled={
                      creatingGroup || createGroupName.trim().length === 0
                    }
                  >
                    Add group
                  </Button>
                </Stack>
              </Stack>

              {loadingGroups ? (
                <Stack direction="row" spacing={2} alignItems="center">
                  <CircularProgress size={20} />
                  <Typography color="text.secondary">
                    Loading groups...
                  </Typography>
                </Stack>
              ) : groups.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 3, bgcolor: "background.default" }}
                >
                  <Typography color="text.secondary">
                    No balance snapshot groups yet. Create one to begin adding
                    snapshots.
                  </Typography>
                </Paper>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Snapshots</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((group) => {
                      const isExpanded = expandedGroupId === group.id;
                      const isSaving = savingGroupId === group.id;
                      return (
                        <Fragment key={group.id}>
                          <TableRow hover>
                            <TableCell>
                              <Typography fontWeight={600}>
                                {group.name}
                              </Typography>
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
                                onClick={() => toggleGroup(group.id)}
                              >
                                {group.snapshots.length} snapshots
                              </Button>
                            </TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/reports/sacs/${group.id}`}
                                aria-label="Open SACS report"
                              >
                                <AssessmentOutlinedIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => openRenameDialog(group)}
                                aria-label="Rename group"
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => void handleDeleteGroup(group)}
                                aria-label="Delete group"
                              >
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell
                              colSpan={3}
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
                                          Snapshots in {group.name}
                                        </Typography>
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                        >
                                          Edit dates and balances, or add new
                                          snapshot records to this group.
                                        </Typography>
                                      </Box>
                                      <Stack direction="row" spacing={1}>
                                        <Button
                                          startIcon={<AddRoundedIcon />}
                                          variant="outlined"
                                          onClick={() =>
                                            void openAddDialog(group.id)
                                          }
                                        >
                                          Add snapshot
                                        </Button>
                                        <Button
                                          startIcon={
                                            isSaving ? (
                                              <CircularProgress size={16} />
                                            ) : (
                                              <SaveRoundedIcon />
                                            )
                                          }
                                          variant="contained"
                                          onClick={() =>
                                            void handleSaveGroup(group.id)
                                          }
                                          disabled={
                                            isSaving ||
                                            group.snapshots.length === 0
                                          }
                                        >
                                          Save all
                                        </Button>
                                      </Stack>
                                    </Stack>

                                    {group.snapshots.length === 0 ? (
                                      <Paper variant="outlined" sx={{ p: 2.5 }}>
                                        <Typography color="text.secondary">
                                          No snapshots in this group yet.
                                        </Typography>
                                      </Paper>
                                    ) : (
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Client</TableCell>
                                            <TableCell>Bank</TableCell>
                                            <TableCell>Account</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Snapshot date</TableCell>
                                            <TableCell>Total balance</TableCell>
                                            <TableCell>Cash balance</TableCell>
                                            <TableCell align="right" />
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {group.snapshots.map((row) => (
                                            <TableRow key={row.snapshot_id}>
                                              <TableCell>
                                                {row.client_name}
                                              </TableCell>
                                              <TableCell>{row.bank}</TableCell>
                                              <TableCell>
                                                {row.account_number}
                                              </TableCell>
                                              <TableCell>
                                                <Chip
                                                  size="small"
                                                  label={row.account_type}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <TextField
                                                  size="small"
                                                  type="date"
                                                  value={
                                                    row.balance_date_input
                                                  }
                                                  onChange={(event) =>
                                                    updateSnapshotValue(
                                                      group.id,
                                                      row.snapshot_id,
                                                      "balance_date_input",
                                                      event.target.value,
                                                    )
                                                  }
                                                  InputLabelProps={{
                                                    shrink: true,
                                                  }}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <TextField
                                                  size="small"
                                                  value={formatCurrencyInput(
                                                    row.total_balance_input,
                                                  )}
                                                  onChange={(event) =>
                                                    updateSnapshotValue(
                                                      group.id,
                                                      row.snapshot_id,
                                                      "total_balance_input",
                                                      normalizeCurrencyInput(
                                                        event.target.value,
                                                      ),
                                                    )
                                                  }
                                                  placeholder="0.00"
                                                  slotProps={{
                                                    input: {
                                                      startAdornment: (
                                                        <InputAdornment position="start">
                                                          $
                                                        </InputAdornment>
                                                      ),
                                                    },
                                                  }}
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <TextField
                                                  size="small"
                                                  value={formatCurrencyInput(
                                                    row.cash_balance_input,
                                                  )}
                                                  onChange={(event) =>
                                                    updateSnapshotValue(
                                                      group.id,
                                                      row.snapshot_id,
                                                      "cash_balance_input",
                                                      normalizeCurrencyInput(
                                                        event.target.value,
                                                      ),
                                                    )
                                                  }
                                                  placeholder="0.00"
                                                  slotProps={{
                                                    input: {
                                                      startAdornment: (
                                                        <InputAdornment position="start">
                                                          $
                                                        </InputAdornment>
                                                      ),
                                                    },
                                                  }}
                                                />
                                              </TableCell>
                                              <TableCell align="right">
                                                <IconButton
                                                  size="small"
                                                  onClick={() =>
                                                    void handleDeleteSnapshot(
                                                      row.snapshot_id,
                                                    )
                                                  }
                                                  aria-label="Delete snapshot"
                                                >
                                                  <DeleteOutlineRoundedIcon fontSize="small" />
                                                </IconButton>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
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
      )}

      <Dialog
        open={renameGroupId !== null}
        onClose={() => setRenameGroupId(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Rename group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Group name"
            value={renameGroupName}
            onChange={(event) => setRenameGroupName(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRenameGroupId(null)}
            disabled={renamingGroup}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleRenameGroup()}
            disabled={
              renamingGroup || renameGroupName.trim().length === 0
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addDialogGroupId !== null}
        onClose={() => setAddDialogGroupId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add balance snapshot</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {addError ? <Alert severity="error">{addError}</Alert> : null}
            {householdAccounts.length === 0 ? (
              <Alert severity="info">
                This household has no accounts yet. Create an account first to
                add a snapshot.
              </Alert>
            ) : null}
            <TextField
              select
              label="Account"
              value={addForm.account_id}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  account_id: Number(event.target.value),
                }))
              }
              disabled={householdAccounts.length === 0}
            >
              {householdAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.bank} — {account.number} ({account.type})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Snapshot date"
              type="date"
              value={addForm.balance_date}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  balance_date: event.target.value,
                }))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Total balance"
              value={formatCurrencyInput(addForm.total_balance)}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  total_balance: normalizeCurrencyInput(event.target.value),
                }))
              }
              placeholder="0.00"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Cash balance"
              value={formatCurrencyInput(addForm.cash_balance)}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  cash_balance: normalizeCurrencyInput(event.target.value),
                }))
              }
              placeholder="0.00"
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
          <Button
            onClick={() => setAddDialogGroupId(null)}
            disabled={addSaving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateSnapshot()}
            disabled={addSaving || householdAccounts.length === 0}
            startIcon={
              addSaving ? <CircularProgress size={16} /> : <AddRoundedIcon />
            }
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
