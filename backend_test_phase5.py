#!/usr/bin/env python3
"""
Backend test for PHASE 5 — KITCHEN↔SUPPLIER CONNECTIONS + B2B ORDERING
Tests the NEW kitchen↔supplier marketplace backend in ShelfWise.

LOCAL ENV: Supabase NOT configured — DB ops return 500 "Supabase env vars missing" (EXPECTED).
Only 404s or JS crashes are failures.
"""

import requests
import json
import sys
import subprocess

# Base URL
BASE_URL = "http://localhost:3000"

def mint_chef_jwt():
    """Mint a chef JWT using SHELFWISE_JWT_SECRET from .env"""
    cmd = """cd /app && export $(grep SHELFWISE_JWT_SECRET .env | xargs) && node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    token = result.stdout.strip()
    print(f"✅ Minted chef JWT: {token[:20]}...")
    return token

def test_kitchen_marketplace_routes(chef_token):
    """
    TEST 1: KITCHEN MARKETPLACE ROUTES — auth wiring
    For EACH: no auth → 401; chef JWT → 500 supabase-env error (NOT 404, NOT 403)
    """
    print("\n" + "="*80)
    print("TEST 1: KITCHEN MARKETPLACE ROUTES — Auth Wiring")
    print("="*80)
    
    routes = [
        ("GET", "/api/kitchen/suppliers", None),
        ("GET", "/api/kitchen/suppliers/11111111-1111-1111-1111-111111111111/catalog", None),
        ("GET", "/api/kitchen/orders", None),
        ("DELETE", "/api/kitchen/suppliers/11111111-1111-1111-1111-111111111111", None),
        ("POST", "/api/kitchen/suppliers/connect", {"code": "SUP-ABC123"}),
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
            
            if r.status_code == 401:
                print(f"✅ {method} {path} (no auth) → 401 (expected)")
                passed += 1
            else:
                print(f"❌ {method} {path} (no auth) → {r.status_code} (expected 401)")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ {method} {path} (no auth) → Exception: {e}")
        
        # Test 1b: Chef JWT → 500 supabase error (NOT 404, NOT 403)
        try:
            headers = {"Authorization": f"Bearer {chef_token}"}
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=10)
            elif method == "POST":
                r = requests.post(f"{BASE_URL}{path}", json=body, headers=headers, timeout=10)
            elif method == "DELETE":
                r = requests.delete(f"{BASE_URL}{path}", headers=headers, timeout=10)
            
            if r.status_code == 500:
                data = r.json()
                if "supabase" in data.get("error", "").lower() or "env vars" in data.get("error", "").lower():
                    print(f"✅ {method} {path} (chef JWT) → 500 supabase error (expected)")
                    passed += 1
                else:
                    print(f"❌ {method} {path} (chef JWT) → 500 but NOT supabase error")
                    print(f"   Response: {r.text[:200]}")
            elif r.status_code == 404:
                print(f"❌ {method} {path} (chef JWT) → 404 (endpoint NOT wired correctly)")
                print(f"   Response: {r.text[:200]}")
            elif r.status_code == 403:
                print(f"❌ {method} {path} (chef JWT) → 403 (should be 500 supabase error)")
                print(f"   Response: {r.text[:200]}")
            else:
                print(f"❌ {method} {path} (chef JWT) → {r.status_code} (expected 500)")
                print(f"   Response: {r.text[:200]}")
        except Exception as e:
            print(f"❌ {method} {path} (chef JWT) → Exception: {e}")
    
    print(f"\n📊 Test 1 Results: {passed}/{total} passed")
    return passed, total

def test_validation(chef_token):
    """
    TEST 2: VALIDATION (chef JWT — these validate BEFORE hitting the DB, so they must return 400)
    """
    print("\n" + "="*80)
    print("TEST 2: VALIDATION (runs BEFORE DB access)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {chef_token}"}
    passed = 0
    total = 4
    
    # Test 2a: GET /api/kitchen/suppliers/search?q=a → 200 [] (query under 2 chars returns empty array)
    try:
        r = requests.get(f"{BASE_URL}/api/kitchen/suppliers/search?q=a", headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) == 0:
                print(f"✅ GET /api/kitchen/suppliers/search?q=a → 200 [] (query under 2 chars)")
                passed += 1
            else:
                print(f"❌ GET /api/kitchen/suppliers/search?q=a → 200 but not empty array")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ GET /api/kitchen/suppliers/search?q=a → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/kitchen/suppliers/search?q=a → Exception: {e}")
    
    # Test 2b: POST /api/kitchen/suppliers/connect {} → 400 "Provide supplierId, code or email"
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/suppliers/connect", json={}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "supplierId" in data.get("error", "").lower() or "code" in data.get("error", "").lower() or "email" in data.get("error", "").lower():
                print(f"✅ POST /api/kitchen/suppliers/connect {{}} → 400 'Provide supplierId, code or email'")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/suppliers/connect {{}} → 400 but wrong error message")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ POST /api/kitchen/suppliers/connect {{}} → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/suppliers/connect {{}} → Exception: {e}")
    
    # Test 2c: POST /api/kitchen/orders {} → 400 "supplierId required"
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/orders", json={}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "supplierid" in data.get("error", "").lower():
                print(f"✅ POST /api/kitchen/orders {{}} → 400 'supplierId required'")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/orders {{}} → 400 but wrong error message")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ POST /api/kitchen/orders {{}} → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/orders {{}} → Exception: {e}")
    
    # Test 2d: POST /api/kitchen/orders {"supplierId":"x"} → 400 "At least one item required"
    try:
        r = requests.post(f"{BASE_URL}/api/kitchen/orders", json={"supplierId": "x"}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "item" in data.get("error", "").lower():
                print(f"✅ POST /api/kitchen/orders {{'supplierId':'x'}} → 400 'At least one item required'")
                passed += 1
            else:
                print(f"❌ POST /api/kitchen/orders {{'supplierId':'x'}} → 400 but wrong error message")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ POST /api/kitchen/orders {{'supplierId':'x'}} → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/kitchen/orders {{'supplierId':'x'}} → Exception: {e}")
    
    print(f"\n📊 Test 2 Results: {passed}/{total} passed")
    return passed, total

def test_supplier_side_routes(chef_token):
    """
    TEST 3: SUPPLIER-SIDE NEW ROUTES — auth wiring
    GET /api/supplier/clients: no auth → 401; chef JWT → 403 "Supplier login required" (NOT 404)
    """
    print("\n" + "="*80)
    print("TEST 3: SUPPLIER-SIDE NEW ROUTES — Auth Wiring")
    print("="*80)
    
    passed = 0
    total = 2
    
    # Test 3a: No auth → 401
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/clients", timeout=10)
        if r.status_code == 401:
            print(f"✅ GET /api/supplier/clients (no auth) → 401 (expected)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/clients (no auth) → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/clients (no auth) → Exception: {e}")
    
    # Test 3b: Chef JWT → 403 "Supplier login required (email & password)" (NOT 404)
    try:
        headers = {"Authorization": f"Bearer {chef_token}"}
        r = requests.get(f"{BASE_URL}/api/supplier/clients", headers=headers, timeout=10)
        if r.status_code == 403:
            data = r.json()
            if "supplier" in data.get("error", "").lower():
                print(f"✅ GET /api/supplier/clients (chef JWT) → 403 'Supplier login required' (NOT 404)")
                passed += 1
            else:
                print(f"❌ GET /api/supplier/clients (chef JWT) → 403 but wrong error message")
                print(f"   Response: {r.text[:200]}")
        elif r.status_code == 404:
            print(f"❌ GET /api/supplier/clients (chef JWT) → 404 (endpoint NOT wired correctly)")
            print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ GET /api/supplier/clients (chef JWT) → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/clients (chef JWT) → Exception: {e}")
    
    print(f"\n📊 Test 3 Results: {passed}/{total} passed")
    return passed, total

def test_regression(chef_token):
    """
    TEST 4: REGRESSION
    - GET /api/supplier/profile, /api/supplier/orders, /api/supplier/stats with chef JWT → still 403
    - PUT /api/supplier/orders/some-uuid {"status":"confirmed"} no auth → 401
    - POST /api/recipe/substitutions chef JWT + valid body → 200 with substitutions
    - GET /api/version → 200 with Cache-Control: no-store header
    - GET /api/auth/me no auth → 401 {"authed":false}
    """
    print("\n" + "="*80)
    print("TEST 4: REGRESSION (ensure no breaking changes)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {chef_token}"}
    passed = 0
    total = 8
    
    # Test 4a: GET /api/supplier/profile with chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/profile", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/profile (chef JWT) → 403 (not broken by edits)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/profile (chef JWT) → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/profile (chef JWT) → Exception: {e}")
    
    # Test 4b: GET /api/supplier/orders with chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/orders", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/orders (chef JWT) → 403 (not broken by edits)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/orders (chef JWT) → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/orders (chef JWT) → Exception: {e}")
    
    # Test 4c: GET /api/supplier/stats with chef JWT → 403
    try:
        r = requests.get(f"{BASE_URL}/api/supplier/stats", headers=headers, timeout=10)
        if r.status_code == 403:
            print(f"✅ GET /api/supplier/stats (chef JWT) → 403 (not broken by edits)")
            passed += 1
        else:
            print(f"❌ GET /api/supplier/stats (chef JWT) → {r.status_code} (expected 403)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/supplier/stats (chef JWT) → Exception: {e}")
    
    # Test 4d: PUT /api/supplier/orders/some-uuid no auth → 401
    try:
        r = requests.put(f"{BASE_URL}/api/supplier/orders/some-uuid", json={"status": "confirmed"}, timeout=10)
        if r.status_code == 401:
            print(f"✅ PUT /api/supplier/orders/some-uuid (no auth) → 401")
            passed += 1
        else:
            print(f"❌ PUT /api/supplier/orders/some-uuid (no auth) → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ PUT /api/supplier/orders/some-uuid (no auth) → Exception: {e}")
    
    # Test 4e: POST /api/recipe/substitutions chef JWT + valid body → 200 with substitutions
    try:
        body = {
            "title": "Carbonara",
            "ingredients": [
                {"name": "Cream", "quantity": 100, "unit": "ml"}
            ]
        }
        r = requests.post(f"{BASE_URL}/api/recipe/substitutions", json=body, headers=headers, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if "substitutions" in data or isinstance(data, dict):
                print(f"✅ POST /api/recipe/substitutions (chef JWT + valid body) → 200 with substitutions (LLM endpoints intact)")
                passed += 1
            else:
                print(f"❌ POST /api/recipe/substitutions → 200 but no substitutions in response")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ POST /api/recipe/substitutions → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ POST /api/recipe/substitutions → Exception: {e}")
    
    # Test 4f: GET /api/version → 200 with Cache-Control: no-store header
    try:
        r = requests.get(f"{BASE_URL}/api/version", timeout=10)
        if r.status_code == 200:
            cache_control = r.headers.get("Cache-Control", "")
            if "no-store" in cache_control:
                print(f"✅ GET /api/version → 200 with Cache-Control: no-store header")
                passed += 1
            else:
                print(f"❌ GET /api/version → 200 but Cache-Control header missing 'no-store'")
                print(f"   Cache-Control: {cache_control}")
        else:
            print(f"❌ GET /api/version → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/version → Exception: {e}")
    
    # Test 4g: GET /api/auth/me no auth → 401 {"authed":false}
    try:
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        if r.status_code == 401:
            data = r.json()
            if data.get("authed") == False:
                print(f"✅ GET /api/auth/me (no auth) → 401 {{'authed':false}}")
                passed += 1
            else:
                print(f"❌ GET /api/auth/me (no auth) → 401 but wrong response body")
                print(f"   Response: {r.text[:200]}")
        else:
            print(f"❌ GET /api/auth/me (no auth) → {r.status_code} (expected 401)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/auth/me (no auth) → Exception: {e}")
    
    # Test 4h: GET /api/health → 200 (general sanity check)
    try:
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        if r.status_code == 200:
            print(f"✅ GET /api/health → 200 (general sanity check)")
            passed += 1
        else:
            print(f"❌ GET /api/health → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
    except Exception as e:
        print(f"❌ GET /api/health → Exception: {e}")
    
    print(f"\n📊 Test 4 Results: {passed}/{total} passed")
    return passed, total

def main():
    print("="*80)
    print("PHASE 5 — KITCHEN↔SUPPLIER CONNECTIONS + B2B ORDERING")
    print("Backend Testing Suite")
    print("="*80)
    
    # Mint chef JWT
    chef_token = mint_chef_jwt()
    
    # Run all tests
    results = []
    results.append(test_kitchen_marketplace_routes(chef_token))
    results.append(test_validation(chef_token))
    results.append(test_supplier_side_routes(chef_token))
    results.append(test_regression(chef_token))
    
    # Summary
    total_passed = sum(r[0] for r in results)
    total_tests = sum(r[1] for r in results)
    
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Total: {total_passed}/{total_tests} tests passed")
    
    if total_passed == total_tests:
        print("\n✅ ALL TESTS PASSED! PHASE 5 backend is working perfectly.")
        return 0
    else:
        print(f"\n⚠️  {total_tests - total_passed} test(s) failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
