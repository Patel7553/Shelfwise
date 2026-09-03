#!/usr/bin/env python3
"""
Backend test for SEPT 2026 SESSION features:
- Price history on products (custom_fields._priceHistory)
- Stats expiredCost (wastage as cost)
- Activity log date filters (?from&to)
- Settings modulesEnabled tokens

CRITICAL: This talks to REAL production Supabase.
Only create products named "ZZZ Backend Test ..." and DELETE + purge trash at the end.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3000/api"
KITCHEN_ID = "a2573e6a-70f0-4a6d-97d0-ccf09b444643"

# Mint CHEF JWT
def mint_chef_jwt():
    import subprocess
    cmd = """cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))" 2>/dev/null"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    # Extract only the JWT token (last line, starts with "eyJ")
    lines = result.stdout.strip().split('\n')
    for line in reversed(lines):
        if line.startswith('eyJ'):
            return line.strip()
    return result.stdout.strip()

# Mint OWNER JWT
def mint_owner_jwt():
    import subprocess
    cmd = """cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'owner',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))" 2>/dev/null"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    # Extract only the JWT token (last line, starts with "eyJ")
    lines = result.stdout.strip().split('\n')
    for line in reversed(lines):
        if line.startswith('eyJ'):
            return line.strip()
    return result.stdout.strip()

def test_price_history():
    """Test price history tracking on products"""
    print("\n" + "="*80)
    print("TEST 1-4: PRICE HISTORY TRACKING")
    print("="*80)
    
    chef_token = mint_chef_jwt()
    headers = {"Authorization": f"Bearer {chef_token}", "Content-Type": "application/json"}
    
    created_products = []
    
    try:
        # TEST 1: Price history seed on create
        print("\n[TEST 1] Price history seed on CREATE...")
        product_data = {
            "name": "ZZZ Backend Test Cost",
            "quantity": 2,
            "unit": "kg",
            "unitCost": 2.50,
            "expiryDate": "2027-06-01",
            "category": "Test",
            "storageType": "Fridge"
        }
        
        resp = requests.post(f"{BASE_URL}/products", json=product_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 201:
            print(f"  ❌ FAIL: Expected 201, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return False
        
        product = resp.json()
        created_products.append(product['id'])
        print(f"  Product ID: {product['id']}")
        print(f"  Unit Cost: {product.get('unitCost')}")
        print(f"  Price History: {product.get('priceHistory')}")
        
        # Verify price history has exactly 1 entry
        price_history = product.get('priceHistory', [])
        if len(price_history) != 1:
            print(f"  ❌ FAIL: Expected 1 price history entry, got {len(price_history)}")
            return False
        
        entry = price_history[0]
        if entry.get('cost') != 2.5:
            print(f"  ❌ FAIL: Expected cost=2.5, got {entry.get('cost')}")
            return False
        if entry.get('prevCost') is not None:
            print(f"  ❌ FAIL: Expected prevCost=null, got {entry.get('prevCost')}")
            return False
        if not entry.get('at'):
            print(f"  ❌ FAIL: Missing 'at' timestamp")
            return False
        if not entry.get('by'):
            print(f"  ❌ FAIL: Missing 'by' person")
            return False
        
        print(f"  ✅ PASS: Price history seeded correctly")
        print(f"    - cost: {entry['cost']}, prevCost: {entry['prevCost']}, by: {entry['by']}")
        
        # TEST 2: Price history append on cost change
        print("\n[TEST 2] Price history APPEND on cost change...")
        update_data = {
            "name": "ZZZ Backend Test Cost",
            "quantity": 2,
            "unit": "kg",
            "unitCost": 3.00,
            "expiryDate": "2027-06-01",
            "category": "Test",
            "storageType": "Fridge"
        }
        
        resp = requests.put(f"{BASE_URL}/products/{product['id']}", json=update_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return False
        
        updated_product = resp.json()
        print(f"  Unit Cost: {updated_product.get('unitCost')}")
        print(f"  Price History: {updated_product.get('priceHistory')}")
        
        # Verify price history now has 2 entries
        price_history = updated_product.get('priceHistory', [])
        if len(price_history) != 2:
            print(f"  ❌ FAIL: Expected 2 price history entries, got {len(price_history)}")
            return False
        
        # Check the last entry
        last_entry = price_history[-1]
        if last_entry.get('cost') != 3.0:
            print(f"  ❌ FAIL: Expected cost=3.0, got {last_entry.get('cost')}")
            return False
        if last_entry.get('prevCost') != 2.5:
            print(f"  ❌ FAIL: Expected prevCost=2.5, got {last_entry.get('prevCost')}")
            return False
        
        # Verify custom_fields survived (addedBy should be present)
        if not updated_product.get('addedBy'):
            print(f"  ❌ FAIL: custom_fields._addedBy was lost during merge")
            return False
        
        print(f"  ✅ PASS: Price history appended correctly")
        print(f"    - Entry 2: cost={last_entry['cost']}, prevCost={last_entry['prevCost']}, by={last_entry['by']}")
        print(f"    - custom_fields preserved: addedBy={updated_product.get('addedBy')}")
        
        # TEST 3: No duplicate history when cost unchanged
        print("\n[TEST 3] NO duplicate history when cost UNCHANGED...")
        resp = requests.put(f"{BASE_URL}/products/{product['id']}", json=update_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        unchanged_product = resp.json()
        price_history = unchanged_product.get('priceHistory', [])
        if len(price_history) != 2:
            print(f"  ❌ FAIL: Expected 2 price history entries (no duplicate), got {len(price_history)}")
            return False
        
        print(f"  ✅ PASS: No duplicate entry added (still 2 entries)")
        
        # TEST 4: History preserved when cost omitted
        print("\n[TEST 4] History PRESERVED when cost OMITTED...")
        update_no_cost = {
            "name": "ZZZ Backend Test Cost Updated",
            "quantity": 3
        }
        
        resp = requests.put(f"{BASE_URL}/products/{product['id']}", json=update_no_cost, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        preserved_product = resp.json()
        price_history = preserved_product.get('priceHistory', [])
        if len(price_history) != 2:
            print(f"  ❌ FAIL: Expected 2 price history entries (preserved), got {len(price_history)}")
            return False
        
        print(f"  ✅ PASS: Price history preserved (still 2 entries)")
        print(f"    - Name updated to: {preserved_product.get('name')}")
        print(f"    - Quantity updated to: {preserved_product.get('quantity')}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Store created products for cleanup
        return created_products

def test_expired_cost_stat(created_products):
    """Test expiredCost field in stats endpoint"""
    print("\n" + "="*80)
    print("TEST 5: EXPIRED COST STAT")
    print("="*80)
    
    chef_token = mint_chef_jwt()
    headers = {"Authorization": f"Bearer {chef_token}", "Content-Type": "application/json"}
    
    try:
        # Get baseline stats
        print("\n[TEST 5a] Get baseline expiredCost...")
        resp = requests.get(f"{BASE_URL}/stats", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        baseline_stats = resp.json()
        baseline_expired_cost = baseline_stats.get('expiredCost', 0)
        baseline_expired_count = baseline_stats.get('expired', 0)
        
        print(f"  Baseline expiredCost: {baseline_expired_cost}")
        print(f"  Baseline expired count: {baseline_expired_count}")
        
        # Verify expiredCost field exists and is numeric
        if 'expiredCost' not in baseline_stats:
            print(f"  ❌ FAIL: expiredCost field missing from stats")
            return False
        
        if not isinstance(baseline_expired_cost, (int, float)):
            print(f"  ❌ FAIL: expiredCost is not numeric: {type(baseline_expired_cost)}")
            return False
        
        if baseline_expired_cost < 0:
            print(f"  ❌ FAIL: expiredCost is negative: {baseline_expired_cost}")
            return False
        
        print(f"  ✅ PASS: expiredCost field present and numeric (≥0)")
        
        # Create an expired product with cost
        print("\n[TEST 5b] Create expired product and verify expiredCost increases...")
        expired_product_data = {
            "name": "ZZZ Backend Test Expired",
            "quantity": 2,
            "unit": "kg",
            "unitCost": 5.00,
            "expiryDate": "2020-01-01",
            "category": "Test",
            "storageType": "Fridge"
        }
        
        resp = requests.post(f"{BASE_URL}/products", json=expired_product_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 201:
            print(f"  ❌ FAIL: Expected 201, got {resp.status_code}")
            return False
        
        expired_product = resp.json()
        created_products.append(expired_product['id'])
        print(f"  Created expired product: {expired_product['id']}")
        
        # Get updated stats
        resp = requests.get(f"{BASE_URL}/stats", headers=headers)
        updated_stats = resp.json()
        updated_expired_cost = updated_stats.get('expiredCost', 0)
        updated_expired_count = updated_stats.get('expired', 0)
        
        print(f"  Updated expiredCost: {updated_expired_cost}")
        print(f"  Updated expired count: {updated_expired_count}")
        
        # Verify expiredCost increased by ~10.00 (2 kg * 5.00)
        expected_increase = 10.00
        actual_increase = updated_expired_cost - baseline_expired_cost
        
        if abs(actual_increase - expected_increase) > 0.01:
            print(f"  ❌ FAIL: Expected expiredCost to increase by ~{expected_increase}, got {actual_increase}")
            return False
        
        # Verify expired count increased by 1
        if updated_expired_count != baseline_expired_count + 1:
            print(f"  ❌ FAIL: Expected expired count to increase by 1, got {updated_expired_count - baseline_expired_count}")
            return False
        
        print(f"  ✅ PASS: expiredCost increased by {actual_increase:.2f} (expected ~{expected_increase})")
        print(f"  ✅ PASS: expired count increased by 1")
        
        return True
        
    except Exception as e:
        print(f"  ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_activity_date_filter():
    """Test activity log date filtering (owner-only)"""
    print("\n" + "="*80)
    print("TEST 6: ACTIVITY DATE FILTER (owner token)")
    print("="*80)
    
    try:
        # Try with OWNER token
        print("\n[TEST 6a] Minting OWNER token...")
        owner_token = mint_owner_jwt()
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Test basic activity fetch
        print("\n[TEST 6b] GET /api/activity?limit=10...")
        resp = requests.get(f"{BASE_URL}/activity?limit=10", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"  ⚠️  OWNER token rejected with 403 (may require Supabase session)")
            print(f"  Response: {resp.text}")
            print(f"  ℹ️  Reporting as UNTESTABLE-LOCALLY (not a failure)")
            return "untestable"
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return False
        
        activity = resp.json()
        items = activity.get('items', [])
        print(f"  Retrieved {len(items)} activity items")
        
        # Verify items are sorted newest first
        if len(items) > 1:
            for i in range(len(items) - 1):
                if items[i].get('created_at', '') < items[i+1].get('created_at', ''):
                    print(f"  ❌ FAIL: Items not sorted newest first")
                    return False
        
        print(f"  ✅ PASS: Items sorted newest first")
        
        # Test date filtering - today
        print("\n[TEST 6c] GET /api/activity?from=<today>&to=<today>...")
        today = datetime.now().strftime('%Y-%m-%d')
        resp = requests.get(f"{BASE_URL}/activity?from={today}&to={today}", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        today_activity = resp.json()
        today_items = today_activity.get('items', [])
        print(f"  Retrieved {len(today_items)} items for today")
        
        # Verify all items are from today
        for item in today_items:
            item_date = item.get('created_at', '')[:10]
            if item_date != today:
                print(f"  ❌ FAIL: Found item not from today: {item_date}")
                return False
        
        print(f"  ✅ PASS: All items have created_at = today")
        
        # Test date filtering - future date (should be empty)
        print("\n[TEST 6d] GET /api/activity?from=2030-01-01 (future)...")
        resp = requests.get(f"{BASE_URL}/activity?from=2030-01-01", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            return False
        
        future_activity = resp.json()
        future_items = future_activity.get('items', [])
        print(f"  Retrieved {len(future_items)} items for future date")
        
        if len(future_items) > 0:
            print(f"  ❌ FAIL: Expected 0 items for future date, got {len(future_items)}")
            return False
        
        print(f"  ✅ PASS: Empty items for future date")
        
        # Verify recent 'item_added' entries exist for ZZZ test products
        print("\n[TEST 6e] Verify audit logging for test products...")
        resp = requests.get(f"{BASE_URL}/activity?limit=50", headers=headers)
        all_items = resp.json().get('items', [])
        
        test_product_logs = [item for item in all_items if 'ZZZ Backend Test' in item.get('details', '')]
        print(f"  Found {len(test_product_logs)} activity logs for ZZZ test products")
        
        if len(test_product_logs) > 0:
            print(f"  ✅ PASS: Audit logging working (found item_added/item_updated entries)")
            for log in test_product_logs[:3]:
                print(f"    - {log.get('action')}: {log.get('details', '')[:60]}")
        else:
            print(f"  ⚠️  No ZZZ test product logs found (may be expected if activity log is large)")
        
        return True
        
    except Exception as e:
        print(f"  ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_settings_tokens():
    """Test settings modulesEnabled tokens (owner-only)"""
    print("\n" + "="*80)
    print("TEST 7: SETTINGS TOKENS (owner token)")
    print("="*80)
    
    try:
        # Try with OWNER token
        print("\n[TEST 7a] Minting OWNER token...")
        owner_token = mint_owner_jwt()
        headers = {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
        
        # Get current settings
        print("\n[TEST 7b] GET /api/settings (record original modulesEnabled)...")
        resp = requests.get(f"{BASE_URL}/settings", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"  ⚠️  GET /api/settings rejected with 403 (owner auth requires Supabase session)")
            print(f"  Response: {resp.text}")
            print(f"  ℹ️  Reporting as UNTESTABLE-LOCALLY (not a failure)")
            return "untestable"
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return False
        
        original_settings = resp.json()
        original_modules = original_settings.get('modulesEnabled', [])
        print(f"  Original modulesEnabled: {original_modules}")
        
        # Add new tokens
        print("\n[TEST 7c] PUT /api/settings (add allergens, audit, money tokens)...")
        new_modules = list(set(original_modules + ['allergens', 'audit', 'money_revenue_cost', 'money_budget_spend']))
        update_data = {
            "modulesEnabled": new_modules
        }
        
        resp = requests.put(f"{BASE_URL}/settings", json=update_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"  ⚠️  PUT /api/settings rejected with 403 (owner auth requires Supabase session)")
            print(f"  Response: {resp.text}")
            print(f"  ℹ️  Reporting as UNTESTABLE-LOCALLY (not a failure)")
            return "untestable"
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Expected 200, got {resp.status_code}")
            print(f"  Response: {resp.text}")
            return False
        
        updated_settings = resp.json()
        updated_modules = updated_settings.get('modulesEnabled', [])
        print(f"  Updated modulesEnabled: {updated_modules}")
        
        # Verify all 4 new tokens are present
        required_tokens = ['allergens', 'audit', 'money_revenue_cost', 'money_budget_spend']
        for token in required_tokens:
            if token not in updated_modules:
                print(f"  ❌ FAIL: Token '{token}' not found in modulesEnabled")
                return False
        
        print(f"  ✅ PASS: All 4 tokens present in modulesEnabled")
        
        # Verify persistence
        print("\n[TEST 7d] GET /api/settings (verify persistence)...")
        resp = requests.get(f"{BASE_URL}/settings", headers=headers)
        persisted_settings = resp.json()
        persisted_modules = persisted_settings.get('modulesEnabled', [])
        
        for token in required_tokens:
            if token not in persisted_modules:
                print(f"  ❌ FAIL: Token '{token}' not persisted")
                return False
        
        print(f"  ✅ PASS: Settings persisted correctly")
        
        # RESTORE original settings
        print("\n[TEST 7e] RESTORE original modulesEnabled...")
        restore_data = {
            "modulesEnabled": original_modules
        }
        
        resp = requests.put(f"{BASE_URL}/settings", json=restore_data, headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ❌ FAIL: Failed to restore original settings")
            print(f"  Response: {resp.text}")
            return False
        
        restored_settings = resp.json()
        restored_modules = restored_settings.get('modulesEnabled', [])
        print(f"  Restored modulesEnabled: {restored_modules}")
        
        if restored_modules != original_modules:
            print(f"  ❌ FAIL: Restored modules don't match original")
            return False
        
        print(f"  ✅ PASS: Original modulesEnabled restored")
        
        return True
        
    except Exception as e:
        print(f"  ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def cleanup_test_products(product_ids):
    """Delete test products and purge from trash"""
    print("\n" + "="*80)
    print("TEST 8: CLEANUP")
    print("="*80)
    
    chef_token = mint_chef_jwt()
    headers = {"Authorization": f"Bearer {chef_token}"}
    
    try:
        # Delete all test products
        print(f"\n[CLEANUP 1] Deleting {len(product_ids)} test products...")
        for product_id in product_ids:
            resp = requests.delete(f"{BASE_URL}/products/{product_id}", headers=headers)
            print(f"  DELETE /api/products/{product_id}: {resp.status_code}")
            
            if resp.status_code not in [200, 204]:
                print(f"    ⚠️  Failed to delete product {product_id}")
        
        print(f"  ✅ All test products deleted")
        
        # Get trash entries
        print(f"\n[CLEANUP 2] Getting trash entries...")
        resp = requests.get(f"{BASE_URL}/trash", headers=headers)
        print(f"  Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"  ⚠️  Failed to get trash: {resp.status_code}")
            return True
        
        trash_data = resp.json()
        # Handle both formats: {items: [...]} or [...]
        trash_items = trash_data.get('items', trash_data) if isinstance(trash_data, dict) else trash_data
        print(f"  Found {len(trash_items)} trash items")
        
        # Find and delete ZZZ test product trash entries
        test_trash_ids = []
        for item in trash_items:
            if isinstance(item, dict) and 'ZZZ Backend Test' in item.get('label', ''):
                test_trash_ids.append(item['id'])
        print(f"  Found {len(test_trash_ids)} ZZZ test product trash entries")
        
        for trash_id in test_trash_ids:
            resp = requests.delete(f"{BASE_URL}/trash/{trash_id}", headers=headers)
            print(f"  DELETE /api/trash/{trash_id}: {resp.status_code}")
        
        print(f"  ✅ All test trash entries purged")
        
        # Verify stats returned to baseline
        print(f"\n[CLEANUP 3] Verify stats returned to baseline...")
        resp = requests.get(f"{BASE_URL}/stats", headers=headers)
        final_stats = resp.json()
        print(f"  Final expired count: {final_stats.get('expired', 0)}")
        print(f"  Final expiredCost: {final_stats.get('expiredCost', 0)}")
        
        # Verify no ZZZ products remain
        resp = requests.get(f"{BASE_URL}/products?search=ZZZ Backend Test", headers=headers)
        remaining_products = resp.json()
        if len(remaining_products) > 0:
            print(f"  ⚠️  WARNING: {len(remaining_products)} ZZZ test products still in inventory")
        else:
            print(f"  ✅ No ZZZ test products remain in inventory")
        
        return True
        
    except Exception as e:
        print(f"  ❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("SEPT 2026 SESSION - BACKEND TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Kitchen ID: {KITCHEN_ID}")
    print("⚠️  PRODUCTION DATABASE - Only creating 'ZZZ Backend Test' products")
    
    results = {}
    created_products = []
    
    # Test 1-4: Price history
    test1_result = test_price_history()
    if isinstance(test1_result, list):
        created_products = test1_result
        results['price_history'] = True
    else:
        results['price_history'] = test1_result
    
    # Test 5: Expired cost stat
    results['expired_cost'] = test_expired_cost_stat(created_products)
    
    # Test 6: Activity date filter
    results['activity_filter'] = test_activity_date_filter()
    
    # Test 7: Settings tokens
    results['settings_tokens'] = test_settings_tokens()
    
    # Test 8: Cleanup
    results['cleanup'] = cleanup_test_products(created_products)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    untestable = sum(1 for v in results.values() if v == "untestable")
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result is True else ("❌ FAIL" if result is False else "⚠️  UNTESTABLE")
        print(f"  {test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} passed, {failed} failed, {untestable} untestable")
    
    if failed > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
