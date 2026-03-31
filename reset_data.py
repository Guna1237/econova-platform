
import sqlite3
import os

def reset_db():
    db_path = "econova_v4.db"
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    all_tables = [x[0] for x in cursor.fetchall()]

    for table in all_tables:
        if table == 'user':
            # Selective clear for users (keep admin)
            try:
                # Role enum values are strings in models.py: Role.ADMIN = "admin"
                cursor.execute("DELETE FROM user WHERE role != 'admin'")
                print("Deleted all non-admin users.")
                
                # Reset admin account balances
                cursor.execute("UPDATE user SET cash = 1000000.0, debt = 0.0, is_frozen = 0 WHERE role = 'admin'")
                print("Reset admin account balances.")
            except sqlite3.OperationalError as e:
                print(f"Could not clear user table: {e}")
        else:
            try:
                # Use double quotes for table names that might be reserved words (like "order")
                cursor.execute(f'DELETE FROM "{table}"')
                print(f"Cleared table: {table}")
            except sqlite3.OperationalError as e:
                print(f"Could not clear table {table}: {e}")

    conn.commit()
    conn.close()
    print("Database reset complete (except admin credentials).")

if __name__ == "__main__":
    reset_db()
