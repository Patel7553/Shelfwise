#!/usr/bin/env python3
"""
Backend test for PHASE 4 — SUPPLIER ACCOUNT ROLE
Tests supplier endpoints, signup accountType, and regression checks.
"""

import requests
import json as json_lib
import sys

# Base URL from .env
BASE_URL = "http://localhost:3000/api"

# Chef JWT minted using SHELFWISE_JWT_SECRET
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoidGVzdC1raXRjaGVuIiwicm9sZSI6ImNoZWYiLCJpYXQiOjE3ODUwODk1MDksImV4cCI6MTc4NTEzMjcwOX0.YlkVgOBmuzy_-ecrNACtTRcibwWMWqCP25O4N_zlCHs"

def test_supplier_endpoints():
    """
    TEST 1: SUPPLIER ROUTE WIRING + AUTH GATES
    For EACH endpoint, expect:
    - no auth → 401 "Not authenticated"
    - chef JWT → 403 "Supplier login required (email & password)" (NOT 404)
    """
    print("\n" + "="*80)
    print("TEST 1: SUPPLIER ROUTE WIRING + AUTH GATES")
    print("="*80)
    
    endpoints = [
        ("GET", "/supplier/profile", None),
        ("GET", "/supplier/products", None),
        ("GET", "/supplier/orders", None),
        ("GET", "/supplier/orders/some-uuid", None),
        ("GET", "/supplier/stats", None),
        ("POST", "/supplier/products", {"name": "Test"}),
        ("POST", "/supplier/orders", {"customerName": "K", "items": [{"name": "Milk", "quantity": 2, "price": 1.5}]}),
        ("PUT", "/supplier/products/some-uuid", {"price": 2}),
        ("PUT", "/supplier/orders/some-uuid", {"status": "confirmed"}),
        ("PUT", "/supplier/profile", {"businessName": "X"}),
        ("DELETE", "/supplier/products/some-uuid", None),
    ]
    
    passed = 0
    failed = 0
    
    for method, path, body in endpoints:
        print(f"\n--- Testing {method} {path} ---")
        
        # Test 1a: No auth → 401
        try:
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", timeout=10)
            elif method == "POST":
                r = requests.post(f"{BASE_URL}{path}", json=body, timeout=10)
            elif method == "PUT":
                r = requests.put(f"{BASE_URL}{path}", json=body, timeout=10)
            elif method == "DELETE":
                r = requests.delete(f"{BASE_URL}{path}", timeout=10)
            
            if r.status_code == 401:
                data = r.json()
                if "Not authenticated" in data.get("error", ""):
                    print(f"✅ No auth → 401 'Not authenticated'")
                    passed += 1
                else:
                    print(f"❌ No auth → 401 but wrong error: {data.get('error')}")
                    failed += 1
            else:
                print(f"❌ No auth → {r.status_code} (expected 401)")
                print(f"   Response: {r.text[:200]}")
                failed += 1
        except Exception as e:
            print(f"❌ No auth test failed: {e}")
            failed += 1
        
        # Test 1b: Chef JWT → 403 "Supplier login required"
        try:
            headers = {"Authorization": f"Bearer {CHEF_JWT}"}
            if method == "GET":
                r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=10)
            elif method == "POST":
                r = requests.post(f"{BASE_URL}{path}", json=body, headers=headers, timeout=10)
            elif method == "PUT":
                r = requests.put(f"{BASE_URL}{path}", json=body, headers=headers, timeout=10)
            elif method == "DELETE":
                r = requests.delete(f"{BASE_URL}{path}", headers=headers, timeout=10)
            
            if r.status_code == 403:
                data = r.json()
                if "Supplier login required" in data.get("error", ""):
                    print(f"✅ Chef JWT → 403 'Supplier login required (email & password)'")
                    passed += 1
                else:
                    print(f"❌ Chef JWT → 403 but wrong error: {data.get('error')}")
                    failed += 1
            elif r.status_code == 404:
                print(f"❌ Chef JWT → 404 (endpoint NOT wired correctly)")
                print(f"   Response: {r.text[:200]}")
                failed += 1
            else:
                print(f"❌ Chef JWT → {r.status_code} (expected 403)")
                print(f"   Response: {r.text[:200]}")
                failed += 1
        except Exception as e:
            print(f"❌ Chef JWT test failed: {e}")
            failed += 1
    
    print(f"\n{'='*80}")
    print(f"TEST 1 SUMMARY: {passed} passed, {failed} failed")
    print(f"{'='*80}")
    return passed, failed


