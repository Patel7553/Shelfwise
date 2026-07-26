#!/usr/bin/env python3
"""
PHASE 7 Backend Testing — Order Lifecycle Notifications + Kitchen Edit/Cancel + Sample Products
Tests the NEW endpoints and notification safety in ShelfWise.
"""

import requests
import json

BASE_URL = "http://localhost:3000"
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoidGVzdC1raXRjaGVuIiwicm9sZSI6ImNoZWYiLCJpYXQiOjE3ODUxMDQ3MzksImV4cCI6MTc4NTE0NzkzOX0.TLVa6PmcxJpxzHYKvj6J-Mzriiv2DCmST6BTpOTzpUI"

def test_kitchen_order_edit():
    """TEST 1: NEW KITCHEN ORDER EDIT — wiring"""
    print("\n" + "="*80)
    print("TEST 1: NEW KITCHEN ORDER EDIT — PUT /api/kitchen/orders/:id")
    print("="*80)
    
    # Test 1a: No auth → 401
    try:
        print("\nTest 1a: PUT /api/kitchen/orders/some-uuid with NO auth → expect 401")
        r = requests.put(f"{BASE_URL}/api/kitchen/orders/some-uuid", json={"notes": "x"}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            print("  ✅ PASS: Got 401 as expected")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False
    
    # Test 1b: Chef JWT + body → 500 supabase-env (NOT 404/403)
    try:
        print("\nTest 1b: PUT /api/kitchen/orders/some-uuid with chef JWT + {\"notes\":\"x\"} → expect 500 supabase-env (NOT 404/403)")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.put(f"{BASE_URL}/api/kitchen/orders/some-uuid", json={"notes": "x"}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:300]}")
        
        if r.status_code == 404:
            print("  ❌ FAIL: Got 404 - endpoint NOT wired correctly")
            return False
        elif r.status_code == 403:
            print("  ❌ FAIL: Got 403 - auth gate issue")
            return False
        elif r.status_code == 500:
            resp_text = r.text.lower()
            if "supabase" in resp_text or "env" in resp_text:
                print("  ✅ PASS: Got 500 with supabase/env error (correctly wired, reached DB step)")
            else:
                print(f"  ⚠️  WARNING: Got 500 but error message doesn't mention supabase: {r.text[:200]}")
            return True
        else:
            print(f"  ⚠️  Got unexpected status {r.status_code}, but NOT 404/403 (endpoint exists)")
            return True
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_kitchen_order_cancel():
    """TEST 2: NEW KITCHEN ORDER CANCEL — wiring"""
    print("\n" + "="*80)
    print("TEST 2: NEW KITCHEN ORDER CANCEL — DELETE /api/kitchen/orders/:id")
    print("="*80)
    
    # Test 2a: No auth → 401
    try:
        print("\nTest 2a: DELETE /api/kitchen/orders/some-uuid with NO auth → expect 401")
        r = requests.delete(f"{BASE_URL}/api/kitchen/orders/some-uuid", timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            print("  ✅ PASS: Got 401 as expected")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False
    
    # Test 2b: Chef JWT → 500 supabase-env (NOT 404/403)
    try:
        print("\nTest 2b: DELETE /api/kitchen/orders/some-uuid with chef JWT → expect 500 supabase-env (NOT 404/403)")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.delete(f"{BASE_URL}/api/kitchen/orders/some-uuid", headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:300]}")
        
        if r.status_code == 404:
            print("  ❌ FAIL: Got 404 - endpoint NOT wired correctly")
            return False
        elif r.status_code == 403:
            print("  ❌ FAIL: Got 403 - auth gate issue")
            return False
        elif r.status_code == 500:
            resp_text = r.text.lower()
            if "supabase" in resp_text or "env" in resp_text:
                print("  ✅ PASS: Got 500 with supabase/env error (correctly wired, reached DB step)")
            else:
                print(f"  ⚠️  WARNING: Got 500 but error message doesn't mention supabase: {r.text[:200]}")
            return True
        else:
            print(f"  ⚠️  Got unexpected status {r.status_code}, but NOT 404/403 (endpoint exists)")
            return True
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_sample_products():
    """TEST 3: NEW SAMPLE PRODUCTS — wiring"""
    print("\n" + "="*80)
    print("TEST 3: NEW SAMPLE PRODUCTS — POST /api/supplier/products/sample")
    print("="*80)
    
    # Test 3a: No auth → 401
    try:
        print("\nTest 3a: POST /api/supplier/products/sample with NO auth → expect 401")
        r = requests.post(f"{BASE_URL}/api/supplier/products/sample", json={}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            print("  ✅ PASS: Got 401 as expected")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False
    
    # Test 3b: Chef JWT → 403 "Supplier login required" (NOT 404)
    try:
        print("\nTest 3b: POST /api/supplier/products/sample with chef JWT → expect 403 \"Supplier login required\" (NOT 404)")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.post(f"{BASE_URL}/api/supplier/products/sample", json={}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:300]}")
        
        if r.status_code == 404:
            print("  ❌ FAIL: Got 404 - endpoint NOT wired correctly")
            return False
        elif r.status_code == 403:
            resp_text = r.text.lower()
            if "supplier" in resp_text:
                print("  ✅ PASS: Got 403 with 'Supplier login required' (correctly wired)")
            else:
                print(f"  ⚠️  WARNING: Got 403 but message doesn't mention supplier: {r.text[:200]}")
            return True
        else:
            print(f"  ❌ FAIL: Expected 403, got {r.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_notification_safety():
    """TEST 4: NOTIFICATION SAFETY — notifications must never break order ops"""
    print("\n" + "="*80)
    print("TEST 4: NOTIFICATION SAFETY — POST /api/kitchen/orders")
    print("="*80)
    
    try:
        print("\nTest 4: POST /api/kitchen/orders with chef JWT + minimal body → expect 500 supabase-env (NOT a crash)")
        print("  This tests that notification code (notifyOrderEvent) doesn't break the order operation")
        print("  Even with RESEND_API_KEY missing, the endpoint must return JSON (not a stack trace)")
        
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        body = {
            "supplierId": "test-supplier-id",
            "items": [{"productId": "test-product-id", "quantity": 1}]
        }
        r = requests.post(f"{BASE_URL}/api/kitchen/orders", json=body, headers=headers, timeout=15)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:500]}")
        
        # Check response is JSON (not a stack trace)
        try:
            resp_json = r.json()
            print("  ✅ Response is valid JSON (not a stack trace)")
        except:
            print("  ❌ FAIL: Response is NOT valid JSON - might be a stack trace")
            return False
        
        # Should get 500 supabase-env error (same as before notification code was added)
        if r.status_code == 500:
            resp_text = r.text.lower()
            if "supabase" in resp_text or "env" in resp_text:
                print("  ✅ PASS: Got 500 with supabase/env error (same as before, notification code didn't break it)")
                return True
            else:
                print(f"  ⚠️  WARNING: Got 500 but error message doesn't mention supabase: {r.text[:300]}")
                # Check if it's a notification-related error
                if "resend" in resp_text or "notification" in resp_text or "email" in resp_text:
                    print("  ❌ FAIL: Error is notification-related - notification code is breaking the order operation!")
                    return False
                return True
        elif r.status_code == 400:
            # Might be validation error (e.g., "supplierId required")
            print(f"  ⚠️  Got 400 validation error: {r.text[:200]}")
            print("  This is acceptable - validation happens before DB/notification")
            return True
        else:
            print(f"  ⚠️  Got unexpected status {r.status_code}")
            return True
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_regressions():
    """TEST 5: REGRESSION — ensure existing endpoints still work"""
    print("\n" + "="*80)
    print("TEST 5: REGRESSION TESTS")
    print("="*80)
    
    tests_passed = 0
    tests_total = 10
    
    # Test 5a: PUT /api/supplier/orders/:id with chef JWT → 403 (supplier gate intact)
    try:
        print("\nTest 5a: PUT /api/supplier/orders/some-uuid {\"status\":\"confirmed\"} with chef JWT → expect 403")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.put(f"{BASE_URL}/api/supplier/orders/some-uuid", json={"status": "confirmed"}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 403:
            print("  ✅ PASS: Got 403 (supplier gate intact)")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 403, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5b: PUT /api/supplier/orders/:id with NO auth → 401
    try:
        print("\nTest 5b: PUT /api/supplier/orders/some-uuid {\"status\":\"confirmed\"} with NO auth → expect 401")
        r = requests.put(f"{BASE_URL}/api/supplier/orders/some-uuid", json={"status": "confirmed"}, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 401:
            print("  ✅ PASS: Got 401")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5c: POST /api/supplier/products with chef JWT → 403
    try:
        print("\nTest 5c: POST /api/supplier/products {\"name\":\"T\"} with chef JWT → expect 403")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.post(f"{BASE_URL}/api/supplier/products", json={"name": "T"}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 403:
            print("  ✅ PASS: Got 403")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 403, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5d: POST /api/kitchen/orders with empty body → 400 "supplierId required"
    try:
        print("\nTest 5d: POST /api/kitchen/orders {} with chef JWT → expect 400 \"supplierId required\"")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.post(f"{BASE_URL}/api/kitchen/orders", json={}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 400 and "supplierid" in r.text.lower():
            print("  ✅ PASS: Got 400 with 'supplierId required'")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 400 with 'supplierId required', got {r.status_code}: {r.text[:100]}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5e: POST /api/kitchen/suppliers/connect with empty body → 400
    try:
        print("\nTest 5e: POST /api/kitchen/suppliers/connect {} with chef JWT → expect 400")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={}, headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 400:
            print("  ✅ PASS: Got 400")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 400, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5f: GET /api/kitchen/orders with chef JWT → 500 supabase-env (not 404)
    try:
        print("\nTest 5f: GET /api/kitchen/orders with chef JWT → expect 500 supabase-env (not 404)")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.get(f"{BASE_URL}/api/kitchen/orders", headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 404:
            print("  ❌ FAIL: Got 404 - endpoint broken")
        elif r.status_code == 500:
            print("  ✅ PASS: Got 500 (not 404)")
            tests_passed += 1
        else:
            print(f"  ⚠️  Got {r.status_code} (not 404, endpoint exists)")
            tests_passed += 1
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5g: GET /api/supplier/invites with chef JWT → 403
    try:
        print("\nTest 5g: GET /api/supplier/invites with chef JWT → expect 403")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.get(f"{BASE_URL}/api/supplier/invites", headers=headers, timeout=10)
        print(f"  Status: {r.status_code}")
        if r.status_code == 403:
            print("  ✅ PASS: Got 403")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 403, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5h: POST /api/recipe/web-search with chef JWT → 200 with recipes (LLM intact)
    try:
        print("\nTest 5h: POST /api/recipe/web-search with chef JWT {\"query\":\"pasta\",\"servings\":2} → expect 200 with recipes")
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        r = requests.post(f"{BASE_URL}/api/recipe/web-search", json={"query": "pasta", "servings": 2}, headers=headers, timeout=30)
        print(f"  Status: {r.status_code}")
        if r.status_code == 200:
            try:
                data = r.json()
                if "recipes" in data and len(data["recipes"]) > 0:
                    print(f"  ✅ PASS: Got 200 with {len(data['recipes'])} recipes (LLM intact)")
                    tests_passed += 1
                else:
                    print("  ❌ FAIL: Got 200 but no recipes in response")
            except:
                print("  ❌ FAIL: Got 200 but response is not valid JSON")
        else:
            print(f"  ❌ FAIL: Expected 200, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5i: GET /api/version → 200 + Cache-Control: no-store header
    try:
        print("\nTest 5i: GET /api/version → expect 200 + Cache-Control: no-store header")
        r = requests.get(f"{BASE_URL}/api/version", timeout=10)
        print(f"  Status: {r.status_code}")
        cache_control = r.headers.get("Cache-Control", "")
        print(f"  Cache-Control: {cache_control}")
        if r.status_code == 200 and "no-store" in cache_control:
            print("  ✅ PASS: Got 200 with Cache-Control: no-store")
            tests_passed += 1
        else:
            print(f"  ❌ FAIL: Expected 200 with Cache-Control: no-store")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 5j: GET /api/auth/me with NO auth → 401 {"authed":false}
    try:
        print("\nTest 5j: GET /api/auth/me with NO auth → expect 401 {\"authed\":false}")
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            try:
                data = r.json()
                if data.get("authed") == False:
                    print("  ✅ PASS: Got 401 with {\"authed\":false}")
                    tests_passed += 1
                else:
                    print("  ❌ FAIL: Got 401 but response doesn't have {\"authed\":false}")
            except:
                print("  ❌ FAIL: Got 401 but response is not valid JSON")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    print(f"\n{'='*80}")
    print(f"REGRESSION TESTS: {tests_passed}/{tests_total} passed")
    print(f"{'='*80}")
    
    return tests_passed == tests_total

def main():
    print("\n" + "="*80)
    print("PHASE 7 BACKEND TESTING — Order Lifecycle Notifications + Kitchen Edit/Cancel + Sample Products")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Chef JWT: {CHEF_JWT[:50]}...")
    
    results = []
    
    # Run all tests
    results.append(("Kitchen Order Edit", test_kitchen_order_edit()))
    results.append(("Kitchen Order Cancel", test_kitchen_order_cancel()))
    results.append(("Sample Products", test_sample_products()))
    results.append(("Notification Safety", test_notification_safety()))
    results.append(("Regressions", test_regressions()))
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} test groups passed")
    print(f"{'='*80}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! PHASE 7 backend is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test group(s) failed. Review the output above.")
        return 1

if __name__ == "__main__":
    exit(main())
