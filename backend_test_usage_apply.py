#!/usr/bin/env python3
"""
Backend test for POST /api/usage/apply endpoint (FIXED decimal support + deletion)
Tests the fix for fractional usage amounts (0.4 kg → 0 bug) and product deletion when quantity <= 0.
"""

import requests
import json
import sys
import time

# Configuration
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"
KITCHEN_ID = "a2573e6a-70f0-4a6d-97d0-ccf09b444643"
SUPABASE_URL = "https://sabsvsolekdhztzqafuc.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnN2c29sZWtkaHp0enFhZnVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0Njk3MywiZXhwIjoyMDk2MTIyOTczfQ.wPZtV53LGHK6v4PINyX-iLsjB_36Spxf15XoNqYxedg"

# Generate chef JWT token
import subprocess
result = subprocess.run(
    ['node', '-e', 
     'require("dotenv").config({silent:true}); console.log(require("jsonwebtoken").sign({kitchen_id:"a2573e6a-70f0-4a6d-97d0-ccf09b444643",role:"chef",person:"Xyz"},process.env.SHELFWISE_JWT_SECRET,{expiresIn:"1h"}))'],
    cwd='/app',
    capture_output=True,
    text=True
)
# Extract only the JWT token (last line)
JWT_TOKEN = result.stdout.strip().split('\n')[-1]
print(f"✓ Generated chef JWT token: {JWT_TOKEN[:50]}...")

HEADERS = {
    "Authorization": f"Bearer {JWT_TOKEN}",
    "Content-Type": "application/json"
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json"
}

# Track created products for cleanup
created_products = []
created_activity_log_ids = []