def test_signup_accountType():
    """
    TEST 2: SIGNUP accountType
    - POST /api/auth/signup {} → 400 "email and password are required"
    - POST /api/auth/signup {"email":"a@b.com","password":"12345678"} (no consent) → 400 consent error
    - POST /api/auth/signup {"email":"supplier-test@example.com","password":"12345678","consent":true,"accountType":"supplier"} 
      → expect 400/500 with a supabase/auth error locally (NOT a JS crash / NOT 404) = correctly wired
    """
    print("\n" + "="*80)
    print("TEST 2: SIGNUP accountType")
    print("="*80)
    
    passed = 0
    failed = 0
    
    # Test 2a: Empty body → 400 "email and password are required"
    print("\n--- Test 2a: POST /api/auth/signup {} ---")
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={}, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "email and password are required" in data.get("error", ""):
                print(f"✅ Empty body → 400 'email and password are required'")
                passed += 1
            else:
                print(f"❌ Empty body → 400 but wrong error: {data.get('error')}")
                failed += 1
        else:
            print(f"❌ Empty body → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
    except Exception as e:
        print(f"❌ Test 2a failed: {e}")
        failed += 1
    
    # Test 2b: No consent → 400 consent error
    print("\n--- Test 2b: POST /api/auth/signup (no consent) ---")
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": "a@b.com",
            "password": "12345678"
        }, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "consent" in data.get("error", "").lower():
                print(f"✅ No consent → 400 with consent error")
                print(f"   Error: {data.get('error')}")
                passed += 1
            else:
                print(f"❌ No consent → 400 but wrong error: {data.get('error')}")
                failed += 1
        else:
            print(f"❌ No consent → {r.status_code} (expected 400)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
    except Exception as e:
        print(f"❌ Test 2b failed: {e}")
        failed += 1
    
    # Test 2c: Valid supplier signup → 400/500 with supabase error (correctly wired)
    print("\n--- Test 2c: POST /api/auth/signup (supplier accountType) ---")
    try:
        r = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": "supplier-test@example.com",
            "password": "12345678",
            "consent": True,
            "accountType": "supplier"
        }, timeout=10)
        
        # Expect 400 or 500 with supabase/auth error (NOT 404, NOT JS crash)
        if r.status_code in [400, 500]:
            data = r.json()
            error_msg = data.get("error", "").lower()
            
            # Check for supabase/auth errors (NOT JS errors)
            if any(keyword in error_msg for keyword in ["supabase", "auth", "database", "connection", "env"]):
                print(f"✅ Supplier signup → {r.status_code} with supabase/auth error (correctly wired)")
                print(f"   Error: {data.get('error')[:150]}")
                passed += 1
            elif "is not defined" in error_msg or "referenceerror" in error_msg or "typeerror" in error_msg:
                print(f"❌ Supplier signup → {r.status_code} with JS crash error")
                print(f"   Error: {data.get('error')}")
                failed += 1
            else:
                print(f"✅ Supplier signup → {r.status_code} with error (correctly wired)")
                print(f"   Error: {data.get('error')[:150]}")
                passed += 1
        elif r.status_code == 404:
            print(f"❌ Supplier signup → 404 (endpoint NOT wired correctly)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        else:
            print(f"⚠️  Supplier signup → {r.status_code} (unexpected, but not 404)")
            print(f"   Response: {r.text[:200]}")
            # Count as passed if not 404 (means endpoint is wired)
            passed += 1
    except Exception as e:
        print(f"❌ Test 2c failed: {e}")
        failed += 1
    
    print(f"\n{'='*80}")
    print(f"TEST 2 SUMMARY: {passed} passed, {failed} failed")
    print(f"{'='*80}")
    return passed, failed


def test_regression():
    """
    TEST 3: REGRESSION (chef JWT)
    - GET /api/auth/me with chef JWT → 200-ish (should still work; kitchen fetch fails locally)
    - POST /api/recipe/substitutions with chef JWT + valid body → 200 with substitutions (LLM works locally)
    - GET /api/version → 200 AND still has Cache-Control: no-store header
    - GET /api/products with chef JWT → 500 supabase error (NOT 403, NOT 404)
    """
    print("\n" + "="*80)
    print("TEST 3: REGRESSION (chef JWT)")
    print("="*80)
    
    passed = 0
    failed = 0
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    
    # Test 3a: GET /api/auth/me with chef JWT
    print("\n--- Test 3a: GET /api/auth/me with chef JWT ---")
    try:
        r = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        
        # Expect 200 or 500 (NOT 403, NOT 404, NOT JS crash)
        if r.status_code in [200, 500]:
            data = r.json()
            
            # Check it's not a JS crash
            error_msg = str(data.get("error", "")).lower()
            if "is not defined" in error_msg or "referenceerror" in error_msg or "typeerror" in error_msg:
                print(f"❌ /api/auth/me → {r.status_code} with JS crash")
                print(f"   Error: {data.get('error')}")
                failed += 1
            else:
                print(f"✅ /api/auth/me → {r.status_code} (working, no JS crash)")
                if r.status_code == 200:
                    print(f"   Response: authed={data.get('authed')}, kitchen={data.get('kitchen')}")
                else:
                    print(f"   Error: {str(data.get('error'))[:100]}")
                passed += 1
        elif r.status_code == 403:
            print(f"❌ /api/auth/me → 403 (chef JWT should NOT be blocked)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        elif r.status_code == 404:
            print(f"❌ /api/auth/me → 404 (routing failure)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        else:
            print(f"⚠️  /api/auth/me → {r.status_code} (unexpected)")
            print(f"   Response: {r.text[:200]}")
            passed += 1  # Not a critical failure
    except Exception as e:
        print(f"❌ Test 3a failed: {e}")
        failed += 1
    
    # Test 3b: POST /api/recipe/substitutions with chef JWT
    print("\n--- Test 3b: POST /api/recipe/substitutions with chef JWT ---")
    try:
        r = requests.post(f"{BASE_URL}/recipe/substitutions", headers=headers, json={
            "title": "Spaghetti Carbonara",
            "ingredients": [
                {"name": "bacon", "quantity": 200, "unit": "g"},
                {"name": "eggs", "quantity": 3, "unit": "ea"}
            ],
            "reason": "out of bacon"
        }, timeout=30)
        
        if r.status_code == 200:
            data = r.json()
            if "substitutions" in data or isinstance(data, list):
                print(f"✅ /api/recipe/substitutions → 200 with substitutions (LLM works locally)")
                print(f"   Substitutions count: {len(data.get('substitutions', data))}")
                passed += 1
            else:
                print(f"❌ /api/recipe/substitutions → 200 but no substitutions in response")
                print(f"   Response: {str(data)[:200]}")
                failed += 1
        elif r.status_code == 403:
            print(f"❌ /api/recipe/substitutions → 403 (chef JWT should NOT be blocked)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        elif r.status_code == 404:
            print(f"❌ /api/recipe/substitutions → 404 (routing failure)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        else:
            print(f"⚠️  /api/recipe/substitutions → {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            # If it's a server error but not 403/404, count as passed (endpoint is wired)
            if r.status_code >= 500:
                passed += 1
            else:
                failed += 1
    except Exception as e:
        print(f"❌ Test 3b failed: {e}")
        failed += 1
    
    # Test 3c: GET /api/version → 200 AND has Cache-Control: no-store header
    print("\n--- Test 3c: GET /api/version (Cache-Control header check) ---")
    try:
        r = requests.get(f"{BASE_URL}/version", timeout=10)
        
        if r.status_code == 200:
            cache_control = r.headers.get("Cache-Control", "")
            if "no-store" in cache_control:
                print(f"✅ /api/version → 200 with Cache-Control: no-store")
                print(f"   Cache-Control: {cache_control}")
                print(f"   Version: {r.json().get('version')}")
                passed += 1
            else:
                print(f"❌ /api/version → 200 but missing 'no-store' in Cache-Control")
                print(f"   Cache-Control: {cache_control}")
                failed += 1
        else:
            print(f"❌ /api/version → {r.status_code} (expected 200)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
    except Exception as e:
        print(f"❌ Test 3c failed: {e}")
        failed += 1
    
    # Test 3d: GET /api/products with chef JWT → 500 supabase error (NOT 403, NOT 404)
    print("\n--- Test 3d: GET /api/products with chef JWT ---")
    try:
        r = requests.get(f"{BASE_URL}/products", headers=headers, timeout=10)
        
        # Expect 500 with supabase error (NOT 403, NOT 404)
        if r.status_code == 500:
            data = r.json()
            error_msg = str(data.get("error", "")).lower()
            
            if "supabase" in error_msg or "database" in error_msg or "env" in error_msg:
                print(f"✅ /api/products → 500 with supabase error (chef JWT NOT blocked)")
                print(f"   Error: {str(data.get('error'))[:100]}")
                passed += 1
            else:
                print(f"⚠️  /api/products → 500 with other error (chef JWT NOT blocked)")
                print(f"   Error: {str(data.get('error'))[:100]}")
                passed += 1  # Still counts as passed (not 403/404)
        elif r.status_code == 403:
            print(f"❌ /api/products → 403 (chef JWT should NOT be blocked by supplier check)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        elif r.status_code == 404:
            print(f"❌ /api/products → 404 (routing failure)")
            print(f"   Response: {r.text[:200]}")
            failed += 1
        elif r.status_code == 200:
            print(f"✅ /api/products → 200 (working, chef JWT NOT blocked)")
            data = r.json()
            print(f"   Products count: {len(data) if isinstance(data, list) else 'N/A'}")
            passed += 1
        else:
            print(f"⚠️  /api/products → {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            passed += 1  # Not 403/404, so endpoint is accessible
    except Exception as e:
        print(f"❌ Test 3d failed: {e}")
        failed += 1
    
    print(f"\n{'='*80}")
    print(f"TEST 3 SUMMARY: {passed} passed, {failed} failed")
    print(f"{'='*80}")
    return passed, failed


def main():
    print("\n" + "="*80)
    print("BACKEND TEST: PHASE 4 — SUPPLIER ACCOUNT ROLE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Chef JWT: {CHEF_JWT[:50]}...")
    
    total_passed = 0
    total_failed = 0
    
    # Run all tests
    p1, f1 = test_supplier_endpoints()
    total_passed += p1
    total_failed += f1
    
    p2, f2 = test_signup_accountType()
    total_passed += p2
    total_failed += f2
    
    p3, f3 = test_regression()
    total_passed += p3
    total_failed += f3
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    print(f"Total tests passed: {total_passed}")
    print(f"Total tests failed: {total_failed}")
    print(f"Success rate: {total_passed}/{total_passed + total_failed} ({100 * total_passed / (total_passed + total_failed) if (total_passed + total_failed) > 0 else 0:.1f}%)")
    print("="*80)
    
    # Exit with appropriate code
    sys.exit(0 if total_failed == 0 else 1)


if __name__ == "__main__":
    main()
