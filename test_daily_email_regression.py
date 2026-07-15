#!/usr/bin/env python3
"""
Regression test for daily-email helper addition.
Tests POST /api/push/heartbeat and GET /api/cron/push-alerts after adding runDailyExpiryEmailForKitchen.

CRITICAL: Supabase env vars NOT configured locally → any request reaching a Supabase call 
returns 500 supabase/fetch error = EXPECTED = correct wiring, NOT a bug.

Flag ONLY 404s or JS crash errors (ReferenceError/TypeError/SyntaxError) in response bodies.
"""

import os
import requests
import json

# Read base URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.strip().split('=', 1)[1] + '/api'
            break

if not BASE_URL:
    raise Exception("NEXT_PUBLIC_BASE_URL not found in /app/.env")

print(f"Testing against: {BASE_URL}\n")

# Generate chef JWT
import subprocess
result = subprocess.run(
    ['bash', '-c', 'cd /app && export $(grep SHELFWISE_JWT_SECRET .env | xargs) && node -e "console.log(require(\'/app/node_modules/jsonwebtoken\').sign({kitchen_id:\'test-kitchen\',role:\'chef\'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:\'1h\'}))"'],
    capture_output=True,
    text=True
)
CHEF_JWT = result.stdout.strip()
print(f"Generated chef JWT: {CHEF_JWT[:50]}...\n")

# Test counters
passed = 0
failed = 0

def check_for_js_errors(response_text, response_json=None):
    """Check if response contains JS crash errors (ReferenceError/TypeError/SyntaxError)"""
    error_keywords = ['ReferenceError', 'TypeError', 'SyntaxError', 'is not defined', 'Cannot read property']
    
    # Check in response text
    for keyword in error_keywords:
        if keyword in response_text:
            return True, keyword
    
    # Check in JSON error field
    if response_json and isinstance(response_json, dict):
        error_msg = response_json.get('error', '')
        if isinstance(error_msg, str):
            for keyword in error_keywords:
                if keyword in error_msg:
                    return True, keyword
    
    return False, None

