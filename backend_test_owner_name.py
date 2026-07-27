#!/usr/bin/env python3
"""
Backend test for Owner display name feature (AUG 2026 SESSION)
Tests POST /api/staff/owner-name + regressions for ownerDisplayName changes
"""

import requests
import json
import sys
import os

# Read NEXT_PUBLIC_BASE_URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in /app/.env")
    sys.exit(1)

API_BASE = f"{BASE_URL}/api"
print(f"Testing backend at: {API_BASE}\n")

# Mint a chef JWT for testing
import subprocess
mint_cmd = """cd /app && node -e "const jwt=require('/app/node_modules/jsonwebtoken'); const fs=require('fs'); const env=fs.readFileSync('/app/.env','utf8'); const sec=(env.match(/^SHELFWISE_JWT_SECRET=(.*)$/m)||[])[1]; console.log(jwt.sign({kitchen_id:'test-kitchen',role:'chef',person:'TestChef'},sec,{expiresIn:'12h'}))" """
result = subprocess.run(mint_cmd, shell=True, capture_output=True, text=True)
CHEF_JWT = result.stdout.strip()

if not CHEF_JWT or len(CHEF_JWT) < 20:
    print(f"❌ Failed to mint chef JWT: {result.stderr}")
    sys.exit(1)

print(f"✅ Chef JWT minted: {CHEF_JWT[:30]}...\n")

# Test counters
passed = 0
failed = 0

def test(name, fn):
    global passed, failed
    try:
        print(f"🧪 {name}")
        fn()
        print(f"   ✅ PASS\n")
        passed += 1
    except AssertionError as e:
        print(f"   ❌ FAIL: {e}\n")
        failed += 1
    except Exception as e:
        print(f"   ❌ ERROR: {e}\n")
        failed += 1

# ============================================================================
# TEST A: POST /api/staff/owner-name
# ============================================================================

def test_owner_name_no_auth():
    """POST /api/staff/owner-name without auth → 401 (not 404)"""
    r = requests.post(f"{API_BASE}/staff/owner-name", json={"name": "John Smith"})
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    data = r.json()
    assert "error" in data or "authed" in data, f"Expected JSON error, got {data}"
    print(f"   → 401 {data}")

def test_owner_name_chef_jwt():
    """POST /api/staff/owner-name with chef JWT → 403 'Owner only' (not 404)"""
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    r = requests.post(f"{API_BASE}/staff/owner-name", json={"name": "John Smith"}, headers=headers)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
    data = r.json()
    assert "error" in data, f"Expected JSON error, got {data}"
    assert "owner" in data["error"].lower(), f"Expected 'Owner only' error, got {data['error']}"
    print(f"   → 403 {data}")

def test_owner_name_json_response():
    """POST /api/staff/owner-name returns JSON (no stack trace)"""
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    r = requests.post(f"{API_BASE}/staff/owner-name", json={"name": "John Smith"}, headers=headers)
    # Should be 403 with chef JWT
    assert r.headers.get("content-type", "").startswith("application/json"), \
        f"Expected JSON response, got {r.headers.get('content-type')}"
    data = r.json()
    # Check for JS crash indicators
    assert "ownerDisplayName is not defined" not in str(data), "JS reference error detected"
    assert "Cannot read properties" not in str(data), "JS crash detected"
    assert "TypeError" not in str(data), "JS TypeError detected"
    print(f"   → JSON response OK, no stack trace")

# ============================================================================
# TEST B: Regression — POST /api/products (validatedPersonFromRequest change)
# ============================================================================

def test_products_create_no_crash():
    """POST /api/products with chef JWT → 500 supabase-env (NOT 404, NOT JS crash)"""
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    body = {"name": "Test Beef Mince", "quantity": 2, "unit": "kg"}
    r = requests.post(f"{API_BASE}/products", json=body, headers=headers)
    
    # Should reach Supabase step (500 error expected locally)
    assert r.status_code != 404, f"Expected 500 (supabase error), got 404 (wiring broken)"
    
    # Check response is JSON
    assert r.headers.get("content-type", "").startswith("application/json"), \
        f"Expected JSON response, got {r.headers.get('content-type')}"
    
    data = r.json()
    
    # Check for JS crash indicators
    assert "ownerDisplayName is not defined" not in str(data), "JS reference error: ownerDisplayName not defined"
    assert "validatedPersonFromRequest is not defined" not in str(data), "JS reference error: validatedPersonFromRequest not defined"
    assert "Cannot read properties" not in str(data), "JS crash: Cannot read properties"
    assert "TypeError" not in str(data), "JS TypeError detected"
    
    # Should be 500 with Supabase env error (expected locally)
    if r.status_code == 500:
        error_msg = str(data.get("error", "")).lower()
        assert "supabase" in error_msg or "env" in error_msg or "configured" in error_msg, \
            f"Expected Supabase env error, got: {data}"
        print(f"   → 500 (Supabase env error, EXPECTED locally): {data}")
    else:
        print(f"   → {r.status_code} {data} (unexpected but no crash)")

# ============================================================================
# TEST C: Regression — GET /api/auth/me
# ============================================================================

