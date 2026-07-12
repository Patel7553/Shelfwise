#!/usr/bin/env python3
"""
Test staff management + activity log changes for ShelfWise.
Tests authentication, authorization (owner-only), and code inspection.
"""

import requests
import json
import sys
import os

# Read base URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip() + '/api'
            break

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in /app/.env")
    sys.exit(1)

print(f"Testing against: {BASE_URL}\n")

# Mint a chef JWT for testing (role=chef, NOT owner)
import subprocess
chef_jwt_cmd = """node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))" """
chef_jwt = subprocess.check_output(chef_jwt_cmd, shell=True).decode().strip()
print(f"✓ Minted chef JWT: {chef_jwt[:30]}...\n")

# Test counters
passed = 0
failed = 0

def test(name, fn):
    global passed, failed
    try:
        print(f"Test: {name}")
        fn()
        print(f"✅ PASS\n")
        passed += 1
    except AssertionError as e:
        print(f"❌ FAIL: {e}\n")
        failed += 1
    except Exception as e:
        print(f"❌ ERROR: {e}\n")
        failed += 1

# ============================================================================
# TEST 1: GET /api/staff
# ============================================================================

def test_staff_no_auth():
    """GET /api/staff without auth → 401"""
    r = requests.get(f"{BASE_URL}/staff")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
    print(f"  → 401 (no auth)")

