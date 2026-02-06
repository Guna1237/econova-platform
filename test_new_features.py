"""
Quick test script to verify new endpoints work correctly
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_health():
    """Test basic health endpoint"""
    response = requests.get(f"{BASE_URL}/health")
    print(f"✓ Health check: {response.json()}")
    return response.status_code == 200

def test_login():
    """Test login and get token"""
    response = requests.post(
        f"{BASE_URL}/token",
        data={"username": "admin", "password": "admin123"}
    )
    data = response.json()
    print(f"✓ Login successful: role={data['role']}, has_consented={data.get('has_consented', False)}")
    return data["access_token"]

def test_auction_lots(token):
    """Test getting auction lots"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # First open an auction
    response = requests.post(
        f"{BASE_URL}/admin/auction/open/GOLD",
        headers=headers
    )
    print(f"✓ Auction opened: {response.json()}")
    
    # Get lots
    response = requests.get(f"{BASE_URL}/auction/lots")
    lots = response.json()
    print(f"✓ Auction lots retrieved: {len(lots)} lots for GOLD")
    for lot in lots:
        print(f"  - Lot {lot['lot_number']}: {lot['quantity']} units @ ${lot['base_price']}")
    
    return lots

def test_price_nudge(token):
    """Test admin price nudge"""
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.post(
        f"{BASE_URL}/admin/price/nudge",
        headers=headers,
        json={"ticker": "TECH", "adjustment_pct": 5}
    )
    result = response.json()
    print(f"✓ Price nudged: {result['ticker']} from ${result['old_price']:.2f} to ${result['new_price']:.2f} ({result['change_pct']:.1f}%)")

def test_export_summary(token):
    """Test research data summary"""
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BASE_URL}/admin/export/summary",
        headers=headers
    )
    summary = response.json()
    print(f"✓ Research summary:")
    print(f"  - Total users: {summary['total_users']}")
    print(f"  - Consented users: {summary['consented_users']}")
    print(f"  - Total actions logged: {summary['total_actions_logged']}")

def main():
    print("=" * 60)
    print("Testing Econova Backend Enhancements")
    print("=" * 60)
    
    try:
        # Basic tests
        test_health()
        token = test_login()
        
        # New features
        print("\n--- Testing Multi-Lot Auctions ---")
        test_auction_lots(token)
        
        print("\n--- Testing Admin Price Nudge ---")
        test_price_nudge(token)
        
        print("\n--- Testing Data Export ---")
        test_export_summary(token)
        
        print("\n" + "=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
