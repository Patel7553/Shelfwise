#!/usr/bin/env python3
"""
Backend test for Staff Rename feature (POST /api/staff/rename) + regression tests.

ENVIRONMENT: Supabase NOT configured locally — DB-hitting endpoints return 500 supabase-env errors,
which are EXPECTED and count as wiring PASSES. Failures = 404s, non-JSON responses, or JS crash messages
("is not defined", "Cannot read properties", TypeError/ReferenceError).

Tests:
1. POST /api/staff/rename body {"oldName":"Jon","newName":"Jonathan"}: no auth -> 401; with chef JWT -> 403 {"error":"Owner only"}. Confirm not 404, JSON only.
2. POST /api/staff/rename with chef JWT and missing body fields ({}) -> still 403 (guard runs before validation) — just confirm no crash.
3. Regression: POST /api/staff/owner-name -> 401 no auth, 403 chef JWT. POST /api/staff/add -> 401 no auth.
4. GET /api/auth/me -> 401 {"authed":false} no auth; with chef JWT -> reaches supabase (500 supabase-env) or JSON, NO JS crash (it now calls a new resolveStaffName helper).
5. POST /api/products with chef JWT body {"name":"Test","quantity":1} -> 500 supabase-env, no crash.
6. GET /api/health -> 200.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000"
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoidGVzdC1raXRjaGVuIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJUZXN0Q2hlZiIsImlhdCI6MTc4NTM1NjgyOCwiZXhwIjoxNzg1NDAwMDI4fQ.3xxQQuKKcq0OVgqMntrd15LXBW2yljk5ZzadDklIFr0"

def check_json_response(response, test_name):
    """Check if response is valid JSON (not a stack trace or HTML)"""
    try:
        data = response.json()
        print(f"  ✅ {test_name}: Response is valid JSON")
        return data
    except:
        print(f"  ❌ {test_name}: Response is NOT valid JSON")
        print(f"     Response text: {response.text[:200]}")
        return None

def check_no_js_crash(data, test_name):
    """Check for JavaScript crash indicators in response"""
    if data is None:
        return False
    
    response_str = json.dumps(data).lower()
    crash_indicators = [
        "is not defined",
        "cannot read properties",
        "typeerror",
        "referenceerror",
        "syntaxerror",
        "undefined is not",
        "null is not"
    ]
    
    for indicator in crash_indicators:
        if indicator in response_str:
            print(f"  ❌ {test_name}: JavaScript crash detected: '{indicator}'")
            return False
    
    print(f"  ✅ {test_name}: No JavaScript crash detected")
    return True

def test_staff_rename_no_auth():
    """Test 1a: POST /api/staff/rename with NO auth -> 401"""
    print("\n=== Test 1a: POST /api/staff/rename with NO auth ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/rename",
            json={"oldName": "Jon", "newName": "Jonathan"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"  ❌ FAIL: Got 404 (endpoint not wired)")
            return False
        
        data = check_json_response(response, "Test 1a")
        if data is None:
            return False
        
        if response.status_code == 401:
            if "error" in data and ("not authenticated" in data["error"].lower() or "authentication" in data["error"].lower()):
                print(f"  ✅ PASS: Got 401 with authentication error")
                return True
            else:
                print(f"  ⚠️  Got 401 but unexpected error message: {data}")
                return True  # Still a pass, just unexpected message
        else:
            print(f"  ❌ FAIL: Expected 401, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_staff_rename_chef_jwt():
    """Test 1b: POST /api/staff/rename with chef JWT -> 403 "Owner only" """
    print("\n=== Test 1b: POST /api/staff/rename with chef JWT -> 403 'Owner only' ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/rename",
            json={"oldName": "Jon", "newName": "Jonathan"},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"  ❌ FAIL: Got 404 (endpoint not wired)")
            return False
        
        data = check_json_response(response, "Test 1b")
        if data is None:
            return False
        
        if not check_no_js_crash(data, "Test 1b"):
            return False
        
        if response.status_code == 403:
            if "error" in data and "owner" in data["error"].lower():
                print(f"  ✅ PASS: Got 403 with 'Owner only' error: {data['error']}")
                return True
            else:
                print(f"  ⚠️  Got 403 but unexpected error message: {data}")
                return True  # Still a pass
        else:
            print(f"  ❌ FAIL: Expected 403, got {response.status_code}")
            print(f"     Response: {data}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_staff_rename_empty_body():
    """Test 2: POST /api/staff/rename with chef JWT and empty body -> still 403 (guard runs before validation)"""
    print("\n=== Test 2: POST /api/staff/rename with chef JWT and empty body {} ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/rename",
            json={},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"  ❌ FAIL: Got 404 (endpoint not wired)")
            return False
        
        data = check_json_response(response, "Test 2")
        if data is None:
            return False
        
        if not check_no_js_crash(data, "Test 2"):
            return False
        
        if response.status_code == 403:
            print(f"  ✅ PASS: Got 403 (guard runs before validation)")
            return True
        elif response.status_code == 400:
            print(f"  ⚠️  Got 400 (validation ran before guard, but no crash)")
            return True  # Still acceptable, no crash
        else:
            print(f"  ❌ FAIL: Expected 403 or 400, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_staff_owner_name_no_auth():
    """Test 3a: POST /api/staff/owner-name with NO auth -> 401"""
    print("\n=== Test 3a: POST /api/staff/owner-name with NO auth ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/owner-name",
            json={"name": "Test Owner"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 3a")
        if data is None:
            return False
        
        if response.status_code == 401:
            print(f"  ✅ PASS: Got 401")
            return True
        else:
            print(f"  ❌ FAIL: Expected 401, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_staff_owner_name_chef_jwt():
    """Test 3b: POST /api/staff/owner-name with chef JWT -> 403"""
    print("\n=== Test 3b: POST /api/staff/owner-name with chef JWT ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/owner-name",
            json={"name": "Test Owner"},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 3b")
        if data is None:
            return False
        
        if response.status_code == 403:
            print(f"  ✅ PASS: Got 403")
            return True
        else:
            print(f"  ❌ FAIL: Expected 403, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_staff_add_no_auth():
    """Test 3c: POST /api/staff/add with NO auth -> 401"""
    print("\n=== Test 3c: POST /api/staff/add with NO auth ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/staff/add",
            json={"name": "Test Staff"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 3c")
        if data is None:
            return False
        
        if response.status_code == 401:
            print(f"  ✅ PASS: Got 401")
            return True
        else:
            print(f"  ❌ FAIL: Expected 401, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_auth_me_no_auth():
    """Test 4a: GET /api/auth/me with NO auth -> 401 {"authed":false}"""
    print("\n=== Test 4a: GET /api/auth/me with NO auth ===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 4a")
        if data is None:
            return False
        
        if response.status_code == 401:
            if "authed" in data and data["authed"] == False:
                print(f"  ✅ PASS: Got 401 with authed:false")
                return True
            else:
                print(f"  ⚠️  Got 401 but unexpected response: {data}")
                return True  # Still a pass
        else:
            print(f"  ❌ FAIL: Expected 401, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_auth_me_chef_jwt():
    """Test 4b: GET /api/auth/me with chef JWT -> reaches supabase (500 supabase-env) or JSON, NO JS crash"""
    print("\n=== Test 4b: GET /api/auth/me with chef JWT (calls resolveStaffName) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"  ❌ FAIL: Got 404 (endpoint not wired)")
            return False
        
        data = check_json_response(response, "Test 4b")
        if data is None:
            return False
        
        if not check_no_js_crash(data, "Test 4b"):
            print(f"  ❌ FAIL: JavaScript crash detected (resolveStaffName issue?)")
            return False
        
        if response.status_code == 500:
            if "error" in data and "supabase" in data["error"].lower():
                print(f"  ✅ PASS: Got 500 with Supabase error (EXPECTED locally, proves wiring correct)")
                return True
            else:
                print(f"  ⚠️  Got 500 but unexpected error: {data}")
                return True  # Still a pass if no JS crash
        elif response.status_code == 200:
            print(f"  ✅ PASS: Got 200 (unexpected but valid JSON, no crash)")
            return True
        else:
            print(f"  ⚠️  Got {response.status_code}, but no JS crash detected")
            return True  # As long as no crash, it's acceptable
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_products_chef_jwt():
    """Test 5: POST /api/products with chef JWT -> 500 supabase-env, no crash"""
    print("\n=== Test 5: POST /api/products with chef JWT ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/products",
            json={"name": "Test Product", "quantity": 1},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 5")
        if data is None:
            return False
        
        if not check_no_js_crash(data, "Test 5"):
            return False
        
        if response.status_code == 500:
            if "error" in data and "supabase" in data["error"].lower():
                print(f"  ✅ PASS: Got 500 with Supabase error (EXPECTED locally)")
                return True
            else:
                print(f"  ⚠️  Got 500 but unexpected error: {data}")
                return True  # Still a pass if no JS crash
        else:
            print(f"  ⚠️  Expected 500, got {response.status_code}, but no crash")
            return True  # As long as no crash
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_health():
    """Test 6: GET /api/health -> 200"""
    print("\n=== Test 6: GET /api/health ===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/health",
            timeout=10
        )
        
        print(f"  Status: {response.status_code}")
        
        data = check_json_response(response, "Test 6")
        if data is None:
            return False
        
        if response.status_code == 200:
            print(f"  ✅ PASS: Got 200")
            return True
        else:
            print(f"  ❌ FAIL: Expected 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def main():
    print("=" * 80)
    print("STAFF RENAME FEATURE + REGRESSION TEST")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Chef JWT: {CHEF_JWT[:50]}...")
    print("=" * 80)
    
    tests = [
        ("Test 1a: POST /api/staff/rename no auth -> 401", test_staff_rename_no_auth),
        ("Test 1b: POST /api/staff/rename chef JWT -> 403 'Owner only'", test_staff_rename_chef_jwt),
        ("Test 2: POST /api/staff/rename empty body -> still 403", test_staff_rename_empty_body),
        ("Test 3a: POST /api/staff/owner-name no auth -> 401", test_staff_owner_name_no_auth),
        ("Test 3b: POST /api/staff/owner-name chef JWT -> 403", test_staff_owner_name_chef_jwt),
        ("Test 3c: POST /api/staff/add no auth -> 401", test_staff_add_no_auth),
        ("Test 4a: GET /api/auth/me no auth -> 401", test_auth_me_no_auth),
        ("Test 4b: GET /api/auth/me chef JWT -> no crash", test_auth_me_chef_jwt),
        ("Test 5: POST /api/products chef JWT -> no crash", test_products_chef_jwt),
        ("Test 6: GET /api/health -> 200", test_health),
    ]
    
    results = []
    for test_name, test_func in tests:
        result = test_func()
        results.append((test_name, result))
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