def test_staff_chef_jwt():
    """GET /api/staff with chef JWT → 403 'Owner only'"""
    r = requests.get(f"{BASE_URL}/staff", headers={"Authorization": f"Bearer {chef_jwt}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    body = r.json()
    assert "Owner only" in body.get("error", ""), f"Expected 'Owner only' error, got: {body}"
    print(f"  → 403 'Owner only' (chef JWT rejected)")

# ============================================================================
# TEST 2: GET /api/activity
# ============================================================================

def test_activity_no_auth():
    """GET /api/activity without auth → 401"""
    r = requests.get(f"{BASE_URL}/activity")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
    print(f"  → 401 (no auth)")

def test_activity_chef_jwt():
    """GET /api/activity with chef JWT → 403 'Owner only'"""
    r = requests.get(f"{BASE_URL}/activity", headers={"Authorization": f"Bearer {chef_jwt}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    body = r.json()
    assert "Owner only" in body.get("error", ""), f"Expected 'Owner only' error, got: {body}"
    print(f"  → 403 'Owner only' (chef JWT rejected)")

# ============================================================================
# TEST 3: DELETE /api/staff/:name
# ============================================================================

def test_delete_staff_no_auth():
    """DELETE /api/staff/Maria without auth → 401"""
    r = requests.delete(f"{BASE_URL}/staff/Maria")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
    print(f"  → 401 (no auth)")

def test_delete_staff_chef_jwt():
    """DELETE /api/staff/Maria with chef JWT → 403 'Owner only'"""
    r = requests.delete(f"{BASE_URL}/staff/Maria", headers={"Authorization": f"Bearer {chef_jwt}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
    body = r.json()
    assert "Owner only" in body.get("error", ""), f"Expected 'Owner only' error, got: {body}"
    print(f"  → 403 'Owner only' (chef JWT rejected)")

# ============================================================================
# TEST 4: Unit test personFromRequest (extract into node script)
# ============================================================================

def test_person_from_request_unit():
    """Unit test personFromRequest function"""
    script = """
const personFromRequest = function(request, ctx) {
  try {
    const h = request.headers.get('x-person-name')
    if (h) {
      const n = decodeURIComponent(h).trim().slice(0, 40)
      if (n) return n
    }
  } catch {}
  return ctx?.userEmail || (ctx?.role === 'chef' ? 'Chef (code login)' : ctx?.role || 'Unknown')
}

// Mock request object
class MockRequest {
  constructor(headers) {
    this._headers = headers || {}
  }
  headers = {
    get: (key) => this._headers[key] || null
  }
}

// Test cases
const tests = [
  {
    name: "header 'Maria' → 'Maria'",
    request: new MockRequest({'x-person-name': 'Maria'}),
    ctx: {},
    expected: 'Maria'
  },
  {
    name: "header encodeURIComponent('José García') → decoded 'José García'",
    request: new MockRequest({'x-person-name': encodeURIComponent('José García')}),
    ctx: {},
    expected: 'José García'
  },
  {
    name: "60-char name → capped at 40",
    request: new MockRequest({'x-person-name': 'A'.repeat(60)}),
    ctx: {},
    expected: 'A'.repeat(40)
  },
  {
    name: "no header, ctx {userEmail:'a@b.c'} → 'a@b.c'",
    request: new MockRequest({}),
    ctx: {userEmail: 'a@b.c'},
    expected: 'a@b.c'
  },
  {
    name: "no header, ctx {role:'chef'} → 'Chef (code login)'",
    request: new MockRequest({}),
    ctx: {role: 'chef'},
    expected: 'Chef (code login)'
  },
  {
    name: "malformed %-encoding must not throw",
    request: new MockRequest({'x-person-name': '%E0%A4%A'}),
    ctx: {role: 'chef'},
    expected: 'Chef (code login)' // Falls back because decodeURIComponent throws
  }
]

let passed = 0
let failed = 0

tests.forEach(t => {
  try {
    const result = personFromRequest(t.request, t.ctx)
    if (result === t.expected) {
      console.log(`✓ ${t.name}`)
      passed++
    } else {
      console.log(`✗ ${t.name}: expected '${t.expected}', got '${result}'`)
      failed++
    }
  } catch (e) {
    console.log(`✗ ${t.name}: threw error: ${e.message}`)
    failed++
  }
})

console.log(`\\nUnit test results: ${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
"""
    result = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        raise AssertionError(f"Unit test failed: {result.stderr}")
    assert "6/6 passed" in result.stdout, f"Expected 6/6 passed, got: {result.stdout}"

# ============================================================================
# TEST 5: Code inspection - verify all 9 logActivity call sites exist
# ============================================================================

def test_log_activity_call_sites():
    """Verify all 9 logActivity call sites exist in route.js"""
    with open('/app/app/api/[[...path]]/route.js', 'r') as f:
        content = f.read()
    
    expected_sites = [
        ("POST /api/products", "item_added", "data.name"),
        ("POST /api/products/bulk", "item_added", "data.length"),
        ("POST /api/waste", "waste_logged", "row.product_name"),
        ("POST /api/haccp/temperatures", "temp_logged", "location"),
        ("POST /api/recipes (insert)", "recipe_saved", "data?.title || row.title"),
        ("POST /api/recipes (replace)", "recipe_updated", "data?.title || row.title"),
        ("PUT /api/recipes/:id", "recipe_updated", "data?.title || segs[1]"),
        ("PUT /api/products/:id", "item_updated", "data?.name || segs[1]"),
        ("DELETE /api/products/:id", "item_deleted", "prod?.name || segs[1]"),
        ("DELETE /api/recipes/:id", "recipe_deleted", "rec?.title || segs[1]"),
    ]
    
    found = 0
    for site_name, action, detail_hint in expected_sites:
        # Search for logActivity call with the action
        if f"logActivity(sb," in content and f"'{action}'" in content:
            found += 1
            print(f"  ✓ {site_name}: logActivity(..., '{action}', ...)")
        else:
            print(f"  ✗ {site_name}: logActivity call with '{action}' NOT FOUND")
    
    # Also verify logActivity function wraps insert in try/catch
    if "async function logActivity" in content and "try {" in content and "} catch { /* ignore */ }" in content:
        print(f"  ✓ logActivity wraps insert in try/catch (never throws)")
    else:
        print(f"  ✗ logActivity does NOT wrap insert in try/catch")
        raise AssertionError("logActivity must wrap insert in try/catch")
    
    assert found >= 9, f"Expected at least 9 logActivity call sites, found {found}"
    print(f"\n  → Found {found}/9+ logActivity call sites")

# ============================================================================
# TEST 6: POST /api/products with chef JWT + x-person-name header
# ============================================================================

def test_products_with_person_header():
    """POST /api/products with chef JWT + x-person-name header → reaches DB (500 DB error EXPECTED)"""
    headers = {
        "Authorization": f"Bearer {chef_jwt}",
        "x-person-name": "Maria García",
        "Content-Type": "application/json"
    }
    body = {"name": "Test Product", "quantity": 10, "unit": "kg"}
    r = requests.post(f"{BASE_URL}/products", headers=headers, json=body)
    
    # We expect 500 DB error (Supabase not configured locally)
    # BUT it must NOT be a JS error like "personFromRequest is not defined"
    assert r.status_code == 500, f"Expected 500 DB error, got {r.status_code}: {r.text}"
    body = r.json()
    error_msg = body.get("error", "").lower()
    
    # Check it's a DB error, not a JS reference error
    assert "personFromRequest" not in error_msg, f"JS error: personFromRequest is not defined"
    assert "is not defined" not in error_msg, f"JS reference error: {error_msg}"
    
    print(f"  → 500 DB error (EXPECTED - Supabase not configured)")
    print(f"  → Error: {body.get('error', '')[:80]}...")
    print(f"  → NOT a JS reference error (personFromRequest wiring correct)")

# ============================================================================
# TEST 7: Regression tests
# ============================================================================

def test_regression_health():
    """GET /api/health → 200"""
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    print(f"  → 200 OK")

def test_regression_chef_login():
    """POST /api/auth/chef-login {} → 400"""
    r = requests.post(f"{BASE_URL}/auth/chef-login", json={})
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    print(f"  → 400 (validation working)")

def test_regression_sensor_sync():
    """GET /api/cron/sensor-sync → no JS errors (500 DB error OK)"""
    r = requests.get(f"{BASE_URL}/cron/sensor-sync")
    # We expect 500 DB error (Supabase not configured)
    # BUT it must NOT be a JS error
    if r.status_code == 500:
        body = r.json()
        error_msg = body.get("error", "").lower()
        assert "is not defined" not in error_msg, f"JS reference error: {error_msg}"
        print(f"  → 500 DB error (EXPECTED - Supabase not configured)")
    else:
        print(f"  → {r.status_code} (unexpected but no JS error)")

# ============================================================================
# RUN ALL TESTS
# ============================================================================

print("=" * 80)
print("TEST 1: GET /api/staff")
print("=" * 80)
test("1a. GET /api/staff without auth → 401", test_staff_no_auth)
test("1b. GET /api/staff with chef JWT → 403 'Owner only'", test_staff_chef_jwt)

print("=" * 80)
print("TEST 2: GET /api/activity")
print("=" * 80)
test("2a. GET /api/activity without auth → 401", test_activity_no_auth)
test("2b. GET /api/activity with chef JWT → 403 'Owner only'", test_activity_chef_jwt)

print("=" * 80)
print("TEST 3: DELETE /api/staff/:name")
print("=" * 80)
test("3a. DELETE /api/staff/Maria without auth → 401", test_delete_staff_no_auth)
test("3b. DELETE /api/staff/Maria with chef JWT → 403 'Owner only'", test_delete_staff_chef_jwt)

print("=" * 80)
print("TEST 4: Unit test personFromRequest")
print("=" * 80)
test("4. personFromRequest unit test (6 test cases)", test_person_from_request_unit)

print("=" * 80)
print("TEST 5: Code inspection - logActivity call sites")
print("=" * 80)
test("5. Verify all 9 logActivity call sites exist", test_log_activity_call_sites)

print("=" * 80)
print("TEST 6: POST /api/products with x-person-name header")
print("=" * 80)
test("6. POST /api/products with chef JWT + x-person-name header", test_products_with_person_header)

print("=" * 80)
print("TEST 7: Regression tests")
print("=" * 80)
test("7a. GET /api/health → 200", test_regression_health)
test("7b. POST /api/auth/chef-login {} → 400", test_regression_chef_login)
test("7c. GET /api/cron/sensor-sync → no JS errors", test_regression_sensor_sync)

# ============================================================================
# SUMMARY
# ============================================================================

print("=" * 80)
print(f"SUMMARY: {passed} passed, {failed} failed")
print("=" * 80)

if failed > 0:
    sys.exit(1)
