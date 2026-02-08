from sqlmodel import SQLModel, create_engine, Session

import os

# Check for DATABASE_URL (Render/Postgres) or fall back to local SQLite
database_url = os.getenv("DATABASE_URL")

if database_url and (database_url.startswith("postgres://") or database_url.startswith("postgresql://")):
    # Fix Render's postgres:// usage for SQLAlchemy (needs postgresql://)
    database_url = database_url.replace("postgres://", "postgresql://")
    engine = create_engine(database_url, echo=False)
else:
    # Local SQLite
    sqlite_file_name = "econova_v4.db"
    sqlite_url = f"sqlite:///{sqlite_file_name}"
    connect_args = {"check_same_thread": False}
    engine = create_engine(sqlite_url, echo=False, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL;")
        connection.exec_driver_sql("PRAGMA synchronous=NORMAL;")

def get_session():
    with Session(engine) as session:
        yield session
