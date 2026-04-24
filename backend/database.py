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
        # Render PostgreSQL caps at 25 connections — stay well under that limit.
        pool_size=15,
        max_overflow=5,         # max 20 total connections
        pool_timeout=10,        # fail fast instead of hanging 30s
        pool_recycle=300,       # recycle idle connections every 5 min
        pool_pre_ping=True,     # discard stale connections before use
        connect_args={
            # TCP keepalives so Render's network doesn't silently drop idle conns
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
            "connect_timeout": 10,
        },
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
        pool_size=10,
        max_overflow=10,
        pool_pre_ping=True,
        pool_timeout=10,
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
        # MarketState: short selling limits per asset
        ("marketstate", "short_limit_gold", "INTEGER NOT NULL DEFAULT 0"),
        ("marketstate", "short_limit_nvda", "INTEGER NOT NULL DEFAULT 0"),
        ("marketstate", "short_limit_brent", "INTEGER NOT NULL DEFAULT 0"),
        ("marketstate", "short_limit_reits", "INTEGER NOT NULL DEFAULT 0"),
        # BailoutRecord: loan linkage and interest rate
        ("bailoutrecord", "interest_rate", "FLOAT NOT NULL DEFAULT 2.0"),
        ("bailoutrecord", "loan_id", "INTEGER DEFAULT NULL"),
        # MarketState: investor sentiment dial
        ("marketstate", "sentiment", "TEXT DEFAULT 'NEUTRAL'"),
        # MarketState: market maker bots toggle
        ("marketstate", "bots_enabled", "INTEGER NOT NULL DEFAULT 0"),
        # NewsItem: simulation metadata
        ("newsitem", "sim_year", "INTEGER DEFAULT NULL"),
        ("newsitem", "sim_quarter", "INTEGER DEFAULT NULL"),
        ("newsitem", "category", "TEXT DEFAULT 'market'"),
        # Transaction: collusion flag
        ("transaction", "is_flagged", "INTEGER NOT NULL DEFAULT 0"),
        ("transaction", "flag_reason", "TEXT DEFAULT NULL"),
        # MarketState: public leaderboard toggle
        ("marketstate", "leaderboard_visible", "INTEGER NOT NULL DEFAULT 0"),
        # MarketState: per-asset auction lot config (stored as JSON/TEXT)
        ("marketstate", "auction_config", "TEXT DEFAULT NULL"),
        # MarketState: configurable team starting capital
        ("marketstate", "team_starting_capital", "REAL DEFAULT 1000000.0"),
        # MarketState: auto-news templates for price nudges
        ("marketstate", "auto_news_config", "TEXT DEFAULT NULL"),
        # MarketState: global interest rate environment
        ("marketstate", "global_interest_rate", "TEXT NOT NULL DEFAULT 'NEUTRAL'"),
        # User: hidden from other teams
        ("user", "is_hidden", "INTEGER NOT NULL DEFAULT 0"),
    ]
    
    for table, column, col_type in migrations:
        # Use a fresh connection for each check so a failed SELECT doesn't
        # leave the connection in an invalid state for the ALTER TABLE.
        column_exists = False
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql(f'SELECT "{column}" FROM "{table}" LIMIT 1')
                column_exists = True
        except Exception:
            pass

        if not column_exists:
            try:
                # engine.begin() auto-commits on success, auto-rolls-back on error
                with engine.begin() as conn:
                    conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {col_type}')
                logger.info(f"Migration: added {column} to {table}")
            except Exception as e:
                logger.warning(f"Migration skip ({table}.{column}): {e}")


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

    # Run schema migrations for existing DBs
    _run_migrations()

    # For SQLite: dispose pool so all subsequent connections see the updated schema.
    # For PostgreSQL: do NOT dispose — connections are already schema-aware and
    # disposing wipes the warm pool, causing a thundering herd on the first request wave.
    if is_sqlite:
        engine.dispose()

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
