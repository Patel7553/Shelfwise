#!/usr/bin/env python3
"""
FOCUSED TEST: Receipts OCR endpoint + PUT ocrText support + GET /api/receipts regression.

CONTEXT:
- Supabase NOT configured locally → DB/perm checks return 500 "Supabase env vars missing" (EXPECTED, not a bug)
- Testing route wiring, auth gating, and input validation layers only
- Chef JWT minted using SHELFWISE_JWT_SECRET from /app/.env

WHAT TO TEST:
1. POST /api/receipts/ocr (NEW route):
   a. No auth → expect 401 (or 500 supabase-env if perm check hits DB first)
   b. With chef JWT + empty body {} → expect 400 "dataUrl or url required" OR 500 supabase-env from chefHasPerm check
   c. With chef JWT + {"dataUrl":"data:image/jpeg;base64,/9j/4AAQ"} → must NOT 404, must not crash
2. PUT /api/receipts/some-id with chef JWT + {"ocrText":"hello"} → must NOT 404, no JS crash (500 supabase-env OK)
3. REGRESSION: GET /api/receipts:
   a. No auth → expect 401 (previously 404 bug - now fixed at line 2802)
   b. With chef JWT → expect 500 supabase-env or 403, NOT 404
4. REGRESSION: GET /api/health → 200 ok
5. REGRESSION: POST /api/receipts/ai-extract with chef JWT + {} → NOT 404, validation or supabase-env error

PASS CRITERIA: no 404s on the above routes, no JavaScript crashes (ReferenceError/'is not defined'/'Cannot read properties'), all responses valid JSON.
"""

import requests
import json
import sys
import subprocess

# Get the base URL from .env
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"

