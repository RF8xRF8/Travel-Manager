"""Rebuild database ids so each table is compact and referential links stay intact.

This script rewrites the current SQLite database in-place:
- primary keys in the main tables are reassigned from 1..N
- all foreign key columns and related reference columns are remapped
- AUTOINCREMENT sequences are updated so new records continue from the new max id

Run it once after making a backup of the database file.
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import traceback
from datetime import datetime
from pathlib import Path

import yaml


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.yaml"


TABLE_SCHEMAS = {
    "visa_applications": """
        CREATE TABLE visa_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country TEXT NOT NULL,
            country_code TEXT,
            application_type TEXT,
            apply_date TEXT NOT NULL,
            current_status TEXT DEFAULT '开始申请',
            visa_result TEXT DEFAULT '未送签',
            result_note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            total_entries INTEGER DEFAULT 1,
            visa_type TEXT
        )
    """,
    "visas": """
        CREATE TABLE visas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country TEXT NOT NULL,
            country_code TEXT,
            valid_from TEXT,
            valid_to TEXT,
            total_entries INTEGER DEFAULT 1,
            used_entries INTEGER DEFAULT 0,
            visa_number TEXT,
            remarks TEXT,
            file_path TEXT,
            file_name TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            source_application_id INTEGER,
            visa_type TEXT
        )
    """,
    "application_status_history": """
        CREATE TABLE application_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            change_date TEXT NOT NULL,
            note TEXT,
            FOREIGN KEY(application_id) REFERENCES visa_applications(id)
        )
    """,
    "application_files": """
        CREATE TABLE application_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            uploaded_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(application_id) REFERENCES visa_applications(id)
        )
    """,
    "visa_status_history": """
        CREATE TABLE visa_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visa_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            reason TEXT,
            changed_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(visa_id) REFERENCES visas(id)
        )
    """,
    "travels": """
        CREATE TABLE travels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visa_id INTEGER,
            country TEXT NOT NULL,
            country_code TEXT,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            remarks TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(visa_id) REFERENCES visas(id)
        )
    """,
}


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


def fetch_rows(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return conn.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()


def build_id_map(rows: list[sqlite3.Row]) -> dict[int, int]:
    return {row["id"]: index + 1 for index, row in enumerate(rows)}


def validate_reference(row: sqlite3.Row, field: str, mapping: dict[int, int], table: str) -> None:
    value = row[field]
    if value is None:
        return
    if value not in mapping:
        raise ValueError(f"{table}.{field} references missing id {value}")


def remap_rows(rows: list[sqlite3.Row], id_map: dict[int, int], field_maps: dict[str, dict[int, int]] | None = None) -> list[dict[str, object]]:
    transformed: list[dict[str, object]] = []
    field_maps = field_maps or {}

    for row in rows:
        data = dict(row)
        old_id = data["id"]
        data["id"] = id_map[old_id]

        for field, mapping in field_maps.items():
            value = data[field]
            if value is None:
                continue
            if value not in mapping:
                raise ValueError(f"{field} references missing id {value}")
            data[field] = mapping[value]

        transformed.append(data)

    return transformed


def create_schema(conn: sqlite3.Connection) -> None:
    for schema in TABLE_SCHEMAS.values():
        conn.execute(schema.strip())


def drop_existing_tables(conn: sqlite3.Connection) -> None:
    for table in [
        "application_files",
        "application_status_history",
        "travels",
        "visa_status_history",
        "visas",
        "visa_applications",
    ]:
        conn.execute(f"DROP TABLE IF EXISTS {table}")


def insert_rows(conn: sqlite3.Connection, table: str, rows: list[dict[str, object]], columns: list[str]) -> None:
    if not rows:
        return
    placeholders = ",".join(["?"] * len(columns))
    column_sql = ",".join(columns)
    values = [[row.get(column) for column in columns] for row in rows]
    conn.executemany(
        f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders})",
        values,
    )


def reset_sqlite_sequence(conn: sqlite3.Connection, table: str, max_id: int) -> None:
    conn.execute("DELETE FROM sqlite_sequence WHERE name=?", (table,))
    if max_id > 0:
        conn.execute("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)", (table, max_id))


def main() -> int:
    parser = argparse.ArgumentParser(description="Reorder all table ids while preserving references.")
    parser.add_argument("--db", help="Path to the SQLite database file. Defaults to config.yaml storage.database_path.")
    parser.add_argument("--no-backup", action="store_true", help="Skip creating a timestamped .bak copy before migration.")
    args = parser.parse_args()

    db_path = Path(args.db).expanduser() if args.db else load_db_path()
    if not db_path.is_absolute():
        db_path = (BASE_DIR / db_path).resolve()

    if not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = db_path.with_name(f"{db_path.stem}.bak-{stamp}{db_path.suffix}")
        shutil.copy2(db_path, backup_path)
        print(f"Backup created: {backup_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        visa_app_rows = fetch_rows(conn, "visa_applications")
        visa_rows = fetch_rows(conn, "visas")
        app_history_rows = fetch_rows(conn, "application_status_history")
        app_file_rows = fetch_rows(conn, "application_files")
        visa_history_rows = fetch_rows(conn, "visa_status_history")
        travel_rows = fetch_rows(conn, "travels")

        app_map = build_id_map(visa_app_rows)
        visa_map = build_id_map(visa_rows)

        for row in visa_rows:
            validate_reference(row, "source_application_id", app_map, "visas")
        for row in app_history_rows:
            validate_reference(row, "application_id", app_map, "application_status_history")
        for row in app_file_rows:
            validate_reference(row, "application_id", app_map, "application_files")
        for row in visa_history_rows:
            validate_reference(row, "visa_id", visa_map, "visa_status_history")
        for row in travel_rows:
            validate_reference(row, "visa_id", visa_map, "travels")

        new_visa_app_rows = remap_rows(visa_app_rows, app_map)
        new_visa_rows = remap_rows(visa_rows, visa_map, {"source_application_id": app_map})
        new_app_history_rows = remap_rows(app_history_rows, build_id_map(app_history_rows), {"application_id": app_map})
        new_app_file_rows = remap_rows(app_file_rows, build_id_map(app_file_rows), {"application_id": app_map})
        new_visa_history_rows = remap_rows(visa_history_rows, build_id_map(visa_history_rows), {"visa_id": visa_map})
        new_travel_rows = remap_rows(travel_rows, build_id_map(travel_rows), {"visa_id": visa_map})

        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN IMMEDIATE")

        drop_existing_tables(conn)
        create_schema(conn)

        insert_rows(
            conn,
            "visa_applications",
            new_visa_app_rows,
            [
                "id", "country", "country_code", "application_type", "apply_date",
                "current_status", "visa_result", "result_note", "created_at", "updated_at",
                "total_entries", "visa_type",
            ],
        )
        insert_rows(
            conn,
            "visas",
            new_visa_rows,
            [
                "id", "country", "country_code", "valid_from", "valid_to",
                "total_entries", "used_entries", "visa_number", "remarks", "file_path",
                "file_name", "status", "created_at", "source_application_id", "visa_type",
            ],
        )
        insert_rows(
            conn,
            "application_status_history",
            new_app_history_rows,
            ["id", "application_id", "status", "change_date", "note"],
        )
        insert_rows(
            conn,
            "application_files",
            new_app_file_rows,
            ["id", "application_id", "file_path", "file_name", "uploaded_at"],
        )
        insert_rows(
            conn,
            "visa_status_history",
            new_visa_history_rows,
            ["id", "visa_id", "old_status", "new_status", "reason", "changed_at"],
        )
        insert_rows(
            conn,
            "travels",
            new_travel_rows,
            ["id", "visa_id", "country", "country_code", "date", "type", "remarks", "created_at"],
        )

        reset_sqlite_sequence(conn, "visa_applications", len(new_visa_app_rows))
        reset_sqlite_sequence(conn, "visas", len(new_visa_rows))
        reset_sqlite_sequence(conn, "application_status_history", len(new_app_history_rows))
        reset_sqlite_sequence(conn, "application_files", len(new_app_file_rows))
        reset_sqlite_sequence(conn, "visa_status_history", len(new_visa_history_rows))
        reset_sqlite_sequence(conn, "travels", len(new_travel_rows))

        foreign_key_issues = conn.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_issues:
            raise ValueError(f"foreign_key_check failed: {foreign_key_issues}")

        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        print("ID reordering completed successfully.")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"ID reordering failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())