from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import computed_field
from sqlalchemy.orm import relationship
from sqlmodel import Field, Relationship, SQLModel


class AccountType(str, Enum):
    retirement = "retirement"
    non_retirement = "non-retirement"
    trust = "trust"
    liabilities = "liabilities"


class HouseholdBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=120)
    monthly_expense: float = Field(default=0, ge=0)


class Household(HouseholdBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    clients: list["Client"] = Relationship(
        sa_relationship=relationship("Client", back_populates="household")
    )


class HouseholdCreate(HouseholdBase):
    pass


class HouseholdUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    monthly_expense: Optional[float] = Field(default=None, ge=0)


class HouseholdRead(HouseholdBase):
    id: int
    created_at: datetime


class HouseholdSummary(HouseholdRead):
    client_count: int
    account_count: int
    primary_income_client_id: Optional[int]


class ClientBase(SQLModel):
    household_id: int = Field(foreign_key="household.id", index=True)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    day_of_birth: date
    last_four_ssn: str = Field(min_length=4, max_length=4, regex=r"^\d{4}$")
    monthly_salary: float = Field(ge=0)
    is_primary_income: bool = False


class Client(ClientBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    household: Optional[Household] = Relationship(
        sa_relationship=relationship("Household", back_populates="clients")
    )
    accounts: list["Account"] = Relationship(
        sa_relationship=relationship("Account", back_populates="client")
    )


class ClientCreate(ClientBase):
    pass


class ClientUpdate(SQLModel):
    household_id: Optional[int] = None
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    day_of_birth: Optional[date] = None
    last_four_ssn: Optional[str] = Field(default=None, min_length=4, max_length=4, regex=r"^\d{4}$")
    monthly_salary: Optional[float] = Field(default=None, ge=0)
    is_primary_income: Optional[bool] = None


class ClientRead(ClientBase):
    id: int
    created_at: datetime

    @computed_field
    @property
    def age(self) -> int:
        today = date.today()
        years = today.year - self.day_of_birth.year
        before_birthday = (today.month, today.day) < (
            self.day_of_birth.month,
            self.day_of_birth.day,
        )
        return years - int(before_birthday)


class AccountBase(SQLModel):
    client_id: int = Field(foreign_key="client.id", index=True)
    number: str = Field(min_length=1, max_length=64)
    type: AccountType
    bank: str = Field(min_length=1, max_length=120)
    interest_rate: float = Field(default=0, ge=0)


class Account(AccountBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    client: Optional[Client] = Relationship(
        sa_relationship=relationship("Client", back_populates="accounts")
    )
    balance_snapshots: list["BalanceSnapshot"] = Relationship(
        sa_relationship=relationship("BalanceSnapshot", back_populates="account")
    )


class AccountCreate(AccountBase):
    pass


class AccountUpdate(SQLModel):
    number: Optional[str] = Field(default=None, min_length=1, max_length=64)
    type: Optional[AccountType] = None
    bank: Optional[str] = Field(default=None, min_length=1, max_length=120)
    interest_rate: Optional[float] = Field(default=None, ge=0)


class AccountRead(AccountBase):
    id: int
    created_at: datetime


class BalanceSnapshotGroupBase(SQLModel):
    household_id: int = Field(foreign_key="household.id", index=True)
    name: str = Field(min_length=1, max_length=120)


class BalanceSnapshotGroup(BalanceSnapshotGroupBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class BalanceSnapshotGroupCreate(BalanceSnapshotGroupBase):
    pass


class BalanceSnapshotGroupUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)


class BalanceSnapshotGroupRead(BalanceSnapshotGroupBase):
    id: int
    created_at: datetime


class BalanceSnapshotBase(SQLModel):
    account_id: int = Field(foreign_key="account.id", index=True)
    balance_date: date = Field(index=True)
    total_balance: float
    cash_balance: float
    balance_snapshot_group_id: int = Field(
        foreign_key="balancesnapshotgroup.id", index=True
    )


class BalanceSnapshot(BalanceSnapshotBase, table=True):
    __table_args__ = {"sqlite_autoincrement": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    account: Optional[Account] = Relationship(
        sa_relationship=relationship("Account", back_populates="balance_snapshots")
    )


class BalanceSnapshotCreate(BalanceSnapshotBase):
    pass


class BalanceSnapshotUpsert(SQLModel):
    balance_date: date
    total_balance: float
    cash_balance: float
    balance_snapshot_group_id: int


class BalanceSnapshotRead(BalanceSnapshotBase):
    id: int
    created_at: datetime


class HouseholdAccountBalanceRow(SQLModel):
    account_id: int
    client_id: int
    client_name: str
    household_id: int
    account_number: str
    account_type: AccountType
    bank: str
    balance_date: Optional[date] = None
    total_balance: Optional[float] = None
    cash_balance: Optional[float] = None


class HouseholdBalanceSnapshotRow(SQLModel):
    snapshot_id: int
    account_id: int
    client_id: int
    client_name: str
    household_id: int
    account_number: str
    account_type: AccountType
    bank: str
    balance_date: date
    total_balance: float
    cash_balance: float
    balance_snapshot_group_id: int


class BalanceSnapshotGroupWithSnapshots(SQLModel):
    id: int
    household_id: int
    name: str
    created_at: datetime
    snapshots: list[HouseholdBalanceSnapshotRow]


class NetWorthPoint(SQLModel):
    balance_date: date
    assets_total: float
    liabilities_total: float
    net_worth: float
    cash_total: float


class AllocationPoint(SQLModel):
    account_type: AccountType
    total_balance: float
    cash_balance: float


class HouseholdReport(SQLModel):
    household_id: int
    household_name: str
    primary_income_client_id: int
    primary_income_client_name: str
    monthly_household_salary: float
    latest_snapshot_date: Optional[date]
    net_worth_series: list[NetWorthPoint]
    allocation_by_type: list[AllocationPoint]


class SacsClientBreakdown(SQLModel):
    client_id: int
    client_name: str
    monthly_salary: float


class SacsReport(SQLModel):
    group_id: int
    group_name: str
    group_date: Optional[date]
    household_id: int
    household_name: str
    clients: list[SacsClientBreakdown]
    monthly_inflow: float
    monthly_outflow: float
    monthly_private_reserve: float
