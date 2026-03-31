
import sqlite3
conn = sqlite3.connect('econova_v4.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [x[0] for x in cursor.fetchall()]
print(", ".join(tables))
conn.close()
