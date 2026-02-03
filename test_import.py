import sys
import os

# Add parent directory to path so we can import backend as a package if needed
# But here we are engaging 'backend' package behavior.
try:
    from backend.engine import MarketEngine
    print("Import Successful")
except Exception as e:
    print(f"Import Failed: {e}")