print("=" * 80)
print("TEST 1: POST /api/push/heartbeat with chef JWT, body {}")
print("=" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/push/heartbeat",
        headers={
            'Authorization': f'Bearer {CHEF_JWT}',
            'Content-Type': 'application/json'
        },
        json={},
        timeout=30
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    # Parse JSON
    try:
        response_json = response.json()
        print(f"JSON: {json.dumps(response_json, indent=2)[:500]}")
    except:
        response_json = None
    
    # Check for 404
    if response.status_code == 404:
        print("❌ FAIL: Endpoint returned 404 (not found)")
        failed += 1
    else:
        # Check for JS crash errors
        has_js_error, error_keyword = check_for_js_errors(response.text, response_json)
        if has_js_error:
            print(f"❌ FAIL: Response contains JS crash error: {error_keyword}")
            print(f"   Specifically checking for 'runDailyExpiryEmailForKitchen' error...")
            if 'runDailyExpiryEmailForKitchen' in response.text:
                print(f"   ⚠️  CRITICAL: Found 'runDailyExpiryEmailForKitchen' reference error!")
            failed += 1
        else:
            # Expected: 200 with {ok:false,...} or 500 with supabase error
            if response.status_code in [200, 500]:
                print(f"✅ PASS: Endpoint working correctly (status {response.status_code}, no JS crash)")
                if response_json:
                    if 'ok' in response_json:
                        print(f"   Response has 'ok' field: {response_json.get('ok')}")
                    if 'error' in response_json:
                        print(f"   Error message: {response_json.get('error')[:200]}")
                        if 'supabase' in response_json.get('error', '').lower():
                            print(f"   ✓ Supabase error (EXPECTED - Supabase not configured locally)")
                passed += 1
            else:
                print(f"⚠️  Unexpected status code: {response.status_code}")
                passed += 1  # Still pass if no JS crash
    
except Exception as e:
    print(f"❌ FAIL: Exception occurred: {e}")
    failed += 1

print("\n")

print("=" * 80)
print("TEST 2: POST /api/push/heartbeat with NO auth")
print("=" * 80)
try:
    response = requests.post(
        f"{BASE_URL}/push/heartbeat",
        headers={'Content-Type': 'application/json'},
        json={},
        timeout=30
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 401:
        print("✅ PASS: Correctly returned 401 (Not authenticated)")
        passed += 1
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
        failed += 1
    
except Exception as e:
    print(f"❌ FAIL: Exception occurred: {e}")
    failed += 1

print("\n")

print("=" * 80)
print("TEST 3: GET /api/cron/push-alerts (no auth header; CRON_SECRET not set locally)")
print("=" * 80)
try:
    response = requests.get(
        f"{BASE_URL}/cron/push-alerts",
        timeout=30
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    # Parse JSON
    try:
        response_json = response.json()
        print(f"JSON: {json.dumps(response_json, indent=2)[:500]}")
    except:
        response_json = None
    
    # Check for 404
    if response.status_code == 404:
        print("❌ FAIL: Endpoint returned 404 (not found)")
        failed += 1
    else:
        # Check for JS crash errors
        has_js_error, error_keyword = check_for_js_errors(response.text, response_json)
        if has_js_error:
            print(f"❌ FAIL: Response contains JS crash error: {error_keyword}")
            print(f"   Specifically checking for 'runDailyExpiryEmailForKitchen' error...")
            if 'runDailyExpiryEmailForKitchen' in response.text:
                print(f"   ⚠️  CRITICAL: Found 'runDailyExpiryEmailForKitchen' reference error!")
            failed += 1
        else:
            # Expected: 500 with supabase error or 200 with note
            if response.status_code in [200, 500]:
                print(f"✅ PASS: Endpoint working correctly (status {response.status_code}, no JS crash)")
                if response_json:
                    if 'ok' in response_json:
                        print(f"   Response has 'ok' field: {response_json.get('ok')}")
                    if 'error' in response_json:
                        print(f"   Error message: {response_json.get('error')[:200]}")
                    if 'note' in response_json:
                        print(f"   Note: {response_json.get('note')[:200]}")
                    # Check if it's a supabase error
                    error_msg = str(response_json.get('error', ''))
                    if 'supabase' in error_msg.lower() or 'does not exist' in error_msg.lower():
                        print(f"   ✓ Supabase/DB error (EXPECTED - Supabase not configured locally)")
                passed += 1
            else:
                print(f"⚠️  Unexpected status code: {response.status_code}")
                passed += 1  # Still pass if no JS crash
    
except Exception as e:
    print(f"❌ FAIL: Exception occurred: {e}")
    failed += 1

print("\n")

print("=" * 80)
print("TEST 4: GET /api/auth/me no auth (general regression)")
print("=" * 80)
try:
    response = requests.get(
        f"{BASE_URL}/auth/me",
        timeout=30
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 401:
        print("✅ PASS: Correctly returned 401 (Not authenticated)")
        passed += 1
    else:
        print(f"❌ FAIL: Expected 401, got {response.status_code}")
        failed += 1
    
except Exception as e:
    print(f"❌ FAIL: Exception occurred: {e}")
    failed += 1

print("\n")

print("=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Total tests: {passed + failed}")
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print()

if failed == 0:
    print("🎉 ALL TESTS PASSED - No 404s or JS crash errors detected!")
    print()
    print("Key findings:")
    print("- POST /api/push/heartbeat with chef JWT: Working correctly (no ReferenceError about runDailyExpiryEmailForKitchen)")
    print("- POST /api/push/heartbeat without auth: Correctly returns 401")
    print("- GET /api/cron/push-alerts: Working correctly (no ReferenceError/TypeError)")
    print("- GET /api/auth/me without auth: Correctly returns 401")
    print()
    print("Expected behavior:")
    print("- Supabase errors (500) are EXPECTED since Supabase is not configured locally")
    print("- This proves the wiring is correct and the code reaches the DB step")
else:
    print("⚠️  SOME TESTS FAILED - Review the output above for details")

exit(0 if failed == 0 else 1)
