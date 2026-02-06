"""
Load Testing Script for Econova Platform
Tests concurrent user capacity and response times
"""

import asyncio
import aiohttp
import time
from datetime import datetime

# Configuration
BACKEND_URL = "https://econova-backend-ybiq.onrender.com"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

class LoadTester:
    def __init__(self, num_users):
        self.num_users = num_users
        self.results = []
        
    async def login_user(self, session, user_id):
        """Simulate a user login"""
        start_time = time.time()
        try:
            data = aiohttp.FormData()
            data.add_field('username', ADMIN_USERNAME)
            data.add_field('password', ADMIN_PASSWORD)
            
            async with session.post(f"{BACKEND_URL}/token", data=data) as response:
                elapsed = time.time() - start_time
                status = response.status
                
                if status == 200:
                    result = await response.json()
                    return {
                        'user_id': user_id,
                        'action': 'login',
                        'status': status,
                        'time': elapsed,
                        'success': True
                    }
                else:
                    return {
                        'user_id': user_id,
                        'action': 'login',
                        'status': status,
                        'time': elapsed,
                        'success': False
                    }
        except Exception as e:
            elapsed = time.time() - start_time
            return {
                'user_id': user_id,
                'action': 'login',
                'status': 'error',
                'time': elapsed,
                'success': False,
                'error': str(e)
            }
    
    async def get_market_state(self, session, user_id, token):
        """Simulate getting market state"""
        start_time = time.time()
        try:
            headers = {'Authorization': f'Bearer {token}'}
            async with session.get(f"{BACKEND_URL}/market/state", headers=headers) as response:
                elapsed = time.time() - start_time
                status = response.status
                
                return {
                    'user_id': user_id,
                    'action': 'get_market',
                    'status': status,
                    'time': elapsed,
                    'success': status == 200
                }
        except Exception as e:
            elapsed = time.time() - start_time
            return {
                'user_id': user_id,
                'action': 'get_market',
                'status': 'error',
                'time': elapsed,
                'success': False,
                'error': str(e)
            }
    
    async def simulate_user(self, session, user_id):
        """Simulate a complete user session"""
        # Login
        login_result = await self.login_user(session, user_id)
        self.results.append(login_result)
        
        if login_result['success']:
            token = None
            # Get market state
            market_result = await self.get_market_state(session, user_id, token)
            self.results.append(market_result)
    
    async def run_test(self):
        """Run the load test with concurrent users"""
        print(f"\n{'='*60}")
        print(f"ECONOVA LOAD TEST - {self.num_users} Concurrent Users")
        print(f"{'='*60}")
        print(f"Backend: {BACKEND_URL}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")
        
        async with aiohttp.ClientSession() as session:
            # Create tasks for all users
            tasks = [self.simulate_user(session, i) for i in range(self.num_users)]
            
            # Run all tasks concurrently
            start_time = time.time()
            await asyncio.gather(*tasks)
            total_time = time.time() - start_time
        
        # Analyze results
        self.print_results(total_time)
    
    def print_results(self, total_time):
        """Print test results"""
        print(f"\n{'='*60}")
        print("TEST RESULTS")
        print(f"{'='*60}\n")
        
        # Overall stats
        total_requests = len(self.results)
        successful = sum(1 for r in self.results if r['success'])
        failed = total_requests - successful
        
        print(f"Total Time: {total_time:.2f}s")
        print(f"Total Requests: {total_requests}")
        print(f"Successful: {successful} ({successful/total_requests*100:.1f}%)")
        print(f"Failed: {failed} ({failed/total_requests*100:.1f}%)")
        
        # Response time stats
        times = [r['time'] for r in self.results if r['success']]
        if times:
            avg_time = sum(times) / len(times)
            min_time = min(times)
            max_time = max(times)
            
            print(f"\nResponse Times:")
            print(f"  Average: {avg_time:.3f}s")
            print(f"  Min: {min_time:.3f}s")
            print(f"  Max: {max_time:.3f}s")
        
        # Action breakdown
        print(f"\nBy Action:")
        actions = {}
        for r in self.results:
            action = r['action']
            if action not in actions:
                actions[action] = {'success': 0, 'failed': 0, 'times': []}
            
            if r['success']:
                actions[action]['success'] += 1
                actions[action]['times'].append(r['time'])
            else:
                actions[action]['failed'] += 1
        
        for action, stats in actions.items():
            total = stats['success'] + stats['failed']
            avg_time = sum(stats['times']) / len(stats['times']) if stats['times'] else 0
            print(f"  {action}: {stats['success']}/{total} successful, avg {avg_time:.3f}s")
        
        # Performance rating
        print(f"\n{'='*60}")
        print("PERFORMANCE RATING")
        print(f"{'='*60}\n")
        
        if avg_time < 1.0 and failed == 0:
            rating = "EXCELLENT ✅"
            capacity = f"Can handle {self.num_users * 2}+ concurrent users"
        elif avg_time < 2.0 and failed < total_requests * 0.1:
            rating = "GOOD ✅"
            capacity = f"Can handle ~{self.num_users} concurrent users comfortably"
        elif avg_time < 5.0 and failed < total_requests * 0.25:
            rating = "ACCEPTABLE ⚠️"
            capacity = f"Near capacity at {self.num_users} users, expect some lag"
        else:
            rating = "POOR ❌"
            capacity = f"Overloaded at {self.num_users} users, reduce load"
        
        print(f"Rating: {rating}")
        print(f"Capacity: {capacity}")
        print(f"\n{'='*60}\n")

async def main():
    """Main function to run progressive load tests"""
    print("\n🚀 ECONOVA CAPACITY TEST")
    print("Testing with increasing user loads...\n")
    
    # Test with different user counts
    user_counts = [5, 10, 15, 20, 25, 30]
    
    for count in user_counts:
        tester = LoadTester(count)
        await tester.run_test()
        
        # Wait between tests
        if count < user_counts[-1]:
            print("Waiting 5 seconds before next test...\n")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
