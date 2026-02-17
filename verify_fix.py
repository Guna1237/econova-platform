import sys
import os
from fastapi.testclient import TestClient

# Add the project root to sys.path
sys.path.append(os.getcwd())

try:
    from backend.main import app, get_current_user, get_current_admin, get_session
    from backend.models import User, Role
    print("Successfully imported app from backend.main")
    
    # Check for duplicate routes
    routes = {}
    duplicates = []
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            key = (route.path, tuple(route.methods))
            if key in routes:
                duplicates.append(key)
            routes[key] = True
            
    if duplicates:
        print("Found duplicate routes:")
        for d in duplicates:
            print(f"  {d}")
    else:
        print("No duplicate routes found.")

    # MOCK AUTH
    async def mock_get_current_admin():
        return User(id=1, username="admin", role=Role.ADMIN)

    async def mock_get_current_user():
        return User(id=2, username="test_user", role=Role.TEAM, cash=100000)

    app.dependency_overrides[get_current_admin] = mock_get_current_admin
    app.dependency_overrides[get_current_user] = mock_get_current_user

    # Mock Session to avoid DB writes? 
    # Actually, if we use the real DB, we might clutter it. 
    # But for now, let's just see if we hit the endpoint code.
    # If we don't mock session, it tries to connect to real DB.
    # The real DB is file-based (sqlite), so it should work if the file is accessible.
    
    client = TestClient(app)

    print("\n--- Testing News Creation (Admin) ---")
    response = client.post("/admin/news/create", json={
        "title": "Test News",
        "content": "Test Content", 
        "is_published": True
    })
    print(f"News Create Response: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.text}")
    
    print("\n--- Testing Offer Creation (User) ---")
    # We need a valid asset ticker. 'TECH' usually exists?
    # If not, it will return 404 Asset not found, which is distinct from 500.
    response = client.post("/offers/create", json={
        "asset_ticker": "TECH",
        "offer_type": "BUY", 
        "quantity": 1,
        "price_per_unit": 100
    })
    print(f"Offer Create Response: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.text}")

except Exception as e:
    print(f"Verification Failed: {e}")
    sys.exit(1)
