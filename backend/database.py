from sqlmodel import SQLModel, create_engine, Session
import os
import logging

logger = logging.getLogger(__name__)

# Check for DATABASE_URL (Render/Postgres) or fall back to local SQLite
database_url = os.getenv("DATABASE_URL")

is_sqlite = True

if database_url and (database_url.startswith("postgres://") or database_url.startswith("postgresql://")):
    # Fix Render's postgres:// usage for SQLAlchemy (needs postgresql://)
    database_url = database_url.replace("postgres://", "postgresql://")
    engine = create_engine(
        database_url, 
        echo=False,
        pool_size=20,
        max_overflow=20,
        pool_pre_ping=True,
    )
    is_sqlite = False
else:
    # Local SQLite
    sqlite_file_name = "econova_v4.db"
    sqlite_url = f"sqlite:///{sqlite_file_name}"
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        sqlite_url,
        echo=False,
        connect_args=connect_args,
        pool_size=30,          # Support 30 concurrent connections
        max_overflow=20,       # Allow up to 50 total if needed
        pool_pre_ping=True,    # Detect stale connections early
        pool_timeout=10,       # Don't wait more than 10s for a slot
    )


def _run_migrations():
    """Add missing columns to existing tables without losing data."""
    migrations = [
        # MarketState: add current_quarter
        ("marketstate", "current_quarter", "INTEGER DEFAULT 1"),
        # PriceHistory: add quarter
        ("pricehistory", "quarter", "INTEGER DEFAULT 0"),
        # MarketState: trade approval gate
        ("marketstate", "trade_requires_approval", "INTEGER NOT NULL DEFAULT 0"),
        # MarketState: credit facility lock
        ("marketstate", "credit_facility_open", "INTEGER NOT NULL DEFAULT 0"),
        # AuctionLot: user auctions tracking
        ("auctionlot", "seller_id", "INTEGER DEFAULT NULL"),
        ("auctionlot", "seller_cost_basis", "FLOAT DEFAULT NULL"),
        # TeamLoan: grace period tracking
        ("teamloan", "missed_quarters", "INTEGER NOT NULL DEFAULT 0"),
    ]
    
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                conn.exec_driver_sql(f"SELECT {column} FROM {table} LIMIT 1")
            except Exception:
                try:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                    logger.info(f"Migration: added {column} to {table}")
                    conn.commit()
                except Exception as e:
                    logger.warning(f"Migration skip ({table}.{column}): {e}")


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    
    # Run schema migrations for existing DBs
    _run_migrations()
    
    # SQLite-specific optimizations (skip on Postgres)
    if is_sqlite:
        with engine.connect() as connection:
            # WAL allows concurrent reads + one writer simultaneously 
            connection.exec_driver_sql("PRAGMA journal_mode=WAL;")
            # NORMAL is safe with WAL and much faster than FULL
            connection.exec_driver_sql("PRAGMA synchronous=NORMAL;")
            # 64MB page cache (default is ~2MB) — keeps hot data in RAM
            connection.exec_driver_sql("PRAGMA cache_size=-65536;")
            # Keep temp tables in memory instead of writing to disk
            connection.exec_driver_sql("PRAGMA temp_store=MEMORY;")
            # 256MB memory-mapped I/O for faster reads
            connection.exec_driver_sql("PRAGMA mmap_size=268435456;")
            # Wait up to 5s if another writer has the lock (prevents SQLITE_BUSY)
            connection.exec_driver_sql("PRAGMA busy_timeout=5000;")


def get_session():
    with Session(engine) as session:
        yield session
