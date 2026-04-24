from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, func, select

from app.db import create_db_and_tables, get_session
from app.models import (
    Account,
    AccountCreate,
    AccountRead,
    AccountUpdate,
    BalanceSnapshot,
    BalanceSnapshotGroup,
    BalanceSnapshotGroupCreate,
    BalanceSnapshotGroupRead,
    BalanceSnapshotGroupUpdate,
    BalanceSnapshotRead,
    BalanceSnapshotUpsert,
    Client,
    ClientCreate,
    ClientRead,
    ClientUpdate,
    Household,
    HouseholdCreate,
    HouseholdRead,
    HouseholdSummary,
    HouseholdUpdate,
)
from app.services import (
    assign_primary_income_client,
    build_household_account_rows,
    build_household_balance_snapshot_groups,
    build_household_balance_snapshot_rows,
    build_household_report,
    build_sacs_report,
    ensure_client_household_match,
    ensure_group_household_match,
    ensure_household_client_limit,
    ensure_household_has_one_primary_income,
    get_account_or_404,
    get_balance_snapshot_group_or_404,
    get_client_or_404,
    get_household_or_404,
    validate_balance_values,
)


SessionDep = Annotated[Session, Depends(get_session)]

app = FastAPI(
    title="Sagan Household Finance API",
    version="0.1.0",
    description=(
        "Household finance API for managing households, clients, accounts, "
        "balance snapshots, and chart-friendly reporting."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/households", response_model=HouseholdRead, status_code=status.HTTP_201_CREATED)
def create_household(payload: HouseholdCreate, session: SessionDep) -> Household:
    household = Household.model_validate(payload)
    session.add(household)
    session.commit()
    session.refresh(household)
    return household


@app.get("/households", response_model=list[HouseholdSummary])
def list_households(session: SessionDep) -> list[HouseholdSummary]:
    households = session.exec(select(Household).order_by(Household.name)).all()
    summaries: list[HouseholdSummary] = []
    for household in households:
        clients = session.exec(
            select(Client).where(Client.household_id == household.id)
        ).all()
        client_ids = [client.id for client in clients]
        account_count = 0
        if client_ids:
            account_count = session.exec(
                select(func.count(Account.id)).where(Account.client_id.in_(client_ids))
            ).one()

        primary = next((client for client in clients if client.is_primary_income), None)
        summaries.append(
            HouseholdSummary(
                **household.model_dump(),
                client_count=len(clients),
                account_count=account_count,
                primary_income_client_id=primary.id if primary else None,
            )
        )
    return summaries


@app.get("/households/{household_id}", response_model=HouseholdRead)
def get_household(household_id: int, session: SessionDep) -> Household:
    return get_household_or_404(session, household_id)


@app.patch("/households/{household_id}", response_model=HouseholdRead)
def update_household(
    household_id: int, payload: HouseholdUpdate, session: SessionDep
) -> Household:
    household = get_household_or_404(session, household_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(household, field, value)
    session.add(household)
    session.commit()
    session.refresh(household)
    return household


@app.delete("/households/{household_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_household(household_id: int, session: SessionDep) -> Response:
    household = get_household_or_404(session, household_id)
    clients = session.exec(select(Client).where(Client.household_id == household_id)).all()
    client_ids = [client.id for client in clients]
    if client_ids:
        accounts = session.exec(select(Account).where(Account.client_id.in_(client_ids))).all()
        account_ids = [account.id for account in accounts]
        if account_ids:
            snapshots = session.exec(
                select(BalanceSnapshot).where(BalanceSnapshot.account_id.in_(account_ids))
            ).all()
            for snapshot in snapshots:
                session.delete(snapshot)
        for account in accounts:
            session.delete(account)
        for client in clients:
            session.delete(client)
    groups = session.exec(
        select(BalanceSnapshotGroup).where(
            BalanceSnapshotGroup.household_id == household_id
        )
    ).all()
    for group in groups:
        session.delete(group)
    session.delete(household)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/clients", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, session: SessionDep) -> Client:
    get_household_or_404(session, payload.household_id)
    ensure_household_client_limit(session, payload.household_id)
    client = Client.model_validate(payload)
    session.add(client)
    session.flush()
    if client.is_primary_income:
        assign_primary_income_client(session, client.household_id, client.id)
    ensure_household_has_one_primary_income(session, client.household_id)
    session.commit()
    session.refresh(client)
    return client


@app.get("/clients", response_model=list[ClientRead])
def list_clients(
    session: SessionDep,
    household_id: int | None = Query(default=None),
) -> list[Client]:
    statement = select(Client).order_by(Client.last_name, Client.first_name)
    if household_id is not None:
        statement = statement.where(Client.household_id == household_id)
    return session.exec(statement).all()


@app.get("/clients/{client_id}", response_model=ClientRead)
def get_client(client_id: int, session: SessionDep) -> Client:
    return get_client_or_404(session, client_id)


@app.patch("/clients/{client_id}", response_model=ClientRead)
def update_client(client_id: int, payload: ClientUpdate, session: SessionDep) -> Client:
    client = get_client_or_404(session, client_id)
    original_household_id = client.household_id
    updates = payload.model_dump(exclude_unset=True)

    if "household_id" in updates:
        get_household_or_404(session, updates["household_id"])
        ensure_household_client_limit(
            session,
            updates["household_id"],
            excluding_client_id=client.id,
        )

    for field, value in updates.items():
        setattr(client, field, value)

    session.add(client)
    session.flush()
    if client.is_primary_income:
        assign_primary_income_client(session, client.household_id, client.id)
    ensure_household_has_one_primary_income(session, client.household_id)
    if original_household_id != client.household_id:
        ensure_household_has_one_primary_income(session, original_household_id)
    session.commit()
    session.refresh(client)
    return client


@app.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, session: SessionDep) -> Response:
    client = get_client_or_404(session, client_id)
    household_id = client.household_id
    accounts = session.exec(select(Account).where(Account.client_id == client_id)).all()
    account_ids = [account.id for account in accounts]
    if account_ids:
        snapshots = session.exec(
            select(BalanceSnapshot).where(BalanceSnapshot.account_id.in_(account_ids))
        ).all()
        for snapshot in snapshots:
            session.delete(snapshot)
    for account in accounts:
        session.delete(account)
    session.delete(client)
    session.flush()
    remaining = session.exec(
        select(Client).where(Client.household_id == household_id)
    ).all()
    if remaining:
        ensure_household_has_one_primary_income(session, household_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, session: SessionDep) -> Account:
    get_client_or_404(session, payload.client_id)
    account = Account.model_validate(payload)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@app.get("/accounts", response_model=list[AccountRead])
def list_accounts(
    session: SessionDep,
    client_id: int | None = Query(default=None),
    household_id: int | None = Query(default=None),
) -> list[Account]:
    if client_id is not None and household_id is not None:
        client = get_client_or_404(session, client_id)
        ensure_client_household_match(client, household_id)

    statement = select(Account).order_by(Account.bank, Account.number)
    if client_id is not None:
        statement = statement.where(Account.client_id == client_id)
    elif household_id is not None:
        client_ids = session.exec(
            select(Client.id).where(Client.household_id == household_id)
        ).all()
        if not client_ids:
            return []
        statement = statement.where(Account.client_id.in_(client_ids))
    return session.exec(statement).all()


@app.get("/accounts/{account_id}", response_model=AccountRead)
def get_account(account_id: int, session: SessionDep) -> Account:
    return get_account_or_404(session, account_id)


@app.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, session: SessionDep) -> Account:
    account = get_account_or_404(session, account_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(account, field, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@app.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, session: SessionDep) -> Response:
    account = get_account_or_404(session, account_id)
    snapshots = session.exec(
        select(BalanceSnapshot).where(BalanceSnapshot.account_id == account_id)
    ).all()
    for snapshot in snapshots:
        session.delete(snapshot)
    session.delete(account)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/accounts/{account_id}/balances",
    response_model=BalanceSnapshotRead,
    status_code=status.HTTP_201_CREATED,
)
def create_balance_snapshot(
    account_id: int, payload: BalanceSnapshotUpsert, session: SessionDep
) -> BalanceSnapshot:
    get_account_or_404(session, account_id)
    validate_balance_values(payload.total_balance, payload.cash_balance)
    get_balance_snapshot_group_or_404(session, payload.balance_snapshot_group_id)
    existing = session.exec(
        select(BalanceSnapshot).where(
            BalanceSnapshot.account_id == account_id,
            BalanceSnapshot.balance_date == payload.balance_date,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A balance snapshot already exists for that account and date.",
        )

    snapshot = BalanceSnapshot(
        account_id=account_id,
        balance_date=payload.balance_date,
        total_balance=payload.total_balance,
        cash_balance=payload.cash_balance,
        balance_snapshot_group_id=payload.balance_snapshot_group_id,
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


@app.put("/accounts/{account_id}/balances", response_model=BalanceSnapshotRead)
def upsert_balance_snapshot(
    account_id: int, payload: BalanceSnapshotUpsert, session: SessionDep
) -> BalanceSnapshot:
    get_account_or_404(session, account_id)
    validate_balance_values(payload.total_balance, payload.cash_balance)
    get_balance_snapshot_group_or_404(session, payload.balance_snapshot_group_id)
    snapshot = session.exec(
        select(BalanceSnapshot).where(
            BalanceSnapshot.account_id == account_id,
            BalanceSnapshot.balance_date == payload.balance_date,
        )
    ).first()
    if snapshot is None:
        snapshot = BalanceSnapshot(
            account_id=account_id,
            balance_date=payload.balance_date,
            total_balance=payload.total_balance,
            cash_balance=payload.cash_balance,
            balance_snapshot_group_id=payload.balance_snapshot_group_id,
        )
    else:
        snapshot.total_balance = payload.total_balance
        snapshot.cash_balance = payload.cash_balance
        snapshot.balance_snapshot_group_id = payload.balance_snapshot_group_id

    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


@app.get("/accounts/{account_id}/balances", response_model=list[BalanceSnapshotRead])
def list_account_balances(account_id: int, session: SessionDep) -> list[BalanceSnapshot]:
    get_account_or_404(session, account_id)
    return session.exec(
        select(BalanceSnapshot)
        .where(BalanceSnapshot.account_id == account_id)
        .order_by(BalanceSnapshot.balance_date)
    ).all()


@app.patch("/balance-snapshots/{snapshot_id}", response_model=BalanceSnapshotRead)
def update_balance_snapshot(
    snapshot_id: int, payload: BalanceSnapshotUpsert, session: SessionDep
) -> BalanceSnapshot:
    snapshot = session.get(BalanceSnapshot, snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Balance snapshot not found.")
    validate_balance_values(payload.total_balance, payload.cash_balance)
    get_balance_snapshot_group_or_404(session, payload.balance_snapshot_group_id)
    if payload.balance_date != snapshot.balance_date:
        conflict = session.exec(
            select(BalanceSnapshot).where(
                BalanceSnapshot.account_id == snapshot.account_id,
                BalanceSnapshot.balance_date == payload.balance_date,
                BalanceSnapshot.id != snapshot.id,
            )
        ).first()
        if conflict:
            raise HTTPException(
                status_code=409,
                detail="A balance snapshot already exists for that account and date.",
            )
    snapshot.balance_date = payload.balance_date
    snapshot.total_balance = payload.total_balance
    snapshot.cash_balance = payload.cash_balance
    snapshot.balance_snapshot_group_id = payload.balance_snapshot_group_id
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


@app.delete("/balance-snapshots/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_balance_snapshot(snapshot_id: int, session: SessionDep) -> Response:
    snapshot = session.get(BalanceSnapshot, snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Balance snapshot not found.")
    session.delete(snapshot)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/households/{household_id}/accounts-with-balances")
def list_household_accounts_with_balances(
    household_id: int,
    session: SessionDep,
    balance_date: date | None = Query(default=None),
):
    return build_household_account_rows(session, household_id, balance_date)


@app.get("/households/{household_id}/balance-snapshots")
def list_household_balance_snapshots(household_id: int, session: SessionDep):
    return build_household_balance_snapshot_rows(session, household_id)


@app.get("/households/{household_id}/balance-snapshot-groups")
def list_household_balance_snapshot_groups(
    household_id: int, session: SessionDep
):
    return build_household_balance_snapshot_groups(session, household_id)


@app.post(
    "/balance-snapshot-groups",
    response_model=BalanceSnapshotGroupRead,
    status_code=status.HTTP_201_CREATED,
)
def create_balance_snapshot_group(
    payload: BalanceSnapshotGroupCreate, session: SessionDep
) -> BalanceSnapshotGroup:
    get_household_or_404(session, payload.household_id)
    group = BalanceSnapshotGroup.model_validate(payload)
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@app.patch(
    "/balance-snapshot-groups/{group_id}",
    response_model=BalanceSnapshotGroupRead,
)
def update_balance_snapshot_group(
    group_id: int,
    payload: BalanceSnapshotGroupUpdate,
    session: SessionDep,
) -> BalanceSnapshotGroup:
    group = get_balance_snapshot_group_or_404(session, group_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(group, field, value)
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@app.delete(
    "/balance-snapshot-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_balance_snapshot_group(group_id: int, session: SessionDep) -> Response:
    group = get_balance_snapshot_group_or_404(session, group_id)
    snapshots = session.exec(
        select(BalanceSnapshot).where(
            BalanceSnapshot.balance_snapshot_group_id == group_id
        )
    ).all()
    for snapshot in snapshots:
        session.delete(snapshot)
    session.delete(group)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/clients/{client_id}/accounts-with-balances")
def list_client_accounts_with_balances(
    client_id: int,
    session: SessionDep,
    balance_date: date | None = Query(default=None),
):
    client = get_client_or_404(session, client_id)
    rows = build_household_account_rows(session, client.household_id, balance_date)
    return [row for row in rows if row.client_id == client_id]


@app.get("/households/{household_id}/report")
def get_household_report(household_id: int, session: SessionDep):
    return build_household_report(session, household_id)


@app.get("/balance-snapshot-groups/{group_id}/sacs-report")
def get_sacs_report(group_id: int, session: SessionDep):
    return build_sacs_report(session, group_id)


@app.get("/balance-snapshot-groups/{group_id}/sacs-report.pdf")
def get_sacs_report_pdf(group_id: int, session: SessionDep) -> Response:
    report = build_sacs_report(session, group_id)
    try:
        from app.reports import render_sacs_report_pdf

        pdf_bytes = render_sacs_report_pdf(report)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to render PDF: {exc}. "
                "On Windows, WeasyPrint requires the GTK runtime "
                "(Pango/Cairo native libraries). "
                "See https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#windows"
            ),
        ) from exc
    safe_name = report.household_name.replace(" ", "_") or "household"
    filename = f"sacs-report-{safe_name}-{group_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
