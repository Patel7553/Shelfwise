#!/usr/bin/env python3
"""
Backend regression test for Session-authoritative attribution rewrite.
Tests that validatedPersonFromRequest changes did NOT introduce runtime crashes.
Attribution LOGIC already verified by 9/9 unit tests — this only checks wiring/gating.
"""

import requests
import json
import sys

# Chef JWT minted with SHELFWISE_JWT_SECRET
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoidGVzdC1raXRjaGVuIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJUZXN0Q2hlZiIsImlhdCI6MTc4NTE2NzcxOCwiZXhwIjoxNzg1MjEwOTE4fQ.T6ASrERULZI-lJqcjP-sbn_b_I_ZUo2Rk6yJNX5n1Go"

# Read NEXT_PUBLIC_BASE_URL from .env
with open('/app/.env', 'r') as f:
    env_content = f.read()
    for line in env_content.split('\n'):
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break
    else:
        BASE_URL = "http://localhost:3000"

API_BASE = f"{BASE_URL}/api"

print(f"Testing against: {API_BASE}")
print(f"Chef JWT: {CHEF_JWT[:50]}...")
print("=" * 80)

passed = 0
failed = 0

def test(name, method, path, headers=None, json_body=None, expect_status=None, expect_json_key=None, expect_no_crash=True):
    global passed, failed
    url = f"{API_BASE}{path}"
    print(f"\n[TEST] {name}")
    print(f"  {method} {path}")
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers or {}, timeout=30)
        elif method == "POST":
            resp = requests.post(url, headers=headers or {}, json=json_body, timeout=30)
        elif method == "PUT":
            resp = requests.put(url, headers=headers or {}, json=json_body, timeout=30)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers or {}, json=json_body, timeout=30)
        
        print(f"  Status: {resp.status_code}")
        
        # Check status
        if expect_status and resp.status_code != expect_status:
            print(f"  ❌ FAIL: Expected {expect_status}, got {resp.status_code}")
            print(f"  Response: {resp.text[:200]}")
            failed += 1
            return False
        
        # Check JSON parseable
        try:
            data = resp.json()
            print(f"  Response: {json.dumps(data, indent=2)[:300]}")
        except:
            print(f"  Response (non-JSON): {resp.text[:200]}")
            if expect_no_crash:
                print(f"  ❌ FAIL: Expected JSON response, got non-JSON")
                failed += 1
                return False
        
        # Check for JS crashes in response
        if expect_no_crash:
            text = resp.text.lower()
            crash_indicators = [
                "is not defined",
                "cannot read properties",
                "typeerror",
                "referenceerror",
                "syntaxerror",
                "unexpected token"
            ]
            for indicator in crash_indicators:
                if indicator in text and "supabase" not in text:  # Supabase errors are OK
                    print(f"  ❌ FAIL: JavaScript crash detected: '{indicator}' in response")
                    print(f"  Response: {resp.text[:500]}")
                    failed += 1
                    return False
        
        # Check expected JSON key
        if expect_json_key:
            try:
                data = resp.json()
                if expect_json_key not in data:
                    print(f"  ❌ FAIL: Expected key '{expect_json_key}' not in response")
                    failed += 1
                    return False
            except:
                pass
        
        print(f"  ✅ PASS")
        passed += 1
        return True
        
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        failed += 1
        return False

# Test 1: GET /api/health -> 200
test(
    "Test 1: GET /api/health",
    "GET", "/health",
    expect_status=200,
    expect_json_key="ok"
)

# Test 2: POST /api/products with chef JWT + x-person-name header -> 500 supabase-env (NOT JS crash)
test(
    "Test 2: POST /api/products with chef JWT + x-person-name header (ALSO send header)",
    "POST", "/products",
    headers={
        "Authorization": f"Bearer {CHEF_JWT}",
        "x-person-name": "Parth"
    },
    json_body={"name": "Test Item", "quantity": 1, "unit": "kg"},
    expect_status=500,
    expect_no_crash=True
)

# Test 3: POST /api/products with x-person-name header but NO auth -> 401
test(
    "Test 3: POST /api/products with x-person-name header but NO auth",
    "POST", "/products",
    headers={"x-person-name": "Parth"},
    json_body={"name": "Test Item", "quantity": 1, "unit": "kg"},
    expect_status=401
)

# Test 4a: GET /api/auth/me no auth -> 401
test(
    "Test 4a: GET /api/auth/me no auth",
    "GET", "/auth/me",
    expect_status=401,
    expect_json_key="authed"
)

# Test 4b: GET /api/auth/me with chef JWT + x-person-name header -> JSON response, no crash
test(
    "Test 4b: GET /api/auth/me with chef JWT + x-person-name header",
    "GET", "/auth/me",
    headers={
        "Authorization": f"Bearer {CHEF_JWT}",
        "x-person-name": "Parth"
    },
    expect_no_crash=True
)

# Test 5a: POST /api/staff/owner-name no auth -> 401
test(
    "Test 5a: POST /api/staff/owner-name no auth",
    "POST", "/staff/owner-name",
    json_body={"name": "Test Owner"},
    expect_status=401
)

# Test 5b: POST /api/staff/owner-name with chef JWT -> 403 "Owner only"
test(
    "Test 5b: POST /api/staff/owner-name with chef JWT",
    "POST", "/staff/owner-name",
    headers={"Authorization": f"Bearer {CHEF_JWT}"},
    json_body={"name": "Test Owner"},
    expect_status=403
)

# Test 6: POST /api/staff/pin-login with chef JWT + {"pin":"1234"} -> reaches supabase step (500), no crash
test(
    "Test 6: POST /api/staff/pin-login with chef JWT",
    "POST", "/staff/pin-login",
    headers={"Authorization": f"Bearer {CHEF_JWT}"},
    json_body={"pin": "1234"},
    expect_status=500,
    expect_no_crash=True
)

# Test 7a: POST /api/waste with chef JWT + x-person-name header -> reach supabase step (500) or validation 400, no crash
test(
    "Test 7a: POST /api/waste with chef JWT + x-person-name header",
    "POST", "/waste",
    headers={
        "Authorization": f"Bearer {CHEF_JWT}",
        "x-person-name": "Parth"
    },
    json_body={"productId": "test-id", "quantity": 1, "reason": "spoiled"},
    expect_no_crash=True
)

# Test 7b: POST /api/haccp/temperatures with chef JWT + x-person-name header -> reach supabase step (500) or validation 400, no crash
test(
    "Test 7b: POST /api/haccp/temperatures with chef JWT + x-person-name header",
    "POST", "/haccp/temperatures",
    headers={
        "Authorization": f"Bearer {CHEF_JWT}",
        "x-person-name": "Parth"
    },
    json_body={"location": "Fridge", "temperature": 4, "recordedAt": "2026-08-15T10:00:00Z"},
    expect_no_crash=True
)

print("\n" + "=" * 80)
print(f"RESULTS: {passed} passed, {failed} failed")
print("=" * 80)

if failed > 0:
    sys.exit(1)
