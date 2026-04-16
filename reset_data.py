"""
Econova Competition Reset Script
---------------------------------
Preserves: admin & banker accounts (credentials intact)
Clears:    all teams, holdings, loans, bids, offers, trades,
           news, approvals, activity logs, price history,
           market state (reset to start)
Resets:    asset prices back to base prices
"""

import sqlite3
import os

# Tables to wipe completely (game data only, no user accounts)
GAME_DATA_TABLES = [
    "holding",
    "teamloan",
    "loanapproval",
    "auctionlot",
    "auctionbid",
    "privateoffer",
    "tradeapproval",
    "transaction",
    "mortgageloan",
    "bailoutrecord",
    "bankerrequest",
    "newsitem",
    "activeevent",
    "pricehistory",
    "activitylog",
    "consentrecord",
    "teamleaderinfo",
    '"order"',   # reserved word, needs quoting
]

# Asset base prices to restore (matches engine.py initialize_assets)
ASSET_BASE_PRICES = {
    "GOLD":  5000.0,
    "NVDA":  1000.0,
    "BRENT":   80.0,
    "REITS": 2500.0,
    "TBILL":  100.0,
}

def reset_db():
    db_path = "econova_v4.db"
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = OFF")   # avoid FK constraint issues during wipe
    cursor = conn.cursor()

    # 1. Wipe all game data tables
    for table in GAME_DATA_TABLES:
        try:
            cursor.execute(f"DELETE FROM {table}")
            print(f"Cleared: {table}")
        except sqlite3.OperationalError as e:
            print(f"  Skipped {table}: {e}")

    # 2. Delete TEAM and AI_AGENT users; keep admin and banker
    try:
        cursor.execute("DELETE FROM user WHERE role IN ('team', 'ai_agent')")
        print(f"Deleted team/AI accounts ({cursor.rowcount} rows).")
    except sqlite3.OperationalError as e:
        print(f"Could not clear team users: {e}")

    # 3. Reset banker cash to 0 (admin will re-capitalise them before the game)
    try:
        cursor.execute("UPDATE user SET cash = 0.0, debt = 0.0, is_frozen = 0 WHERE role = 'banker'")
        print(f"Reset banker balances ({cursor.rowcount} bankers).")
    except sqlite3.OperationalError as e:
        print(f"Could not reset bankers: {e}")

    # 4. Reset admin balance (admin doesn't need cash, just cosmetic)
    try:
        cursor.execute("UPDATE user SET cash = 0.0, debt = 0.0, is_frozen = 0 WHERE role = 'admin'")
        print("Reset admin balance.")
    except sqlite3.OperationalError as e:
        print(f"Could not reset admin: {e}")

    # 5. Reset asset prices back to base prices
    for ticker, base_price in ASSET_BASE_PRICES.items():
        try:
            cursor.execute(
                "UPDATE asset SET current_price = ? WHERE ticker = ?",
                (base_price, ticker)
            )
            if cursor.rowcount:
                print(f"Reset {ticker} price → {base_price}")
        except sqlite3.OperationalError as e:
            print(f"Could not reset {ticker}: {e}")

    # 6. Reset market state to pre-game
    try:
        cursor.execute("""
            UPDATE marketstate SET
                current_year = 0,
                current_quarter = 1,
                phase = 'PRE_GAME',
                shock_stage = 'NORMAL',
                shock_type = 'NONE',
                last_shock_year = NULL,
                news_feed = 'Welcome to Econova Enterprise.',
                active_auction_asset = NULL,
                marketplace_open = 0,
                credit_facility_open = 0,
                trade_requires_approval = 0
        """)
        print("Reset market state to PRE_GAME.")
    except sqlite3.OperationalError as e:
        print(f"Could not reset market state: {e}")

    conn.commit()
    conn.close()

    print("\n✓ Reset complete.")
    print("  Admin and banker credentials are preserved.")
    print("  Restart the backend server to apply changes fully.")

if __name__ == "__main__":
    # Safety prompt
    confirm = input("This will wipe all game data. Type YES to confirm: ").strip()
    if confirm != "YES":
        print("Aborted.")
    else:
        reset_db()
