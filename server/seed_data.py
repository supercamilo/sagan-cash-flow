from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from app.db import create_db_and_tables, engine
from app.models import (
    Account,
    AccountType,
    BalanceSnapshot,
    BalanceSnapshotGroup,
    Client,
    Household,
)


def main() -> None:
    create_db_and_tables()

    with Session(engine) as session:
        existing = session.exec(
            select(Household).where(Household.name == "Demo Household")
        ).first()
        if existing:
            print(f"Seed data already exists for household id={existing.id}")
            return

        household = Household(name="Demo Household")
        session.add(household)
        session.flush()

        primary_client = Client(
            household_id=household.id,
            first_name="Maria",
            last_name="Lopez",
            day_of_birth=date(1987, 5, 14),
            last_four_ssn="4821",
            monthly_salary=7200,
            is_primary_income=True,
        )
        spouse_client = Client(
            household_id=household.id,
            first_name="Daniel",
            last_name="Lopez",
            day_of_birth=date(1989, 9, 3),
            last_four_ssn="1934",
            monthly_salary=3600,
            is_primary_income=False,
        )
        session.add(primary_client)
        session.add(spouse_client)
        session.flush()

        accounts = [
            Account(
                client_id=primary_client.id,
                number="CHK-4401",
                type=AccountType.non_retirement,
                bank="Chase",
            ),
            Account(
                client_id=primary_client.id,
                number="RET-1209",
                type=AccountType.retirement,
                bank="Fidelity",
            ),
            Account(
                client_id=spouse_client.id,
                number="TRU-8820",
                type=AccountType.trust,
                bank="Vanguard",
            ),
            Account(
                client_id=spouse_client.id,
                number="LOAN-7788",
                type=AccountType.liabilities,
                bank="SoFi",
            ),
        ]
        session.add_all(accounts)
        session.flush()

        groups_by_date = {
            date(2026, 2, 1): BalanceSnapshotGroup(
                household_id=household.id, name="February 2026"
            ),
            date(2026, 3, 1): BalanceSnapshotGroup(
                household_id=household.id, name="March 2026"
            ),
            date(2026, 4, 1): BalanceSnapshotGroup(
                household_id=household.id, name="April 2026"
            ),
        }
        session.add_all(groups_by_date.values())
        session.flush()

        snapshot_values = [
            (accounts[0].id, date(2026, 2, 1), 18400, 18400),
            (accounts[1].id, date(2026, 2, 1), 128500, 6500),
            (accounts[2].id, date(2026, 2, 1), 45200, 2100),
            (accounts[3].id, date(2026, 2, 1), -15800, 0),
            (accounts[0].id, date(2026, 3, 1), 19350, 19350),
            (accounts[1].id, date(2026, 3, 1), 131200, 7100),
            (accounts[2].id, date(2026, 3, 1), 46300, 2600),
            (accounts[3].id, date(2026, 3, 1), -14950, 0),
            (accounts[0].id, date(2026, 4, 1), 20510, 20510),
            (accounts[1].id, date(2026, 4, 1), 133900, 7600),
            (accounts[2].id, date(2026, 4, 1), 47980, 3150),
            (accounts[3].id, date(2026, 4, 1), -14125, 0),
        ]
        snapshots = [
            BalanceSnapshot(
                account_id=account_id,
                balance_date=snapshot_date,
                total_balance=total,
                cash_balance=cash,
                balance_snapshot_group_id=groups_by_date[snapshot_date].id,
            )
            for account_id, snapshot_date, total, cash in snapshot_values
        ]
        session.add_all(snapshots)
        session.commit()

        print(f"Inserted household id={household.id}")
        print(f"Clients: {primary_client.id}, {spouse_client.id}")
        print(f"Accounts inserted: {len(accounts)}")
        print(f"Balance snapshots inserted: {len(snapshots)}")


if __name__ == "__main__":
    main()