def create_test_product(name, quantity, unit, storage_type="Fridge"):
    """Create a test product via POST /api/products"""
    try:
        payload = {
            "name": name,
            "quantity": quantity,
            "unit": unit,
            "storageType": storage_type,
            "category": "Test",
            "expiryDate": "2026-12-31"
        }
        response = requests.post(f"{BASE_URL}/products", json=payload, headers=HEADERS, timeout=10)
        if response.status_code == 201:
            product = response.json()
            created_products.append(product['id'])
            print(f"✓ Created test product: {name} ({quantity} {unit}) - ID: {product['id']}")
            return product
        else:
            print(f"✗ Failed to create product {name}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"✗ Exception creating product {name}: {e}")
        return None

def get_product(product_id):
    """Get a product by ID via GET /api/products"""
    try:
        response = requests.get(f"{BASE_URL}/products", headers=HEADERS, timeout=10)
        if response.status_code == 200:
            products = response.json()
            for p in products:
                if p['id'] == product_id:
                    return p
            return None
        else:
            print(f"✗ Failed to get products: {response.status_code}")
            return None
    except Exception as e:
        print(f"✗ Exception getting product: {e}")
        return None

def apply_usage(items):
    """Apply usage via POST /api/usage/apply"""
    try:
        payload = {"items": items}
        response = requests.post(f"{BASE_URL}/usage/apply", json=payload, headers=HEADERS, timeout=10)
        return response
    except requests.exceptions.RequestException as e:
        print(f"✗ Request exception applying usage: {e}")
        # Return a mock response for connection errors
        class MockResponse:
            def __init__(self):
                self.status_code = 0
                self.text = str(e)
        return MockResponse()
    except Exception as e:
        print(f"✗ Exception applying usage: {e}")
        return None

def get_activity_logs():
    """Get activity logs via Supabase REST API"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/activity_logs"
        params = {
            "kitchen_id": f"eq.{KITCHEN_ID}",
            "action": "eq.item_used",
            "order": "created_at.desc",
            "limit": "10"
        }
        response = requests.get(url, headers=SUPABASE_HEADERS, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"✗ Failed to get activity logs: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"✗ Exception getting activity logs: {e}")
        return []

def delete_activity_log(log_id):
    """Delete an activity log via Supabase REST API"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/activity_logs"
        params = {"id": f"eq.{log_id}"}
        response = requests.delete(url, headers=SUPABASE_HEADERS, params=params, timeout=10)
        if response.status_code in [200, 204]:
            print(f"✓ Deleted activity log: {log_id}")
            return True
        else:
            print(f"✗ Failed to delete activity log {log_id}: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Exception deleting activity log: {e}")
        return False

def delete_product(product_id):
    """Delete a product via DELETE /api/products/:id"""
    try:
        response = requests.delete(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=10)
        if response.status_code == 200:
            print(f"✓ Deleted product: {product_id}")
            return True
        else:
            print(f"✗ Failed to delete product {product_id}: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Exception deleting product: {e}")
        return False

def cleanup():
    """Clean up all test data"""
    print("\n" + "="*80)
    print("CLEANUP: Removing all test data")
    print("="*80)
    
    # Delete remaining test products
    for product_id in created_products:
        delete_product(product_id)
    
    # Delete test activity logs (field is 'detail' not 'description')
    logs = get_activity_logs()
    for log in logs:
        if "TEST-" in log.get('detail', ''):
            delete_activity_log(log['id'])
            created_activity_log_ids.append(log['id'])
    
    # Verify no TEST- products remain
    try:
        response = requests.get(f"{BASE_URL}/products", headers=HEADERS, timeout=10)
        if response.status_code == 200:
            products = response.json()
            test_products = [p for p in products if p['name'].startswith('TEST-')]
            if test_products:
                print(f"⚠️  WARNING: {len(test_products)} TEST- products still remain:")
                for p in test_products:
                    print(f"   - {p['name']} (ID: {p['id']})")
            else:
                print("✓ No TEST- products remain in inventory")
    except Exception as e:
        print(f"✗ Exception verifying cleanup: {e}")

def run_tests():
    """Run all tests for POST /api/usage/apply"""
    print("\n" + "="*80)
    print("BACKEND TEST: POST /api/usage/apply (FIXED decimal support + deletion)")
    print("="*80)
    
    test_results = []
    
    # SETUP: Create test products
    print("\n--- SETUP: Creating test products ---")
    product_a = create_test_product("TEST-Basil Pesto", 0.4, "kg", "Fridge")
    product_b = create_test_product("TEST-Cream", 2.5, "kg", "Fridge")
    product_c = create_test_product("TEST-Lemon", 1, "ea", "Fridge")
    
    if not all([product_a, product_b, product_c]):
        print("\n✗ SETUP FAILED: Could not create test products")
        cleanup()
        return False
    
    time.sleep(1)  # Allow DB to settle
    
    # TEST 1: Use exact quantity (0.4 kg) → should delete product
    print("\n--- TEST 1: Use exact quantity (0.4 kg) → product should be DELETED ---")
    try:
        response = apply_usage([{"id": product_a['id'], "used": 0.4}])
        if response and response.status_code == 200:
            data = response.json()
            print(f"✓ Response: {json.dumps(data, indent=2)}")
            
            # Verify response structure
            if data.get('ok') and data.get('applied') == 1:
                result = data['results'][0]
                checks = [
                    (result.get('ok') == True, "ok: true"),
                    (result.get('from') == 0.4, f"from: 0.4 (actual: {result.get('from')})"),
                    (result.get('used') == 0.4, f"used: 0.4 (actual: {result.get('used')})"),
                    (result.get('to') == 0, f"to: 0 (actual: {result.get('to')})"),
                    (result.get('removed') == True, f"removed: true (actual: {result.get('removed')})"),
                ]
                
                all_passed = all(check[0] for check in checks)
                for passed, msg in checks:
                    print(f"  {'✓' if passed else '✗'} {msg}")
                
                # Verify product is deleted from inventory
                time.sleep(1)
                product_check = get_product(product_a['id'])
                if product_check is None:
                    print("  ✓ Product TEST-Basil Pesto is GONE from inventory (deleted)")
                    test_results.append(("TEST 1: Exact usage → deletion", True))
                else:
                    print(f"  ✗ Product TEST-Basil Pesto still exists: {product_check}")
                    test_results.append(("TEST 1: Exact usage → deletion", False))
            else:
                print(f"✗ Unexpected response structure: {data}")
                test_results.append(("TEST 1: Exact usage → deletion", False))
        else:
            print(f"✗ Failed: {response.status_code if response else 'No response'}")
            test_results.append(("TEST 1: Exact usage → deletion", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 1: Exact usage → deletion", False))
    
    # TEST 2: Partial usage (0.7 kg from 2.5 kg) → should update to 1.8 kg
    print("\n--- TEST 2: Partial usage (0.7 kg from 2.5 kg) → should update to 1.8 kg ---")
    try:
        response = apply_usage([{"id": product_b['id'], "used": 0.7}])
        if response and response.status_code == 200:
            data = response.json()
            print(f"✓ Response: {json.dumps(data, indent=2)}")
            
            if data.get('ok') and data.get('applied') == 1:
                result = data['results'][0]
                checks = [
                    (result.get('ok') == True, "ok: true"),
                    (result.get('from') == 2.5, f"from: 2.5 (actual: {result.get('from')})"),
                    (result.get('used') == 0.7, f"used: 0.7 (actual: {result.get('used')})"),
                    (result.get('to') == 1.8, f"to: 1.8 (actual: {result.get('to')})"),
                    (result.get('removed') in [False, None], f"removed: absent/false (actual: {result.get('removed')})"),
                ]
                
                all_passed = all(check[0] for check in checks)
                for passed, msg in checks:
                    print(f"  {'✓' if passed else '✗'} {msg}")
                
                # Verify product quantity updated
                time.sleep(1)
                product_check = get_product(product_b['id'])
                if product_check and product_check.get('quantity') == 1.8:
                    print(f"  ✓ Product TEST-Cream quantity updated to 1.8 kg")
                    test_results.append(("TEST 2: Partial usage → update", True))
                else:
                    print(f"  ✗ Product quantity mismatch: {product_check.get('quantity') if product_check else 'Not found'}")
                    test_results.append(("TEST 2: Partial usage → update", False))
            else:
                print(f"✗ Unexpected response structure: {data}")
                test_results.append(("TEST 2: Partial usage → update", False))
        else:
            print(f"✗ Failed: {response.status_code if response else 'No response'}")
            test_results.append(("TEST 2: Partial usage → update", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 2: Partial usage → update", False))
    
    # TEST 3: Over-use (5 ea from 1 ea) → should delete product
    print("\n--- TEST 3: Over-use (5 ea from 1 ea) → should delete product ---")
    try:
        response = apply_usage([{"id": product_c['id'], "used": 5}])
        if response and response.status_code == 200:
            data = response.json()
            print(f"✓ Response: {json.dumps(data, indent=2)}")
            
            if data.get('ok') and data.get('applied') == 1:
                result = data['results'][0]
                checks = [
                    (result.get('ok') == True, "ok: true"),
                    (result.get('to') == 0, f"to: 0 (actual: {result.get('to')})"),
                    (result.get('removed') == True, f"removed: true (actual: {result.get('removed')})"),
                ]
                
                all_passed = all(check[0] for check in checks)
                for passed, msg in checks:
                    print(f"  {'✓' if passed else '✗'} {msg}")
                
                # Verify product is deleted
                time.sleep(1)
                product_check = get_product(product_c['id'])
                if product_check is None:
                    print("  ✓ Product TEST-Lemon is GONE from inventory (deleted)")
                    test_results.append(("TEST 3: Over-use → deletion", True))
                else:
                    print(f"  ✗ Product TEST-Lemon still exists: {product_check}")
                    test_results.append(("TEST 3: Over-use → deletion", False))
            else:
                print(f"✗ Unexpected response structure: {data}")
                test_results.append(("TEST 3: Over-use → deletion", False))
        else:
            print(f"✗ Failed: {response.status_code if response else 'No response'}")
            test_results.append(("TEST 3: Over-use → deletion", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 3: Over-use → deletion", False))
    
    # TEST 4: Empty items array → should return 400
    print("\n--- TEST 4: Empty items array → should return 400 ---")
    try:
        import subprocess
        result = subprocess.run(
            ['curl', '-s', '-X', 'POST', f'{BASE_URL}/usage/apply',
             '-H', f'Authorization: Bearer {JWT_TOKEN}',
             '-H', 'Content-Type: application/json',
             '-d', '{"items":[]}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        response_text = result.stdout
        print(f"Response: {response_text}")
        if 'No items' in response_text and 'error' in response_text:
            print(f"✓ Correctly rejected empty items")
            test_results.append(("TEST 4: Empty items → 400", True))
        else:
            print(f"✗ Unexpected response")
            test_results.append(("TEST 4: Empty items → 400", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 4: Empty items → 400", False))
    
    # TEST 5: Zero-used items → should return 400
    print("\n--- TEST 5: Zero-used items → should return 400 ---")
    try:
        import subprocess
        result = subprocess.run(
            ['curl', '-s', '-X', 'POST', f'{BASE_URL}/usage/apply',
             '-H', f'Authorization: Bearer {JWT_TOKEN}',
             '-H', 'Content-Type: application/json',
             '-d', f'{{"items":[{{"id":"{product_b["id"]}","used":0}}]}}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        response_text = result.stdout
        print(f"Response: {response_text}")
        if 'No items' in response_text and 'error' in response_text:
            print(f"✓ Correctly rejected zero-used items")
            test_results.append(("TEST 5: Zero-used → 400", True))
        else:
            print(f"✗ Unexpected response")
            test_results.append(("TEST 5: Zero-used → 400", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 5: Zero-used → 400", False))
    
    # TEST 6: Verify activity logs
    print("\n--- TEST 6: Verify activity logs via Supabase REST API ---")
    try:
        time.sleep(2)  # Allow activity logs to be written
        logs = get_activity_logs()
        print(f"✓ Retrieved {len(logs)} recent activity logs")
        
        # Look for our test products in the logs (field is 'detail' not 'description')
        test_logs = [log for log in logs if any(name in log.get('detail', '') for name in ['TEST-Basil Pesto', 'TEST-Cream', 'TEST-Lemon'])]
        
        if len(test_logs) >= 3:
            print(f"✓ Found {len(test_logs)} activity logs for test products:")
            for log in test_logs:
                detail = log.get('detail', '')
                person = log.get('person', '')
                print(f"  - {detail} (person: {person})")
                created_activity_log_ids.append(log['id'])
            
            # Verify specific details
            checks = [
                (any('TEST-Basil Pesto' in log.get('detail', '') and '0.4' in log.get('detail', '') and 'kg' in log.get('detail', '') for log in test_logs), "TEST-Basil Pesto (0.4 kg) logged"),
                (any('TEST-Cream' in log.get('detail', '') and '0.7' in log.get('detail', '') and 'kg' in log.get('detail', '') for log in test_logs), "TEST-Cream (0.7 kg) logged"),
                (any('TEST-Lemon' in log.get('detail', '') for log in test_logs), "TEST-Lemon logged"),
                (all(log.get('person') == 'Xyz' for log in test_logs), "Person 'Xyz' recorded in all logs"),
            ]
            
            all_passed = all(check[0] for check in checks)
            for passed, msg in checks:
                print(f"  {'✓' if passed else '✗'} {msg}")
            
            test_results.append(("TEST 6: Activity logs verification", all_passed))
        else:
            print(f"✗ Expected at least 3 activity logs, found {len(test_logs)}")
            test_results.append(("TEST 6: Activity logs verification", False))
    except Exception as e:
        print(f"✗ Exception: {e}")
        test_results.append(("TEST 6: Activity logs verification", False))
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        print(f"{'✓' if result else '✗'} {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return True
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return False

if __name__ == "__main__":
    try:
        success = run_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        cleanup()
        sys.exit(1)
    except Exception as e:
        print(f"\n\n✗ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        cleanup()
        sys.exit(1)