def mint_chef_jwt():
    """Mint a chef JWT using SHELFWISE_JWT_SECRET from .env"""
    cmd = """cd /app && node -e "const jwt=require('/app/node_modules/jsonwebtoken'); const fs=require('fs'); const env=fs.readFileSync('/app/.env','utf8'); const sec=(env.match(/^SHELFWISE_JWT_SECRET=(.*)$/m)||[])[1]; console.log(jwt.sign({kitchen_id:'test-kitchen',role:'chef',person:'TestChef'},sec,{expiresIn:'12h'}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

def check_response(resp, test_name, expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
    """Helper to check response for common criteria"""
    results = []
    
    # Check NOT 404
    if expect_not_404 and resp.status_code == 404:
        print(f"   ❌ FAIL: Got 404 (route not wired)")
        return False
    
    # Check valid JSON
    if expect_valid_json:
        try:
            data = resp.json()
        except:
            print(f"   ❌ FAIL: Response is NOT valid JSON")
            return False
    
    # Check for JS crashes
    if expect_no_crash:
        resp_text = resp.text.lower()
        crash_indicators = ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']
        if any(x in resp_text for x in crash_indicators):
            print(f"   ❌ FAIL: JavaScript crash detected in response")
            print(f"   Response: {resp.text[:500]}")
            return False
    
    return True

def test_receipts_ocr():
    """Test receipts OCR endpoint + regressions"""
    
    print("=" * 80)
    print("FOCUSED TEST: Receipts OCR + PUT ocrText + GET /api/receipts Regression")
    print("=" * 80)
    print()
    
    # Mint chef JWT
    print("🔑 Minting chef JWT...")
    jwt_token = mint_chef_jwt()
    print(f"✅ JWT minted: {jwt_token[:20]}...")
    print()
    
    headers_with_auth = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json"
    }
    
    headers_no_auth = {
        "Content-Type": "application/json"
    }
    
    test_results = []
    
    # ========================================================================
    # TEST 1: POST /api/receipts/ocr (NEW route)
    # ========================================================================
    print("=" * 80)
    print("TEST 1: POST /api/receipts/ocr (NEW route)")
    print("=" * 80)
    
    # Test 1a: No auth → expect 401 (or 500 supabase-env if perm check hits DB first)
    print("\n📋 Test 1a: POST /api/receipts/ocr with NO auth")
    print("   Expected: 401 (or 500 if perm check hits DB first)")
    try:
        resp = requests.post(f"{BASE_URL}/receipts/ocr", headers=headers_no_auth, json={}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code in [401, 500]:
            if check_response(resp, "Test 1a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash")
                test_results.append(("Test 1a: POST /api/receipts/ocr no auth", "PASS", f"Got {resp.status_code} as expected"))
            else:
                test_results.append(("Test 1a: POST /api/receipts/ocr no auth", "FAIL", "Response validation failed"))
        else:
            print(f"   ⚠️  UNEXPECTED: Got {resp.status_code} (expected 401 or 500)")
            if check_response(resp, "Test 1a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: But response is valid (NOT 404, valid JSON, no crash)")
                test_results.append(("Test 1a: POST /api/receipts/ocr no auth", "PASS", f"Got {resp.status_code} (unexpected but valid)"))
            else:
                test_results.append(("Test 1a: POST /api/receipts/ocr no auth", "FAIL", f"Got {resp.status_code} with invalid response"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 1a: POST /api/receipts/ocr no auth", "FAIL", str(e)))
    
    # Test 1b: With chef JWT + empty body {} → expect 400 "dataUrl or url required" OR 500 supabase-env from chefHasPerm
    print("\n📋 Test 1b: POST /api/receipts/ocr with chef JWT + empty body {}")
    print("   Expected: 400 'dataUrl or url required' OR 500 supabase-env from chefHasPerm check")
    try:
        resp = requests.post(f"{BASE_URL}/receipts/ocr", headers=headers_with_auth, json={}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if resp.status_code in [400, 500]:
            if check_response(resp, "Test 1b", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                resp_lower = resp.text.lower()
                if resp.status_code == 400 and ('dataurl' in resp_lower or 'url' in resp_lower) and 'required' in resp_lower:
                    print(f"   ✅ PASS: Got 400 with 'dataUrl or url required' (validation layer working)")
                    test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "PASS", "Validation layer working"))
                elif resp.status_code == 500 and 'supabase' in resp_lower:
                    print(f"   ✅ PASS: Got 500 supabase-env (chefHasPerm check hit DB first - acceptable)")
                    test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "PASS", "chefHasPerm check hit DB first"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash")
                    test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "PASS", f"Got {resp.status_code}"))
            else:
                test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "FAIL", "Response validation failed"))
        else:
            print(f"   ⚠️  UNEXPECTED: Got {resp.status_code} (expected 400 or 500)")
            if check_response(resp, "Test 1b", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: But response is valid (NOT 404, valid JSON, no crash)")
                test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "PASS", f"Got {resp.status_code} (unexpected but valid)"))
            else:
                test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "FAIL", f"Got {resp.status_code} with invalid response"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 1b: POST /api/receipts/ocr empty body", "FAIL", str(e)))
    
    # Test 1c: With chef JWT + {"dataUrl":"data:image/jpeg;base64,/9j/4AAQ"} → must NOT 404, must not crash
    print("\n📋 Test 1c: POST /api/receipts/ocr with chef JWT + valid dataUrl")
    print("   Expected: NOT 404, no JavaScript crash (500 supabase-env OK)")
    try:
        resp = requests.post(f"{BASE_URL}/receipts/ocr", headers=headers_with_auth, json={"dataUrl": "data:image/jpeg;base64,/9j/4AAQ"}, timeout=15)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if check_response(resp, "Test 1c", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
            print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash")
            test_results.append(("Test 1c: POST /api/receipts/ocr with dataUrl", "PASS", f"Got {resp.status_code}"))
        else:
            test_results.append(("Test 1c: POST /api/receipts/ocr with dataUrl", "FAIL", "Response validation failed"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 1c: POST /api/receipts/ocr with dataUrl", "FAIL", str(e)))
    
    # ========================================================================
    # TEST 2: PUT /api/receipts/:id with ocrText
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 2: PUT /api/receipts/:id with ocrText")
    print("=" * 80)
    
    print("\n📋 Test 2a: PUT /api/receipts/some-id with chef JWT + {\"ocrText\":\"hello\"}")
    print("   Expected: NOT 404, no JavaScript crash (500 supabase-env OK)")
    try:
        resp = requests.put(f"{BASE_URL}/receipts/some-test-id", headers=headers_with_auth, json={"ocrText": "hello"}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if check_response(resp, "Test 2a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
            print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash")
            test_results.append(("Test 2a: PUT /api/receipts/:id with ocrText", "PASS", f"Got {resp.status_code}"))
        else:
            test_results.append(("Test 2a: PUT /api/receipts/:id with ocrText", "FAIL", "Response validation failed"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 2a: PUT /api/receipts/:id with ocrText", "FAIL", str(e)))
    
    # ========================================================================
    # TEST 3: REGRESSION - GET /api/receipts (previously 404 bug - now fixed)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 3: REGRESSION - GET /api/receipts (previously 404 bug - now fixed at line 2802)")
    print("=" * 80)
    
    # Test 3a: No auth → expect 401 (NOT 404)
    print("\n📋 Test 3a: GET /api/receipts with NO auth")
    print("   Expected: 401 (NOT 404 - 'receipts' now in ownerOrChef array)")
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers_no_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code == 404:
            print(f"   ❌ FAIL: Got 404 (REGRESSION! 'receipts' missing from ownerOrChef array)")
            test_results.append(("Test 3a: GET /api/receipts no auth", "FAIL", "Got 404 - regression detected"))
        elif resp.status_code == 401:
            if check_response(resp, "Test 3a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: Got 401 (NOT 404), valid JSON, no crash - FIX VERIFIED!")
                test_results.append(("Test 3a: GET /api/receipts no auth", "PASS", "Got 401 - fix verified"))
            else:
                test_results.append(("Test 3a: GET /api/receipts no auth", "FAIL", "Response validation failed"))
        else:
            print(f"   ⚠️  UNEXPECTED: Got {resp.status_code} (expected 401)")
            if check_response(resp, "Test 3a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: But response is valid (NOT 404, valid JSON, no crash)")
                test_results.append(("Test 3a: GET /api/receipts no auth", "PASS", f"Got {resp.status_code} (unexpected but valid)"))
            else:
                test_results.append(("Test 3a: GET /api/receipts no auth", "FAIL", f"Got {resp.status_code} with invalid response"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 3a: GET /api/receipts no auth", "FAIL", str(e)))
    
    # Test 3b: With chef JWT → expect 500 supabase-env or 403, NOT 404
    print("\n📋 Test 3b: GET /api/receipts with chef JWT")
    print("   Expected: 500 supabase-env or 403 (NOT 404)")
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers_with_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if resp.status_code == 404:
            print(f"   ❌ FAIL: Got 404 (REGRESSION! 'receipts' missing from ownerOrChef array)")
            test_results.append(("Test 3b: GET /api/receipts with auth", "FAIL", "Got 404 - regression detected"))
        elif check_response(resp, "Test 3b", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
            print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash - FIX VERIFIED!")
            test_results.append(("Test 3b: GET /api/receipts with auth", "PASS", f"Got {resp.status_code} - fix verified"))
        else:
            test_results.append(("Test 3b: GET /api/receipts with auth", "FAIL", "Response validation failed"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 3b: GET /api/receipts with auth", "FAIL", str(e)))
    
    # ========================================================================
    # TEST 4: REGRESSION - GET /api/health
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 4: REGRESSION - GET /api/health")
    print("=" * 80)
    
    print("\n📋 Test 4a: GET /api/health")
    print("   Expected: 200 OK")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code == 200:
            if check_response(resp, "Test 4a", expect_not_404=False, expect_valid_json=True, expect_no_crash=True):
                print(f"   ✅ PASS: Got 200, valid JSON")
                test_results.append(("Test 4a: GET /api/health", "PASS", "200 OK"))
            else:
                test_results.append(("Test 4a: GET /api/health", "FAIL", "Response validation failed"))
        else:
            print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
            test_results.append(("Test 4a: GET /api/health", "FAIL", f"Got {resp.status_code}"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 4a: GET /api/health", "FAIL", str(e)))
    
    # ========================================================================
    # TEST 5: REGRESSION - POST /api/receipts/ai-extract
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 5: REGRESSION - POST /api/receipts/ai-extract")
    print("=" * 80)
    
    print("\n📋 Test 5a: POST /api/receipts/ai-extract with chef JWT + empty body {}")
    print("   Expected: NOT 404, validation or supabase-env error")
    try:
        resp = requests.post(f"{BASE_URL}/receipts/ai-extract", headers=headers_with_auth, json={}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if check_response(resp, "Test 5a", expect_not_404=True, expect_valid_json=True, expect_no_crash=True):
            print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), valid JSON, no crash")
            test_results.append(("Test 5a: POST /api/receipts/ai-extract", "PASS", f"Got {resp.status_code}"))
        else:
            test_results.append(("Test 5a: POST /api/receipts/ai-extract", "FAIL", "Response validation failed"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 5a: POST /api/receipts/ai-extract", "FAIL", str(e)))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result, _ in test_results if result == "PASS")
    failed = sum(1 for _, result, _ in test_results if result == "FAIL")
    
    for test_name, result, note in test_results:
        emoji = "✅" if result == "PASS" else "❌"
        print(f"{emoji} {test_name}: {result} ({note})")
    
    print()
    print(f"Total: {len(test_results)} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print()
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED!")
        print()
        print("KEY FINDINGS:")
        print("- ✅ POST /api/receipts/ocr correctly wired (NOT 404)")
        print("- ✅ PUT /api/receipts/:id with ocrText correctly wired (NOT 404)")
        print("- ✅ GET /api/receipts FIX VERIFIED (NOT 404 anymore - 'receipts' now in ownerOrChef array)")
        print("- ✅ All responses are valid JSON")
        print("- ✅ No JavaScript crashes detected")
        return 0
    else:
        print(f"⚠️  {failed} test(s) failed. Please review the failures above.")
        return 1

if __name__ == "__main__":
    sys.exit(test_receipts_ocr())
