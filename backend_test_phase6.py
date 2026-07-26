#!/usr/bin/env python3
"""
PHASE 6 Backend Testing — Supplier-generated connection codes + order-summary (invoice removal)
Tests the NEW supplier invite routes + connect endpoint with codes + regression checks.

LOCAL ENV: Supabase NOT configured — DB ops 500 "Supabase env vars missing" (EXPECTED = correctly wired; only 404s/JS crashes are failures).
"""

import requests
import sys

BASE_URL = "http://localhost:3000"
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoidGVzdC1raXRjaGVuIiwicm9sZSI6ImNoZWYiLCJpYXQiOjE3ODUwOTkzNTIsImV4cCI6MTc4NTE0MjU1Mn0.5E_LwzgBKY8VmmgzWPLgDejl1stXzunJ-NMI3L0u-4A"

def test_supplier_invite_routes():
    """TEST 1: NEW SUPPLIER INVITE ROUTES — auth wiring (no auth → 401; chef JWT → 403 "Supplier login required (email & password)", NOT 404)"""
    print("\n" + "="*80)
    print("TEST 1: NEW SUPPLIER INVITE ROUTES — Auth Wiring")
    print("="*80)
    
    routes = [
        ("GET", "/api/supplier/invites", None),
        ("POST", "/api/supplier/invites", {"clientCode": "ACC-1042", "clientLabel": "The Green Kitchen"}),
        ("DELETE", "/api/supplier/invites/11111111-1111-1111-1111-111111111111", None),
        ("PUT", "/api/supplier/clients/11111111-1111-1111-1111-111111111111", {"clientCode": "ACC-9"}),
    ]
    
    passed = 0
    total = len(routes) * 2  # Each route tested twice (no auth + chef JWT)
    
    for method, path, body in routes:
        # Test 1a: No auth → 401
        try:
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", timeout=10)
            elif method == "POST":
                r = requests.post(f"{BASE_URL}{path}", json=body, timeout=10)
            elif method == "DELETE":
                r = requests.delete(f"{BASE_URL}{path}", timeout=10)
            elif method == "PUT":
                r = requests.put(f"{BASE_URL}{path}", json=body, timeout=10)
            
            if r.status_code == 401:
                print(f"✅ {method} {path} with NO auth → 401 (correct)")
                passed += 1
            else:
                print(f"❌ {method} {path} with NO auth → {r.status_code} (expected 401)")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ {method} {path} with NO auth → ERROR: {e}")
        
        # Test 1b: Chef JWT → 403 "Supplier login required (email & password)" (NOT 404)
        try:
            headers = {"Authorization": f"Bearer {CHEF_JWT}"}
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=10)
            elif method == "POST":
                r = requests.post(f"{BASE_URL}{path}", json=body, headers=headers, timeout=10)
            elif method == "DELETE":
                r = requests.delete(f"{BASE_URL}{path}", headers=headers, timeout=10)
            elif method == "PUT":
                r = requests.put(f"{BASE_URL}{path}", json=body, headers=headers, timeout=10)
            
            if r.status_code == 403:
                data = r.json()
                if "Supplier login required" in data.get("error", ""):
                    print(f"✅ {method} {path} with chef JWT → 403 'Supplier login required' (correct, NOT 404)")
                    passed += 1
                else:
                    print(f"❌ {method} {path} with chef JWT → 403 but wrong message: {data.get('error', '')}")
            else:
                print(f"❌ {method} {path} with chef JWT → {r.status_code} (expected 403)")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ {method} {path} with chef JWT → ERROR: {e}")
    
    print(f"\n✅ TEST 1 PASSED: {passed}/{total}")
    return passed, total


