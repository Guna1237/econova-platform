import time
import urllib.request
import sys

def keep_alive(url, interval=840):
    """
    Pings the specified URL every 'interval' seconds.
    Default interval is 840 seconds (14 minutes) to beat the 15-minute sleep timer.
    """
    print(f"Starting keep-alive for: {url}")
    print(f"Ping interval: {interval} seconds")
    print("Press Ctrl+C to stop.")

    while True:
        try:
            start_time = time.time()
            with urllib.request.urlopen(url) as response:
                status = response.getcode()
                
            duration = time.time() - start_time
            timestamp = time.strftime('%H:%M:%S')
            
            if status == 200:
                print(f"[{timestamp}] Ping Successful! (Status: {status}, Time: {duration:.2f}s)")
            else:
                print(f"[{timestamp}] Warning: Ping returned status {status}")
                
        except Exception as e:
            timestamp = time.strftime('%H:%M:%S')
            print(f"[{timestamp}] Error pinging server: {e}")
            
        time.sleep(interval)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python keep_alive.py <YOUR_APP_URL>")
        print("Example: python keep_alive.py https://my-econova-app.onrender.com/health")
        
        # Interactive mode fallback
        url = input("Enter your app URL (e.g., https://.../health): ").strip()
        if not url:
            print("No URL provided. Exiting.")
            sys.exit(1)
    else:
        url = sys.argv[1]

    keep_alive(url)
