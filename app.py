import os
import sys
import yaml
import hashlib
import sqlite3
import uuid
from datetime import datetime, date
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ─── Config ───────────────────────────────────────────────────────────────────

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")

def load_config():
    if not os.path.exists(CONFIG_PATH):
        print(f"ERROR: config.yaml not found at {CONFIG_PATH}")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

CONFIG = load_config()
AUTH = CONFIG.get("auth", {})
SERVER = CONFIG.get("server", {"port": 5000, "host": "0.0.0.0"})
STORAGE = CONFIG.get("storage", {})
APP_SETTINGS = CONFIG.get("app", {})

DB_PATH = STORAGE.get("database_path", "data.db")
VISA_FOLDER = STORAGE.get("visa_folder", "uploads/visas")
APP_FOLDER = STORAGE.get("visa_application_folder", "uploads/applications")

for folder in [VISA_FOLDER, APP_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# ─── App ──────────────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="frontend/static", template_folder="frontend")
app.secret_key = os.environ.get("TRAVEL_MANAGER_SECRET_KEY") or APP_SETTINGS.get("secret_key") or os.urandom(32)
CORS(app, supports_credentials=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "pdf", "webp"}

BASE_DIR = os.path.dirname(__file__)

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def is_country_code(value):
    return isinstance(value, str) and len(value.strip()) == 2 and value.strip().isalpha()


def normalize_country_code(value):
    if not is_country_code(value):
        return None
    return value.strip().upper()


def normalize_storage_path(path):
    if not path:
        return None
    if os.path.isabs(path):
        return os.path.relpath(path, BASE_DIR).replace("\\", "/")
    return path.replace("\\", "/")


def resolve_storage_path(path):
    if not path:
        return None
    normalized = path.replace("\\", os.sep).replace("/", os.sep)
    full = normalized if os.path.isabs(normalized) else os.path.normpath(os.path.join(BASE_DIR, normalized))
    base = os.path.normpath(BASE_DIR)
    if os.path.commonpath([base, os.path.normpath(full)]) != base:
        return None
    return full


def stored_file_path(folder, filename):
    return normalize_storage_path(os.path.join(folder, filename))


def remove_storage_file(path):
    full_path = resolve_storage_path(path)
    if full_path and os.path.exists(full_path):
        os.remove(full_path)


def find_matching_visa(conn, country, country_code):
    if country_code:
        row = conn.execute(
            """SELECT * FROM visas
               WHERE country_code=? AND status IN ('pending', 'active')
               ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, valid_to IS NULL, valid_to, id DESC
               LIMIT 1""",
            (country_code,)
        ).fetchone()
        if row:
            return row

    if country:
        row = conn.execute(
            """SELECT * FROM visas
               WHERE lower(country)=lower(?) AND status IN ('pending', 'active')
               ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, valid_to IS NULL, valid_to, id DESC
               LIMIT 1""",
            (country,)
        ).fetchone()
        if row:
            return row

    return None


def auto_expire_expired_visas(conn):
    """Automatically mark expired visas (pending/active past valid_to) as invalid."""
    today = date.today().isoformat()
    invalid_visas = conn.execute(
        """SELECT id, status FROM visas
           WHERE status IN ('pending', 'active') AND valid_to IS NOT NULL AND valid_to < ?
           ORDER BY id""",
        (today,)
    ).fetchall()
    
    for visa in invalid_visas:
        conn.execute("UPDATE visas SET status='invalid' WHERE id=?", (visa["id"],))
        conn.execute(
            "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,?,?,?)",
            (visa["id"], visa["status"], "invalid", "系统自动检测：有效期已过期")
        )


# Backward-compatible alias for older imports.
def auto_expire_invalid_visas(conn):
    auto_expire_expired_visas(conn)

# ─── Database ─────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS visas (
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
            status TEXT DEFAULT 'pending',  -- pending, active, invalid
            created_at TEXT DEFAULT (datetime('now')),
            source_application_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS visa_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visa_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            reason TEXT,
            changed_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(visa_id) REFERENCES visas(id)
        );

        CREATE TABLE IF NOT EXISTS travels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visa_id INTEGER,
            country TEXT NOT NULL,
            country_code TEXT,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            remarks TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(visa_id) REFERENCES visas(id)
        );

        CREATE TABLE IF NOT EXISTS visa_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country TEXT NOT NULL,
            country_code TEXT,
            application_type TEXT,
            apply_date TEXT NOT NULL,
            current_status TEXT DEFAULT '开始申请',
            visa_result TEXT DEFAULT '未送签',
            result_note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS application_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            change_date TEXT NOT NULL,
            note TEXT,
            FOREIGN KEY(application_id) REFERENCES visa_applications(id)
        );

        CREATE TABLE IF NOT EXISTS application_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            uploaded_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(application_id) REFERENCES visa_applications(id)
        );
        """)
    print("Database initialized.")


def ensure_column(conn, table, column, definition):
    cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate_schema():
    with get_db() as conn:
        ensure_column(conn, "visas", "country_code", "TEXT")
        ensure_column(conn, "travels", "country_code", "TEXT")
        ensure_column(conn, "visa_applications", "country_code", "TEXT")
        ensure_column(conn, "visa_applications", "total_entries", "INTEGER DEFAULT 1")
        ensure_column(conn, "visas", "visa_type", "TEXT")
        ensure_column(conn, "visa_applications", "visa_type", "TEXT")
        conn.execute("UPDATE visa_applications SET total_entries=1 WHERE total_entries IS NULL")

init_db()
migrate_schema()

# ─── Auth ─────────────────────────────────────────────────────────────────────

def sha256(text):
    return hashlib.sha256(text.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username", "")
    password = data.get("password", "")
    expected_user = AUTH.get("username", "admin")
    expected_hash = AUTH.get("password", "")
    if username == expected_user and sha256(password) == expected_hash:
        session["logged_in"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "Invalid credentials"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def me():
    if session.get("logged_in"):
        return jsonify({"logged_in": True, "username": AUTH.get("username")})
    return jsonify({"logged_in": False})

# ─── Visas ────────────────────────────────────────────────────────────────────

@app.route("/api/visas", methods=["GET"])
@login_required
def get_visas():
    status_filter = request.args.get("status")
    with get_db() as conn:
        auto_expire_expired_visas(conn)
        if status_filter:
            rows = conn.execute("SELECT * FROM visas WHERE status=? ORDER BY created_at DESC", (status_filter,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM visas ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/visas", methods=["POST"])
@login_required
def create_visa():
    country = request.form.get("country", "")
    country_code = normalize_country_code(request.form.get("country_code"))
    if not country_code and is_country_code(country):
        country_code = normalize_country_code(country)
    valid_from = request.form.get("valid_from") or None
    valid_to = request.form.get("valid_to") or None
    total_entries = int(request.form.get("total_entries", 1))
    visa_type = request.form.get("visa_type") or None
    visa_number = request.form.get("visa_number") or None
    remarks = request.form.get("remarks") or None
    source_application_id = request.form.get("source_application_id") or None

    file_path = None
    if "file" in request.files:
        f = request.files["file"]
        if f and f.filename and allowed_file(f.filename):
            ext = f.filename.rsplit(".", 1)[1].lower()
            fname = f"{uuid.uuid4().hex}.{ext}"
            save_path = os.path.join(VISA_FOLDER, fname)
            f.save(save_path)
            file_path = stored_file_path(VISA_FOLDER, fname)

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, visa_number, remarks, file_path, status, source_application_id)
               VALUES (?,?,?,?,?,0,?,?,?,?,'pending',?)""",
            (country, country_code, valid_from, valid_to, total_entries, visa_type, visa_number, remarks, file_path, source_application_id)
        )
        visa_id = cur.lastrowid
        conn.execute(
            "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,NULL,'pending','新建签证')",
            (visa_id,)
        )
    return jsonify({"id": visa_id, "ok": True})

