"""Migrate existing database: convert 2-letter country codes to uppercase in all tables."""

import sqlite3
from pathlib import Path
import yaml

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.yaml"


def is_country_code(value):
    """Check if value is a 2-letter country code."""
    return isinstance(value, str) and len(value.strip()) == 2 and value.strip().isalpha()


def normalize_country_for_storage(value):
    """Normalize country field: if it's a 2-letter code, convert to uppercase."""
    if not value:
        return value
    if is_country_code(value):
        return value.strip().upper()
    return value


def load_db_path() -> Path:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"config.yaml not found: {CONFIG_PATH}")

    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    storage = config.get("storage", {}) or {}
    db_path = storage.get("database_path", "data.db")
    db_file = Path(db_path)
    if not db_file.is_absolute():
        db_file = BASE_DIR / db_file
    return db_file


def migrate_table(conn: sqlite3.Connection, table: str, column: str) -> int:
    """Migrate a single table's country column. Returns number of rows updated."""
    rows = conn.execute(f"SELECT id, {column} FROM {table}").fetchall()
    updated = 0

    for row_id, country_value in rows:
        normalized = normalize_country_for_storage(country_value)
        if normalized != country_value:
            conn.execute(f"UPDATE {table} SET {column}=? WHERE id=?", (normalized, row_id))
            updated += 1

    return updated


def main() -> int:
    db_path = load_db_path()
    print(f"Database path: {db_path}")
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return 1

    print("Connecting to database...")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        conn.execute("BEGIN")

        # Migrate all three tables
        tables = [
            ("visas", "country"),
            ("visa_applications", "country"),
            ("travels", "country"),
        ]

        total_updated = 0
        for table, column in tables:
            try:
                updated = migrate_table(conn, table, column)
                total_updated += updated
                if updated:
                    print(f"{table}.{column}: {updated} rows updated")
            except sqlite3.OperationalError as e:
                print(f"Warning: {table}.{column} migration skipped: {e}")

        conn.commit()
        print(f"Migration completed: {total_updated} total rows updated.")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