def test_connect_endpoint_with_codes():
    """TEST 2: CONNECT ENDPOINT with codes (chef JWT) — should return 500 supabase-env error (correctly wired, NOT 404/400)"""
    print("\n" + "="*80)
    print("TEST 2: CONNECT ENDPOINT with codes (chef JWT)")
    print("="*80)
    
    passed = 0
    total = 4
    
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    
    # Test 2a: POST /api/kitchen/suppliers/connect {"code":"CON-8XK2FQ"} → 500 supabase-env error
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={"code": "CON-8XK2FQ"}, headers=headers, timeout=10)
        if r.status_code == 500:
            data = r.json()
            if "Supabase" in data.get("error", "") or "supabase" in data.get("error", "").lower():
                print(f"✅ POST /api/kitchen/suppliers/connect {{\"code\":\"CON-8XK2FQ\"}} → 500 supabase-env error (correctly wired, NOT 404)")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"CON-8XK2FQ\"}} → 500 but wrong error: {data.get('error', '')}")
        else:
            print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"CON-8XK2FQ\"}} → {r.status_code} (expected 500)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"CON-8XK2FQ\"}} → ERROR: {e}")
    
    # Test 2b: POST /api/kitchen/suppliers/connect {"code":"SUP-ABC123"} → 500 supabase-env error
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={"code": "SUP-ABC123"}, headers=headers, timeout=10)
        if r.status_code == 500:
            data = r.json()
            if "Supabase" in data.get("error", "") or "supabase" in data.get("error", "").lower():
                print(f"✅ POST /api/kitchen/suppliers/connect {{\"code\":\"SUP-ABC123\"}} → 500 supabase-env error (correctly wired, NOT 404)")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"SUP-ABC123\"}} → 500 but wrong error: {data.get('error', '')}")
        else:
            print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"SUP-ABC123\"}} → {r.status_code} (expected 500)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/suppliers/connect {{\"code\":\"SUP-ABC123\"}} → ERROR: {e}")
    
    # Test 2c: POST /api/kitchen/suppliers/connect {} → 400 "Provide supplierId, code or email"
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "Provide supplierId, code or email" in data.get("error", ""):
                print(f"✅ POST /api/kitchen/suppliers/connect {{}} → 400 'Provide supplierId, code or email' (validation works)")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/suppliers/connect {{}} → 400 but wrong message: {data.get('error', '')}")
        else:
            print(f"❌ POST /api/kitchen/suppliers/connect {{}} → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/suppliers/connect {{}} → ERROR: {e}")
    
    # Test 2d: no auth → 401
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={"code": "CON-8XK2FQ"}, timeout=10)
        if r.status_code == 401:
            print(f"✅ POST /api/kitchen/suppliers/connect with NO auth → 401 (correct)")
            passed += 1
        else:
            print(f"❌ POST /api/kitchen/suppliers/connect with NO auth → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/suppliers/connect with NO auth → ERROR: {e}")
    
    print(f"\n✅ TEST 2 PASSED: {passed}/{total}")
    return passed, total