@app.route("/api/visas/<int:vid>", methods=["GET"])
@login_required
def get_visa(vid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM visas WHERE id=?", (vid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        history = conn.execute("SELECT * FROM visa_status_history WHERE visa_id=? ORDER BY changed_at", (vid,)).fetchall()
    return jsonify({"visa": dict(row), "history": [dict(h) for h in history]})

@app.route("/api/visas/<int:vid>", methods=["PUT"])
@login_required
def update_visa(vid):
    data = request.get_json() or {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM visas WHERE id=?", (vid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        old_status = row["status"]
        new_status = data.get("status", old_status)
        reason = data.get("reason", "手动更新")

        update_fields = []
        update_values = []
        for field in ["country", "country_code", "valid_from", "valid_to", "total_entries", "visa_number", "remarks", "status"]:
            if field in data:
                update_fields.append(f"{field}=?")
                update_values.append(data[field])
        if update_fields:
            update_values.append(vid)
            conn.execute(f"UPDATE visas SET {', '.join(update_fields)} WHERE id=?", update_values)

        if new_status != old_status:
            conn.execute(
                "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,?,?,?)",
                (vid, old_status, new_status, reason)
            )
    return jsonify({"ok": True})

@app.route("/api/visas/<int:vid>/status", methods=["PUT"])
@login_required
def update_visa_status(vid):
    data = request.get_json() or {}
    new_status = data.get("status")
    reason = data.get("reason", "手动切换")
    if not new_status:
        return jsonify({"error": "status required"}), 400
    with get_db() as conn:
        row = conn.execute("SELECT * FROM visas WHERE id=?", (vid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        old_status = row["status"]
        conn.execute("UPDATE visas SET status=? WHERE id=?", (new_status, vid))
        conn.execute(
            "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,?,?,?)",
            (vid, old_status, new_status, reason)
        )
    return jsonify({"ok": True})

@app.route("/api/visas/<int:vid>", methods=["DELETE"])
@login_required
def delete_visa(vid):
    with get_db() as conn:
        row = conn.execute("SELECT file_path FROM visas WHERE id=?", (vid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        conn.execute("DELETE FROM visa_status_history WHERE visa_id=?", (vid,))
        conn.execute("DELETE FROM travels WHERE visa_id=?", (vid,))
        conn.execute("DELETE FROM visas WHERE id=?", (vid,))
    file_path = row["file_path"]
    full_path = resolve_storage_path(file_path)
    if full_path and os.path.exists(full_path):
        os.remove(full_path)
    return jsonify({"ok": True})

# ─── Visa Applications ────────────────────────────────────────────────────────

@app.route("/api/applications", methods=["GET"])
@login_required
def get_applications():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM visa_applications ORDER BY created_at DESC").fetchall()
        result = []
        for row in rows:
            r = dict(row)
            history = conn.execute(
                "SELECT * FROM application_status_history WHERE application_id=? ORDER BY change_date",
                (r["id"],)
            ).fetchall()
            files = conn.execute(
                "SELECT * FROM application_files WHERE application_id=?",
                (r["id"],)
            ).fetchall()
            r["status_history"] = [dict(h) for h in history]
            r["files"] = [dict(f) for f in files]
            result.append(r)
    return jsonify(result)

@app.route("/api/applications", methods=["POST"])
@login_required
def create_application():
    country = request.form.get("country", "")
    country_code = normalize_country_code(request.form.get("country_code"))
    if not country_code and is_country_code(country):
        country_code = normalize_country_code(country)
    application_type = request.form.get("application_type") or None
    visa_type = request.form.get("visa_type") or request.form.get("application_type") or None
    try:
        total_entries = int(request.form.get("total_entries", 1))
    except (TypeError, ValueError):
        total_entries = 1
    apply_date = request.form.get("apply_date") or date.today().isoformat()
    remarks = request.form.get("remarks") or None

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO visa_applications (country, country_code, application_type, visa_type, total_entries, apply_date, current_status, visa_result)
                VALUES (?,?,?,?,?,?,?,?)""",
            (country, country_code, application_type, visa_type, total_entries, apply_date, "开始申请", "未送签")
        )
        app_id = cur.lastrowid
        conn.execute(
            "INSERT INTO application_status_history (application_id, status, change_date, note) VALUES (?,?,?,?)",
            (app_id, "开始申请", apply_date, remarks)
        )

        # Handle file uploads
        files = request.files.getlist("files")
        for f in files:
            if f and f.filename and allowed_file(f.filename):
                ext = f.filename.rsplit(".", 1)[1].lower()
                fname = f"{uuid.uuid4().hex}.{ext}"
                save_path = os.path.join(APP_FOLDER, fname)
                f.save(save_path)
                conn.execute(
                    "INSERT INTO application_files (application_id, file_path, file_name) VALUES (?,?,?)",
                    (app_id, stored_file_path(APP_FOLDER, fname), f.filename)
                )
    return jsonify({"id": app_id, "ok": True})

@app.route("/api/applications/<int:aid>", methods=["GET"])
@login_required
def get_application(aid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM visa_applications WHERE id=?", (aid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        history = conn.execute(
            "SELECT * FROM application_status_history WHERE application_id=? ORDER BY change_date",
            (aid,)
        ).fetchall()
        files = conn.execute("SELECT * FROM application_files WHERE application_id=?", (aid,)).fetchall()
    return jsonify({"application": dict(row), "history": [dict(h) for h in history], "files": [dict(f) for f in files]})

@app.route("/api/applications/<int:aid>/status", methods=["PUT"])
@login_required
def update_application_status(aid):
    data = request.get_json() or {}
    new_status = data.get("status")
    change_date = data.get("change_date") or date.today().isoformat()
    note = data.get("note", "")

    if not new_status:
        return jsonify({"error": "status required"}), 400

    with get_db() as conn:
        row = conn.execute("SELECT * FROM visa_applications WHERE id=?", (aid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        old_result = row["visa_result"]
        new_result = old_result

        # Auto-link logic
        if new_status == "已入馆" and old_result == "未送签":
            new_result = "审查中"

        conn.execute(
            "UPDATE visa_applications SET current_status=?, visa_result=?, updated_at=datetime('now') WHERE id=?",
            (new_status, new_result, aid)
        )
        conn.execute(
            "INSERT INTO application_status_history (application_id, status, change_date, note) VALUES (?,?,?,?)",
            (aid, new_status, change_date, note)
        )
    return jsonify({"ok": True, "new_result": new_result})

@app.route("/api/applications/<int:aid>/result", methods=["PUT"])
@login_required
def update_application_result(aid):
    data = request.get_json() or {}
    new_result = data.get("result")
    result_note = data.get("result_note", "")
    visa_info = data.get("visa_info")  # for 降级签发
    change_date = data.get("change_date") or date.today().isoformat()

    if not new_result:
        return jsonify({"error": "result required"}), 400

    with get_db() as conn:
        row = conn.execute("SELECT * FROM visa_applications WHERE id=?", (aid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        new_status = row["current_status"]

        if new_result == "已签发":
            # "已签发" does not mean the visa has already been collected.
            new_status = "已出签"
            # Auto-create visa
            visa_country_code = normalize_country_code(row["country_code"]) if row["country_code"] else None
            if not visa_country_code and is_country_code(row["country"]):
                visa_country_code = normalize_country_code(row["country"])
            application_entries = row["total_entries"] if row["total_entries"] is not None else 1
            conn.execute(
                """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, visa_number, remarks, file_path, status, source_application_id)
                   VALUES (?,?,?,?,?,0,?,?,?,?,'pending',?)""",
                (row["country"], visa_country_code, data.get("valid_from"), data.get("valid_to"),
                 application_entries, row["visa_type"], data.get("visa_number"), result_note, None, aid)
            )
            new_visa_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.execute(
                "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,NULL,'pending','签证申请已签发自动创建')",
                (new_visa_id,)
            )

        elif new_result == "降级签发" and visa_info:
            new_status = "已出签"
            # Create visa with provided info
            issued_country = (visa_info.get("country") or row["country"] or "").strip()
            visa_country_code = normalize_country_code(visa_info.get("country_code"))
            if not visa_country_code and is_country_code(issued_country):
                visa_country_code = normalize_country_code(issued_country)
                conn.execute(
                     """INSERT INTO visas (country, country_code, valid_from, valid_to, total_entries, used_entries, visa_type, visa_number, remarks, file_path, status, source_application_id)
                         VALUES (?,?,?,?,?,0,?,?,?,?,'pending',?)""",
                     (issued_country, visa_country_code, visa_info.get("valid_from"),
                      visa_info.get("valid_to"), visa_info.get("total_entries", 1), visa_info.get("visa_type"),
                      visa_info.get("visa_number"), visa_info.get("remarks", result_note), None, aid)
                )
            new_visa_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.execute(
                "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,NULL,'pending','降级签发自动创建')",
                (new_visa_id,)
            )
            # Downgrade issuance should update the issued country on the application.
            conn.execute(
                "UPDATE visa_applications SET country=?, country_code=? WHERE id=?",
                (issued_country, visa_country_code, aid)
            )

        conn.execute(
            "UPDATE visa_applications SET current_status=?, visa_result=?, result_note=?, updated_at=datetime('now') WHERE id=?",
            (new_status, new_result, result_note, aid)
        )
        conn.execute(
            "INSERT INTO application_status_history (application_id, status, change_date, note) VALUES (?,?,?,?)",
            (aid, new_status, change_date, f"签证结果: {new_result}")
        )
    return jsonify({"ok": True})

@app.route("/api/applications/<int:aid>/files", methods=["POST"])
@login_required
def upload_application_files(aid):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM visa_applications WHERE id=?", (aid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        files = request.files.getlist("files")
        saved = []
        for f in files:
            if f and f.filename and allowed_file(f.filename):
                ext = f.filename.rsplit(".", 1)[1].lower()
                fname = f"{uuid.uuid4().hex}.{ext}"
                save_path = os.path.join(APP_FOLDER, fname)
                f.save(save_path)
                conn.execute(
                    "INSERT INTO application_files (application_id, file_path, file_name) VALUES (?,?,?)",
                    (aid, stored_file_path(APP_FOLDER, fname), f.filename)
                )
                saved.append(f.filename)
    return jsonify({"ok": True, "saved": saved})


@app.route("/api/applications/<int:aid>/files/<int:fid>", methods=["DELETE"])
@login_required
def delete_application_file(aid, fid):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM application_files WHERE id=? AND application_id=?",
            (fid, aid)
        ).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        conn.execute("DELETE FROM application_files WHERE id=?", (fid,))
    remove_storage_file(row["file_path"])
    return jsonify({"ok": True})

@app.route("/api/applications/<int:aid>", methods=["DELETE"])
@login_required
def delete_application(aid):
    with get_db() as conn:
        files = conn.execute("SELECT file_path FROM application_files WHERE application_id=?", (aid,)).fetchall()
        for file_row in files:
            remove_storage_file(file_row["file_path"])
        conn.execute("DELETE FROM application_files WHERE application_id=?", (aid,))
        conn.execute("DELETE FROM application_status_history WHERE application_id=?", (aid,))
        conn.execute("DELETE FROM visa_applications WHERE id=?", (aid,))
    return jsonify({"ok": True})

# ─── Travels ──────────────────────────────────────────────────────────────────

@app.route("/api/travels", methods=["GET"])
@login_required
def get_travels():
    with get_db() as conn:
        auto_expire_expired_visas(conn)
        rows = conn.execute(
            """SELECT t.*, v.country as visa_country, v.status as visa_status, v.visa_type
               FROM travels t LEFT JOIN visas v ON t.visa_id = v.id
               ORDER BY t.date DESC, t.id DESC"""
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/travels", methods=["POST"])
@login_required
def create_travel():
    data = request.get_json() or {}
    visa_id = data.get("visa_id") or None
    country = data.get("country", "")
    country_code = normalize_country_code(data.get("country_code"))
    if not country_code and is_country_code(country):
        country_code = normalize_country_code(country)
    travel_date = data.get("date") or date.today().isoformat()
    travel_type = data.get("type", "entry")
    remarks = data.get("remarks") or None

    with get_db() as conn:
        # Initialize travel_country with country name or country code
        travel_country = country or country_code

        previous_open_entry = None
        if travel_type == "entry":
            # Global trip closure: if latest event is an entry, user is still in-travel.
            last_travel = conn.execute(
                "SELECT * FROM travels ORDER BY date DESC, id DESC LIMIT 1"
            ).fetchone()
            if last_travel and last_travel["type"] == "entry":
                previous_open_entry = last_travel

        matched_visa_country = None
        visa_row = conn.execute(
            "SELECT country FROM visas WHERE id=?",
            (visa_id,)
        ).fetchone() if visa_id else None
        if visa_row:
            matched_visa_country = visa_row["country"]

        if travel_type == "entry" and previous_open_entry and previous_open_entry["country"] != travel_country:
            conn.execute(
                "INSERT INTO travels (visa_id, country, country_code, date, type, remarks) VALUES (?,?,?,?,?,?)",
                (previous_open_entry["visa_id"], previous_open_entry["country"], previous_open_entry["country_code"], travel_date, "exit", "[系统记录] 入境其他国家/地区")
            )

        cur = conn.execute(
            "INSERT INTO travels (visa_id, country, country_code, date, type, remarks) VALUES (?,?,?,?,?,?)",
            (visa_id, travel_country, country_code, travel_date, travel_type, remarks)
        )
        travel_id = cur.lastrowid

        if visa_id:
            visa = conn.execute("SELECT * FROM visas WHERE id=?", (visa_id,)).fetchone()
            if visa:
                if travel_type == "entry":
                    # Mark visa as active on first entry (don't count usage yet)
                    old_status = visa["status"]
                    if old_status == "pending":
                        conn.execute("UPDATE visas SET status='active' WHERE id=?", (visa_id,))
                        conn.execute(
                            "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,?,?,?)",
                            (visa_id, old_status, "active", f"入境使用签证 - {travel_country}")
                        )
                elif travel_type == "exit":
                    # Increment usage on exit and check if exhausted
                    if visa["status"] == "active":
                        used = visa["used_entries"] + 1
                        conn.execute("UPDATE visas SET used_entries=? WHERE id=?", (used, visa_id))
                        if used >= visa["total_entries"]:
                            conn.execute("UPDATE visas SET status='invalid' WHERE id=?", (visa_id,))
                            reason = "单次签证离境后失效" if visa["total_entries"] == 1 else f"多次签证已使用完毕 ({used}/{visa['total_entries']})"
                            conn.execute(
                                "INSERT INTO visa_status_history (visa_id, old_status, new_status, reason) VALUES (?,?,?,?)",
                                (visa_id, "active", "invalid", reason)
                            )

    return jsonify({"id": travel_id, "ok": True, "matched_visa_country": matched_visa_country})


@app.route("/api/travels/<int:tid>", methods=["PUT"])
@login_required
def update_travel(tid):
    data = request.get_json() or {}

    with get_db() as conn:
        row = conn.execute("SELECT * FROM travels WHERE id=?", (tid,)).fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        new_country = data["country"].strip() if "country" in data and isinstance(data["country"], str) else row["country"]
        new_country_code = row["country_code"]
        if "country_code" in data:
            new_country_code = normalize_country_code(data.get("country_code"))
        elif "country" in data and is_country_code(new_country):
            new_country_code = normalize_country_code(new_country)

        new_date = data.get("date", row["date"])
        new_type = data.get("type", row["type"])
        if new_type not in ("entry", "exit"):
            return jsonify({"error": "type must be entry or exit"}), 400

        new_visa_id = row["visa_id"]
        if "visa_id" in data:
            new_visa_id = data.get("visa_id")
            if new_visa_id in ("", None):
                new_visa_id = None

        new_remarks = row["remarks"]
        if "remarks" in data:
            new_remarks = data.get("remarks") or None

        conn.execute(
            """UPDATE travels
               SET visa_id=?, country=?, country_code=?, date=?, type=?, remarks=?
               WHERE id=?""",
            (new_visa_id, new_country, new_country_code, new_date, new_type, new_remarks, tid)
        )

    return jsonify({"ok": True})

@app.route("/api/travels/<int:tid>", methods=["DELETE"])
@login_required
def delete_travel(tid):
    with get_db() as conn:
        conn.execute("DELETE FROM travels WHERE id=?", (tid,))
    return jsonify({"ok": True})

# ─── Dashboard ────────────────────────────────────────────────────────────────

@app.route("/api/dashboard")
@login_required
def dashboard():
    today = date.today().isoformat()
    with get_db() as conn:
        auto_expire_expired_visas(conn)
        # Latest entry/exit
        last_entry = conn.execute(
            "SELECT * FROM travels WHERE type='entry' ORDER BY date DESC, id DESC LIMIT 1"
        ).fetchone()
        last_exit = conn.execute(
            "SELECT * FROM travels WHERE type='exit' ORDER BY date DESC, id DESC LIMIT 1"
        ).fetchone()

        in_travel = False
        days_in = 0
        current_country = None

        if last_entry:
            entry_date = last_entry["date"]
            entry_id = last_entry["id"]
            exit_is_newer_or_equal = False
            if last_exit:
                exit_date = last_exit["date"]
                exit_id = last_exit["id"]
                exit_is_newer_or_equal = (exit_date > entry_date) or (exit_date == entry_date and exit_id >= entry_id)

            if not exit_is_newer_or_equal:
                in_travel = True
                current_country = last_entry["country"]
                from datetime import datetime as dt
                delta = dt.fromisoformat(today) - dt.fromisoformat(entry_date)
                days_in = delta.days

        alert_window_days = 30
        # Include both pending and active visas for expiry reminders.
        reminding_visas = conn.execute(
            """SELECT * FROM visas
               WHERE status IN ('pending', 'active') AND valid_to IS NOT NULL
               ORDER BY valid_to"""
        ).fetchall()

        visa_alerts = []
        for v in reminding_visas:
            alert = dict(v)
            from datetime import datetime as dt
            remaining = (dt.fromisoformat(v["valid_to"]) - dt.fromisoformat(today)).days
            alert["days_remaining"] = remaining
            alert["expiry_warning"] = 0 <= remaining <= alert_window_days
            remaining_entries = (v["total_entries"] - v["used_entries"]) if v["total_entries"] > 0 else -1
            alert["remaining_entries"] = remaining_entries
            if alert["expiry_warning"]:
                visa_alerts.append(alert)

        # Pending visas count
        pending_count = conn.execute("SELECT COUNT(*) FROM visas WHERE status='pending'").fetchone()[0]
        active_count = conn.execute("SELECT COUNT(*) FROM visas WHERE status='active'").fetchone()[0]
        invalid_count = conn.execute("SELECT COUNT(*) FROM visas WHERE status='invalid'").fetchone()[0]

        # Recent travels
        recent_travels = conn.execute(
            "SELECT * FROM travels ORDER BY date DESC LIMIT 5"
        ).fetchall()

        # Pending applications
        pending_apps = conn.execute(
            "SELECT COUNT(*) FROM visa_applications WHERE visa_result NOT IN ('已签发','拒签')"
        ).fetchone()[0]

    return jsonify({
        "in_travel": in_travel,
        "current_country": current_country,
        "days_in": days_in,
        "visa_alerts": visa_alerts,
        "stats": {
            "pending": pending_count,
            "active": active_count,
            "invalid": invalid_count,
            "pending_applications": pending_apps
        },
        "recent_travels": [dict(r) for r in recent_travels]
    })

# ─── File serving ─────────────────────────────────────────────────────────────

@app.route("/api/files/<path:filepath>")
@login_required
def serve_file(filepath):
    full = resolve_storage_path(filepath)
    if not full or not os.path.exists(full):
        return jsonify({"error": "File not found"}), 404
    return send_file(full, conditional=True)

# ─── Frontend ─────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    frontend_path = os.path.join(os.path.dirname(__file__), "frontend")
    if path and os.path.exists(os.path.join(frontend_path, "static", path)):
        return send_from_directory(os.path.join(frontend_path, "static"), path)
    return send_from_directory(frontend_path, "index.html")

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Starting Travel Manager on {SERVER.get('host')}:{SERVER.get('port')}")
    app.run(
        host=SERVER.get("host", "0.0.0.0"),
        port=SERVER.get("port", 5000),
        debug=False
    )
