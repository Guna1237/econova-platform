from backend.auth import get_password_hash
try:
    h = get_password_hash("admin123")
    print(f"Hash success: {h}")
except Exception as e:
    print(f"Hash failed: {e}")