def test_regression():
    """TEST 3: REGRESSION — nothing broken by the edits"""
    print("\n" + "="*80)
    print("TEST 3: REGRESSION — Nothing broken by the edits")
    print("="*80)
    
    passed = 0
    total = 11
    
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    
    # Test 3a: PUT /api/supplier/orders/11111111-1111-1111-1111-111111111111 {"status":"banana"} with chef JWT → 403
    try:
        r = requests.put(f"{BASE_URL}/api/supplier/orders/11111111-1111-1111-1111-111111111111", json={"status": "banana"}, headers=headers, timeout=10)
        if r.status_code == 403:
            data = r.json()
            if "Supplier login required" in data.get("error", ""):
                print(f"✅ PUT /api/supplier/orders/uuid with chef JWT → 403 (supplier gate fires before validation)")
                passed += 1
            else:
                print(f"❌ PUT /api/supplier/orders/uuid with chef JWT → 403 but wrong message: {data.get('error', '')}")
        else:
            print(f"❌ PUT /api/supplier/orders/uuid with chef JWT → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ PUT /api/supplier/orders/uuid with chef JWT → ERROR: {e}")
    
    # Test 3b: PUT /api/supplier/orders/x no auth → 401
    try:
        r = requests.put(f"{BASE_URL}/api/supplier/orders/x", json={"status": "pending"}, timeout=10)
        if r.status_code == 401:
            print(f"✅ PUT /api/supplier/orders/x with NO auth → 401 (correct)")
            passed += 1
        else:
            print(f"❌ PUT /api/supplier/orders/x with NO auth → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ PUT /api/supplier/orders/x with NO auth → ERROR: {e}")
    
    # Test 3c: GET /api/supplier/clients chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/clients", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/clients with chef JWT → 403 (correct)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/clients with chef JWT → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/clients with chef JWT → ERROR: {e}")
    
    # Test 3d: GET /api/supplier/profile chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/profile", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/profile with chef JWT → 403 (correct)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/profile with chef JWT → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/profile with chef JWT → ERROR: {e}")
    
    # Test 3e: GET /api/supplier/orders chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/orders", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/orders with chef JWT → 403 (correct)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/orders with chef JWT → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/orders with chef JWT → ERROR: {e}")
    
    # Test 3f: GET /api/kitchen/suppliers chef JWT → 500 supabase error (NOT 403/404)
    try:
        r = requests.get(f"{BASE_URL}/api/kitchen/suppliers", headers=headers, timeout=10)
        if r.status_code == 500:
            data = r.json()
            if "Supabase" in data.get("error", "") or "supabase" in data.get("error", "").lower():
                print(f"✅ GET /api/kitchen/suppliers with chef JWT → 500 supabase error (NOT 403/404)")
                passed += 1
            else:
                print(f"❌ GET /api/kitchen/suppliers with chef JWT → 500 but wrong error: {data.get('error', '')}")
        else:
            print(f"❌ GET /api/kitchen/suppliers with chef JWT → {r.status_code} (expected 500)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/kitchen/suppliers with chef JWT → ERROR: {e}")
    
    # Test 3g: GET /api/kitchen/suppliers/search?q=a chef JWT → 200 []
    try:
        r = requests.get(f"{BASE_URL}/api/kitchen/suppliers/search?q=a", headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) == 0:
                print(f"✅ GET /api/kitchen/suppliers/search?q=a with chef JWT → 200 [] (query under 2 chars returns empty)")
                passed += 1
            else:
                print(f"❌ GET /api/kitchen/suppliers/search?q=a with chef JWT → 200 but not empty array: {data}")
        else:
            print(f"❌ GET /api/kitchen/suppliers/search?q=a with chef JWT → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/kitchen/suppliers/search?q=a with chef JWT → ERROR: {e}")
    
    # Test 3h: POST /api/kitchen/orders {} chef JWT → 400 "supplierId required"
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/orders", json={}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "supplierId required" in data.get("error", ""):
                print(f"✅ POST /api/kitchen/orders {{}} with chef JWT → 400 'supplierId required' (validation works)")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/orders {{}} with chef JWT → 400 but wrong message: {data.get('error', '')}")
        else:
            print(f"❌ POST /api/kitchen/orders {{}} with chef JWT → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/orders {{}} with chef JWT → ERROR: {e}")
    
    # Test 3i: DELETE /api/supplier/products/some-uuid no auth → 401
    try:
        r = requests.delete(f"{BASE_URL}/api/supplier/products/some-uuid", timeout=10)
        if r.status_code == 401:
            print(f"✅ DELETE /api/supplier/products/some-uuid with NO auth → 401 (correct)")
            passed += 1
        else:
            print(f"❌ DELETE /api/supplier/products/some-uuid with NO auth → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ DELETE /api/supplier/products/some-uuid with NO auth → ERROR: {e}")
    
    # Test 3j: POST /api/recipe/web-search chef JWT {"query":"soup","servings":2} → 200 with recipes (LLM intact)
    try:
        r = requests.post(f"{BASE_URL}/api/recipe/web-search", json={"query": "soup", "servings": 2}, headers=headers, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if "recipes" in data and isinstance(data["recipes"], list) and len(data["recipes"]) > 0:
                print(f"✅ POST /api/recipe/web-search with chef JWT → 200 with {len(data['recipes'])} recipes (LLM intact)")
                passed += 1
            else:
                print(f"❌ POST /api/recipe/web-search with chef JWT → 200 but no recipes: {data}")
        else:
            print(f"❌ POST /api/recipe/web-search with chef JWT → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/recipe/web-search with chef JWT → ERROR: {e}")
    
    # Test 3k: GET /api/version → 200 + Cache-Control no-store header
    try:
        r = requests.get(f"{BASE_URL}/api/version", timeout=10)
        if r.status_code == 200:
            cache_control = r.headers.get("Cache-Control", "")
            if "no-store" in cache_control:
                print(f"✅ GET /api/version → 200 + Cache-Control: {cache_control} (header present)")
                passed += 1
            else:
                print(f"❌ GET /api/version → 200 but Cache-Control header missing or wrong: {cache_control}")
        else:
            print(f"❌ GET /api/version → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/version → ERROR: {e}")
    
    print(f"\n✅ TEST 3 PASSED: {passed}/{total}")
    return passed, total


def test_code_sanity():
    """TEST 4: CODE SANITY — confirm PUT supplier/orders 'fulfilled' branch no longer assigns invoice_number, and kitchen/orders items include sku field"""
    print("\n" + "="*80)
    print("TEST 4: CODE SANITY — Read /app/app/api/[[...path]]/route.js")
    print("="*80)
    
    passed = 0
    total = 2
    
    # Test 4a: Confirm PUT supplier/orders 'fulfilled' branch no longer assigns invoice_number
    try:
        with open("/app/app/api/[[...path]]/route.js", "r") as f:
            content = f.read()
            
            # Find the PUT supplier/orders/:id section (around line 4607-4622)
            if "PUT /api/supplier/orders/:id" in content:
                # Check that the fulfilled branch does NOT assign invoice_number
                # Look for the section between line 4607-4622
                lines = content.split("\n")
                fulfilled_section = "\n".join(lines[4606:4622])  # Lines 4607-4622 (0-indexed)
                
                if "invoice_number" not in fulfilled_section.lower():
                    print(f"✅ PUT supplier/orders 'fulfilled' branch does NOT assign invoice_number (correct)")
                    passed += 1
                else:
                    print(f"❌ PUT supplier/orders 'fulfilled' branch still assigns invoice_number")
                    print(f"   Section: {fulfilled_section[:300]}")
            else:
                print(f"❌ Could not find PUT /api/supplier/orders/:id section in route.js")
    except Exception as e:
        print(f"❌ Error reading route.js: {e}")
    
    # Test 4b: Confirm kitchen/orders items include sku field
    try:
        with open("/app/app/api/[[...path]]/route.js", "r") as f:
            content = f.read()
            
            # Find the POST kitchen/orders section (around line 3849-3916)
            if "POST /api/kitchen/orders" in content or "kitchen/orders" in content:
                # Look for the items construction around line 3870
                lines = content.split("\n")
                orders_section = "\n".join(lines[3848:3916])  # Lines 3849-3916 (0-indexed)
                
                if "sku:" in orders_section or "sku :" in orders_section:
                    print(f"✅ kitchen/orders items include sku field (correct)")
                    passed += 1
                else:
                    print(f"❌ kitchen/orders items do NOT include sku field")
                    print(f"   Section: {orders_section[:300]}")
            else:
                print(f"❌ Could not find POST /api/kitchen/orders section in route.js")
    except Exception as e:
        print(f"❌ Error reading route.js: {e}")
    
    print(f"\n✅ TEST 4 PASSED: {passed}/{total}")
    return passed, total


def main():
    print("\n" + "="*80)
    print("PHASE 6 BACKEND TESTING — Supplier-generated connection codes + order-summary")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Chef JWT: {CHEF_JWT[:50]}...")
    print("="*80)
    
    results = []
    
    # Run all tests
    results.append(test_supplier_invite_routes())
    results.append(test_connect_endpoint_with_codes())
    results.append(test_regression())
    results.append(test_code_sanity())
    
    # Summary
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Total tests passed: {total_passed}/{total_tests}")
    
    if total_passed == total_tests:
        print("✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"❌ {total_tests - total_passed} TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