def test_auth_me_no_auth():
    """GET /api/auth/me without auth → 401 {authed:false}"""
    r = requests.get(f"{API_BASE}/auth/me")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    data = r.json()
    assert data.get("authed") == False, f"Expected authed:false, got {data}"
    print(f"   → 401 {data}")

def test_auth_me_chef_jwt():
    """GET /api/auth/me with chef JWT → attempts kitchen lookup (500 supabase-env OR authed JSON, NOT crash)"""
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    r = requests.get(f"{API_BASE}/auth/me", headers=headers)
    
    # Check response is JSON
    assert r.headers.get("content-type", "").startswith("application/json"), \
        f"Expected JSON response, got {r.headers.get('content-type')}"
    
    data = r.json()
    
    # Check for JS crash indicators
    assert "ownerDisplayName is not defined" not in str(data), "JS reference error: ownerDisplayName not defined"
    assert "Cannot read properties" not in str(data), "JS crash: Cannot read properties"
    assert "TypeError" not in str(data), "JS TypeError detected"
    
    # Should be either 500 (Supabase error) or 200 (authed JSON)
    if r.status_code == 500:
        error_msg = str(data.get("error", "")).lower()
        assert "supabase" in error_msg or "env" in error_msg or "configured" in error_msg, \
            f"Expected Supabase env error, got: {data}"
        print(f"   → 500 (Supabase env error, EXPECTED locally): {data}")
    elif r.status_code == 200:
        assert "authed" in data, f"Expected authed field, got {data}"
        print(f"   → 200 {data}")
    else:
        raise AssertionError(f"Unexpected status {r.status_code}: {data}")

# ============================================================================
# TEST D: Regression smoke tests
# ============================================================================

def test_health():
    """GET /api/health → 200"""
    r = requests.get(f"{API_BASE}/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert data.get("ok") == True, f"Expected ok:true, got {data}"
    print(f"   → 200 {data}")

def test_staff_pin_login_validation():
    """POST /api/staff/pin-login with chef JWT + body {"pin":"1234"} → reaches supabase step (500 supabase-env) not a crash"""
    headers = {"Authorization": f"Bearer {CHEF_JWT}"}
    body = {"pin": "1234"}
    r = requests.post(f"{API_BASE}/staff/pin-login", json=body, headers=headers)
    
    # Check response is JSON
    assert r.headers.get("content-type", "").startswith("application/json"), \
        f"Expected JSON response, got {r.headers.get('content-type')}"
    
    data = r.json()
    
    # Check for JS crash indicators
    assert "ownerDisplayName is not defined" not in str(data), "JS reference error detected"
    assert "Cannot read properties" not in str(data), "JS crash detected"
    assert "TypeError" not in str(data), "JS TypeError detected"
    
    # Should reach Supabase step (500 error expected locally)
    if r.status_code == 500:
        error_msg = str(data.get("error", "")).lower()
        assert "supabase" in error_msg or "env" in error_msg or "configured" in error_msg, \
            f"Expected Supabase env error, got: {data}"
        print(f"   → 500 (Supabase env error, EXPECTED locally): {data}")
    else:
        # Could be 400 validation error or other - as long as no crash
        print(f"   → {r.status_code} {data} (no crash)")

def test_staff_add_no_auth():
    """POST /api/staff/add without auth → 401"""
    r = requests.post(f"{API_BASE}/staff/add", json={"name": "Test Staff"})
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    data = r.json()
    assert "error" in data or "authed" in data, f"Expected JSON error, got {data}"
    print(f"   → 401 {data}")

# ============================================================================
# RUN ALL TESTS
# ============================================================================

print("=" * 80)
print("TEST A: POST /api/staff/owner-name")
print("=" * 80)
test("A1: No auth → 401 (not 404)", test_owner_name_no_auth)
test("A2: Chef JWT → 403 'Owner only' (not 404)", test_owner_name_chef_jwt)
test("A3: JSON response, no stack trace", test_owner_name_json_response)

print("=" * 80)
print("TEST B: Regression — POST /api/products (validatedPersonFromRequest change)")
print("=" * 80)
test("B1: Chef JWT + product body → 500 supabase-env (NOT 404, NOT JS crash)", test_products_create_no_crash)

print("=" * 80)
print("TEST C: Regression — GET /api/auth/me")
print("=" * 80)
test("C1: No auth → 401 {authed:false}", test_auth_me_no_auth)
test("C2: Chef JWT → 500 supabase-env OR authed JSON (NOT crash)", test_auth_me_chef_jwt)

print("=" * 80)
print("TEST D: Regression smoke tests")
print("=" * 80)
test("D1: GET /api/health → 200", test_health)
test("D2: POST /api/staff/pin-login with chef JWT → reaches supabase step (not crash)", test_staff_pin_login_validation)
test("D3: POST /api/staff/add no auth → 401", test_staff_add_no_auth)

# ============================================================================
# SUMMARY
# ============================================================================

print("=" * 80)
print(f"RESULTS: {passed} passed, {failed} failed")
print("=" * 80)

if failed > 0:
    print("\n❌ SOME TESTS FAILED")
    sys.exit(1)
else:
    print("\n✅ ALL TESTS PASSED")
    sys.exit(0)
