from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'sagan.db'}"

connect_args = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(household)")).fetchall()
        }
        if "monthly_expense" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE household ADD COLUMN monthly_expense FLOAT NOT NULL DEFAULT 0"
                )
            )
            if "expense_total" in columns:
                connection.execute(
                    text(
                        "UPDATE household SET monthly_expense = expense_total "
                        "WHERE monthly_expense = 0"
                    )
                )

        account_columns = {
            row[1]
            for row in connection.execute(
                text("PRAGMA table_info(account)")
            ).fetchall()
        }
        if account_columns and "interest_rate" not in account_columns:
            connection.execute(
                text(
                    "ALTER TABLE account ADD COLUMN interest_rate FLOAT NOT NULL DEFAULT 0"
                )
            )

        snapshot_columns = {
            row[1]
            for row in connection.execute(
                text("PRAGMA table_info(balancesnapshot)")
            ).fetchall()
        }
        if snapshot_columns:
            connection.execute(text("DELETE FROM balancesnapshot"))
            if "balance_snapshot_group_id" not in snapshot_columns:
                connection.execute(
                    text(
                        "ALTER TABLE balancesnapshot "
                        "ADD COLUMN balance_snapshot_group_id INTEGER NOT NULL "
                        "REFERENCES balancesnapshotgroup(id)"
                    )
                )


def get_session():
    with Session(engine) as session:
        yield session
