import sqlite3, os

db_path = os.path.join(os.path.dirname(__file__), "backend", "econova.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check existing columns
cur.execute("PRAGMA table_info(marketstate)")
cols = [row[1] for row in cur.fetchall()]
print("Existing columns:", cols)

if "trade_requires_approval" not in cols:
    cur.execute("ALTER TABLE marketstate ADD COLUMN trade_requires_approval INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    print("SUCCESS: Added trade_requires_approval column")
else:
    print("Column already exists, nothing to do.")

# Also create TradeApproval table if missing
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tradeapproval'")
if not cur.fetchone():
    cur.execute("""
        CREATE TABLE tradeapproval (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            offer_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_note TEXT,
            created_at DATETIME,
            resolved_at DATETIME,
            resolved_by TEXT,
            FOREIGN KEY(offer_id) REFERENCES privateoffer(id)
        )
    """)
    conn.commit()
    print("SUCCESS: Created tradeapproval table")
else:
    print("tradeapproval table already exists.")

conn.close()
print("Migration complete.")
