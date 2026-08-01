import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from src.models import Base

# Database type selector: "pg" or "oracle"
DB_TYPE = os.getenv("DB_TYPE", "pg").lower()
PG_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
PG_DB_USER = os.getenv("DB_USER", "")
PG_DB_HOST = os.getenv("DB_HOST", "localhost")
PG_DB_PORT = os.getenv("DB_PORT", "5432")
PG_DB_NAME = os.getenv("DB_NAME", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

def get_engine_and_url(db_type: str = "pg") -> tuple[Engine, str]:
    """
    Factory function to configure and instantiate SQLAlchemy engine
    based on the target database driver type ('pg' or 'oracle').
    """
    if db_type == "pg":
        # PostgreSQL Connection
        default_pg_url = f"postgresql://{PG_DB_USER}:{PG_DB_PASSWORD}@{PG_DB_HOST}:{PG_DB_PORT}/{PG_DB_NAME}"
        db_url = os.getenv("DATABASE_URL", default_pg_url)
        
        engine = create_engine(
            db_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,  # Check & reconnect stale pool connections
            echo=False
        )
        return engine, db_url

    elif db_type == "oracle":
        # Oracle DB Connection (Requires cx_Oracle or oracledb installed)
        # Format: oracle+oracledb://username:password@host:port/?service_name=service
        default_oracle_url = "oracle+oracledb://teap:teap_pass@localhost:1521/?service_name=ORCLCDB"
        db_url = os.getenv("DATABASE_URL", default_oracle_url)
        
        engine = create_engine(
            db_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            # Oracle-specific configurations
            max_identifier_length=128,  # Support longer table/column names in Oracle 12c+
            echo=False
        )
        return engine, db_url

    else:
        raise ValueError(f"Unsupported DB_TYPE '{db_type}'. Must be 'pg' or 'oracle'.")


# Global Engine and SessionFactory initializations
engine, DATABASE_URL = get_engine_and_url(DB_TYPE)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def init_db(db_type: str = DB_TYPE) -> None:
    """
    Initializes database schema.
    Handles dialect-specific quirks during table creation.
    """
    if db_type == "oracle":
        # Optional: Oracle schema creation configurations can be handled here if needed
        pass

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding database session per request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()