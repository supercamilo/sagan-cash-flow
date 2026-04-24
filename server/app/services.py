from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import (
    Account,
    AccountType,
    AllocationPoint,
    BalanceSnapshot,
    BalanceSnapshotGroup,
    BalanceSnapshotGroupWithSnapshots,
    Client,
    Household,
    HouseholdAccountBalanceRow,
    HouseholdBalanceSnapshotRow,
    HouseholdReport,
    NetWorthPoint,
    SacsClientBreakdown,
    SacsReport,
)


def get_household_or_404(session: Session, household_id: int) -> Household:
    household = session.get(Household, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found.")
    return household


def get_client_or_404(session: Session, client_id: int) -> Client:
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found.")
    return client


def get_account_or_404(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return account


def get_balance_snapshot_group_or_404(
    session: Session, group_id: int
) -> BalanceSnapshotGroup:
    group = session.get(BalanceSnapshotGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Balance snapshot group not found.")
    return group


def ensure_group_household_match(
    group: BalanceSnapshotGroup, household_id: int
) -> None:
    if group.household_id != household_id:
        raise HTTPException(
            status_code=400,
            detail="Balance snapshot group does not belong to the selected household.",
        )


def ensure_household_has_one_primary_income(session: Session, household_id: int) -> None:
    primary_clients = session.exec(
        select(Client).where(
            Client.household_id == household_id,
            Client.is_primary_income.is_(True),
        )
    ).all()
    if len(primary_clients) != 1:
        raise HTTPException(
            status_code=400,
            detail="Each household must have exactly one client marked as primary income.",
        )


def ensure_household_client_limit(
    session: Session,
    household_id: int,
    *,
    excluding_client_id: int | None = None,
    incoming_count: int = 1,
) -> None:
    household_clients = session.exec(
        select(Client).where(Client.household_id == household_id)
    ).all()
    current_count = len(
        [client for client in household_clients if client.id != excluding_client_id]
    )
    if current_count + incoming_count > 2:
        raise HTTPException(
            status_code=400,
            detail="Each household can have at most 2 clients.",
        )


def assign_primary_income_client(
    session: Session, household_id: int, selected_client_id: int
) -> None:
    household_clients = session.exec(
        select(Client).where(Client.household_id == household_id)
    ).all()
    for household_client in household_clients:
        household_client.is_primary_income = household_client.id == selected_client_id
        session.add(household_client)


def ensure_client_household_match(client: Client, household_id: int) -> None:
    if client.household_id != household_id:
        raise HTTPException(
            status_code=400,
            detail="Client does not belong to the selected household.",
        )


def validate_balance_values(total_balance: float, cash_balance: float) -> None:
    if total_balance >= 0 and cash_balance >= total_balance:
        raise HTTPException(
            status_code=400,
            detail="Total balance must be higher than cash balance.",
        )


def build_household_account_rows(
    session: Session, household_id: int, balance_date: date | None = None
) -> list[HouseholdAccountBalanceRow]:
    get_household_or_404(session, household_id)
    accounts = session.exec(
        select(Account, Client)
        .join(Client, Client.id == Account.client_id)
        .where(Client.household_id == household_id)
        .order_by(Client.last_name, Client.first_name, Account.bank, Account.number)
    ).all()

    rows: list[HouseholdAccountBalanceRow] = []
    for account, client in accounts:
        snapshot = None
        if balance_date is not None:
            snapshot = session.exec(
                select(BalanceSnapshot).where(
                    BalanceSnapshot.account_id == account.id,
                    BalanceSnapshot.balance_date == balance_date,
                )
            ).first()

        rows.append(
            HouseholdAccountBalanceRow(
                account_id=account.id,
                client_id=client.id,
                client_name=f"{client.first_name} {client.last_name}",
                household_id=household_id,
                account_number=account.number,
                account_type=account.type,
                bank=account.bank,
                balance_date=snapshot.balance_date if snapshot else None,
                total_balance=snapshot.total_balance if snapshot else None,
                cash_balance=snapshot.cash_balance if snapshot else None,
            )
        )
    return rows


def build_household_balance_snapshot_rows(
    session: Session, household_id: int
) -> list[HouseholdBalanceSnapshotRow]:
    get_household_or_404(session, household_id)
    results = session.exec(
        select(BalanceSnapshot, Account, Client)
        .join(Account, Account.id == BalanceSnapshot.account_id)
        .join(Client, Client.id == Account.client_id)
        .where(Client.household_id == household_id)
        .order_by(
            Client.last_name,
            Client.first_name,
            BalanceSnapshot.balance_date.desc(),
            Account.bank,
            Account.number,
        )
    ).all()

    return [
        HouseholdBalanceSnapshotRow(
            snapshot_id=snapshot.id,
            account_id=account.id,
            client_id=client.id,
            client_name=f"{client.first_name} {client.last_name}",
            household_id=household_id,
            account_number=account.number,
            account_type=account.type,
            bank=account.bank,
            balance_date=snapshot.balance_date,
            total_balance=snapshot.total_balance,
            cash_balance=snapshot.cash_balance,
            balance_snapshot_group_id=snapshot.balance_snapshot_group_id,
        )
        for snapshot, account, client in results
    ]


def build_household_balance_snapshot_groups(
    session: Session, household_id: int
) -> list[BalanceSnapshotGroupWithSnapshots]:
    get_household_or_404(session, household_id)
    groups = session.exec(
        select(BalanceSnapshotGroup)
        .where(BalanceSnapshotGroup.household_id == household_id)
        .order_by(BalanceSnapshotGroup.created_at)
    ).all()
    rows = build_household_balance_snapshot_rows(session, household_id)
    grouped: dict[int, list[HouseholdBalanceSnapshotRow]] = {}
    for row in rows:
        grouped.setdefault(row.balance_snapshot_group_id, []).append(row)
    return [
        BalanceSnapshotGroupWithSnapshots(
            id=group.id,
            household_id=group.household_id,
            name=group.name,
            created_at=group.created_at,
            snapshots=grouped.get(group.id, []),
        )
        for group in groups
    ]


def build_sacs_report(session: Session, group_id: int) -> SacsReport:
    group = get_balance_snapshot_group_or_404(session, group_id)
    household = get_household_or_404(session, group.household_id)
    clients = session.exec(
        select(Client)
        .where(Client.household_id == household.id)
        .order_by(Client.last_name, Client.first_name)
    ).all()
    client_breakdown = [
        SacsClientBreakdown(
            client_id=client.id,
            client_name=f"{client.first_name} {client.last_name}",
            monthly_salary=client.monthly_salary,
        )
        for client in clients
    ]
    monthly_inflow = sum(client.monthly_salary for client in clients)
    monthly_outflow = household.monthly_expense
    snapshot_dates = session.exec(
        select(BalanceSnapshot.balance_date)
        .where(BalanceSnapshot.balance_snapshot_group_id == group.id)
        .order_by(BalanceSnapshot.balance_date.desc())
    ).all()
    group_date = snapshot_dates[0] if snapshot_dates else group.created_at.date()
    return SacsReport(
        group_id=group.id,
        group_name=group.name,
        group_date=group_date,
        household_id=household.id,
        household_name=household.name,
        clients=client_breakdown,
        monthly_inflow=round(monthly_inflow, 2),
        monthly_outflow=round(monthly_outflow, 2),
        monthly_private_reserve=round(monthly_inflow - monthly_outflow, 2),
    )


def build_household_report(session: Session, household_id: int) -> HouseholdReport:
    household = get_household_or_404(session, household_id)
    clients = session.exec(
        select(Client).where(Client.household_id == household_id).order_by(Client.id)
    ).all()
    primary_clients = [client for client in clients if client.is_primary_income]
    if len(primary_clients) != 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot generate report until the household has exactly one primary income client.",
        )

    client_ids = [client.id for client in clients]
    if not client_ids:
        raise HTTPException(status_code=400, detail="Household has no clients.")

    accounts = session.exec(select(Account).where(Account.client_id.in_(client_ids))).all()
    account_map = {account.id: account for account in accounts}
    snapshots = session.exec(
        select(BalanceSnapshot).where(BalanceSnapshot.account_id.in_(list(account_map.keys())))
    ).all() if account_map else []

    grouped_by_date: dict[date, dict[str, float]] = defaultdict(
        lambda: {"assets": 0.0, "liabilities": 0.0, "cash": 0.0}
    )
    latest_date: date | None = None
    latest_allocations: dict[AccountType, AllocationPoint] = {}

    for snapshot in snapshots:
        account = account_map[snapshot.account_id]
        bucket = grouped_by_date[snapshot.balance_date]
        if account.type == AccountType.liabilities:
            bucket["liabilities"] += abs(snapshot.total_balance)
        else:
            bucket["assets"] += snapshot.total_balance
            bucket["cash"] += snapshot.cash_balance

        if latest_date is None or snapshot.balance_date > latest_date:
            latest_date = snapshot.balance_date

    if latest_date is not None:
        latest_snapshots = [s for s in snapshots if s.balance_date == latest_date]
        allocation_totals: dict[AccountType, dict[str, float]] = defaultdict(
            lambda: {"total": 0.0, "cash": 0.0}
        )
        for snapshot in latest_snapshots:
            account = account_map[snapshot.account_id]
            allocation_totals[account.type]["total"] += snapshot.total_balance
            allocation_totals[account.type]["cash"] += snapshot.cash_balance
        latest_allocations = {
            account_type: AllocationPoint(
                account_type=account_type,
                total_balance=round(values["total"], 2),
                cash_balance=round(values["cash"], 2),
            )
            for account_type, values in allocation_totals.items()
        }

    net_worth_series = [
        NetWorthPoint(
            balance_date=balance_date,
            assets_total=round(values["assets"], 2),
            liabilities_total=round(values["liabilities"], 2),
            net_worth=round(values["assets"] - values["liabilities"], 2),
            cash_total=round(values["cash"], 2),
        )
        for balance_date, values in sorted(grouped_by_date.items(), key=lambda item: item[0])
    ]

    primary = primary_clients[0]
    return HouseholdReport(
        household_id=household.id,
        household_name=household.name,
        primary_income_client_id=primary.id,
        primary_income_client_name=f"{primary.first_name} {primary.last_name}",
        monthly_household_salary=round(sum(client.monthly_salary for client in clients), 2),
        latest_snapshot_date=latest_date,
        net_worth_series=net_worth_series,
        allocation_by_type=list(latest_allocations.values()),
    )
