#!/usr/bin/env python3
"""
Backend test for Receipts feature + product edit attribution regression.
Tests the NEW receipts endpoints + 3 updates (header identity, edit attribution, product note).

ENVIRONMENT: Supabase NOT configured locally — DB/storage-hitting endpoints return 500 supabase-env errors which are EXPECTED (wiring PASS).
FAILURES = 404 on these routes, non-JSON responses, or JS crash messages (ReferenceError/TypeError, "is not defined", "Cannot read properties").
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

def test_receipts_endpoints():
    """Test all receipts endpoints + regression tests"""
    
    print("=" * 80)
    print("RECEIPTS FEATURE + PRODUCT EDIT ATTRIBUTION — Backend Wiring Test")
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
    # TEST 1: GET /api/receipts
    # ========================================================================
    print("=" * 80)
    print("TEST 1: GET /api/receipts")
    print("=" * 80)
    
    # Test 1a: No auth -> 401
    print("\n📋 Test 1a: GET /api/receipts with NO auth → should return 401")
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers_no_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code == 401:
            try:
                data = resp.json()
                print("   ✅ PASS: 401 returned, response is valid JSON")
                test_results.append(("Test 1a: GET /api/receipts no auth", "PASS"))
            except:
                print("   ❌ FAIL: 401 returned but response is NOT valid JSON")
                test_results.append(("Test 1a: GET /api/receipts no auth", "FAIL"))
        else:
            print(f"   ❌ FAIL: Expected 401, got {resp.status_code}")
            test_results.append(("Test 1a: GET /api/receipts no auth", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 1a: GET /api/receipts no auth", "FAIL"))
    
    # Test 1b: With chef JWT -> 500 supabase-env (not 404), JSON
    print("\n📋 Test 1b: GET /api/receipts with chef JWT → should return 500 supabase-env (not 404), JSON")
    try:
        resp = requests.get(f"{BASE_URL}/receipts", headers=headers_with_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 1b: GET /api/receipts with auth", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 1b: GET /api/receipts with auth", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes")
                    test_results.append(("Test 1b: GET /api/receipts with auth", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 1b: GET /api/receipts with auth", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 1b: GET /api/receipts with auth", "FAIL"))
    
    # ========================================================================
    # TEST 2: POST /api/receipts
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 2: POST /api/receipts")
    print("=" * 80)
    
    # Test 2a: No auth -> 401
    print("\n📋 Test 2a: POST /api/receipts with NO auth → should return 401")
    try:
        resp = requests.post(f"{BASE_URL}/receipts", headers=headers_no_auth, json={"supplier": "Test Co"}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code == 401:
            try:
                data = resp.json()
                print("   ✅ PASS: 401 returned, response is valid JSON")
                test_results.append(("Test 2a: POST /api/receipts no auth", "PASS"))
            except:
                print("   ❌ FAIL: 401 returned but response is NOT valid JSON")
                test_results.append(("Test 2a: POST /api/receipts no auth", "FAIL"))
        else:
            print(f"   ❌ FAIL: Expected 401, got {resp.status_code}")
            test_results.append(("Test 2a: POST /api/receipts no auth", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 2a: POST /api/receipts no auth", "FAIL"))
    
    # Test 2b: Chef JWT + {"supplier":"Test Co","amount":12.5} -> 500 supabase-env (reaches insert), no crash
    print("\n📋 Test 2b: POST /api/receipts with chef JWT + supplier/amount → should reach insert (500 supabase-env), no crash")
    try:
        resp = requests.post(f"{BASE_URL}/receipts", headers=headers_with_auth, json={"supplier": "Test Co", "amount": 12.5}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 2b: POST /api/receipts with supplier/amount", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 2b: POST /api/receipts with supplier/amount", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes")
                    test_results.append(("Test 2b: POST /api/receipts with supplier/amount", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 2b: POST /api/receipts with supplier/amount", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 2b: POST /api/receipts with supplier/amount", "FAIL"))
    
    # Test 2c: Chef JWT + {"dataUrl":"data:text/plain;base64,aGk="} -> 400 "Unsupported file type"
    print("\n📋 Test 2c: POST /api/receipts with chef JWT + invalid dataUrl → should return 400 'Unsupported file type'")
    try:
        resp = requests.post(f"{BASE_URL}/receipts", headers=headers_with_auth, json={"dataUrl": "data:text/plain;base64,aGk="}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if resp.status_code == 400:
            try:
                data = resp.json()
                if 'unsupported' in resp.text.lower() or 'file type' in resp.text.lower():
                    print("   ✅ PASS: 400 returned with 'Unsupported file type' message")
                    test_results.append(("Test 2c: POST /api/receipts invalid dataUrl", "PASS"))
                else:
                    print(f"   ❌ FAIL: 400 returned but wrong error message: {resp.text}")
                    test_results.append(("Test 2c: POST /api/receipts invalid dataUrl", "FAIL"))
            except:
                print("   ❌ FAIL: 400 returned but response is NOT valid JSON")
                test_results.append(("Test 2c: POST /api/receipts invalid dataUrl", "FAIL"))
        else:
            print(f"   ❌ FAIL: Expected 400, got {resp.status_code}")
            test_results.append(("Test 2c: POST /api/receipts invalid dataUrl", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 2c: POST /api/receipts invalid dataUrl", "FAIL"))
    
    # ========================================================================
    # TEST 3: POST /api/receipts/ai-extract
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 3: POST /api/receipts/ai-extract")
    print("=" * 80)
    
    # Test 3a: Chef JWT + {} -> 400 "dataUrl required" (validation runs before AI call)
    print("\n📋 Test 3a: POST /api/receipts/ai-extract with chef JWT + empty body → should return 400 'dataUrl required'")
    try:
        resp = requests.post(f"{BASE_URL}/receipts/ai-extract", headers=headers_with_auth, json={}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        if resp.status_code == 400:
            try:
                data = resp.json()
                if 'dataurl' in resp.text.lower() and 'required' in resp.text.lower():
                    print("   ✅ PASS: 400 returned with 'dataUrl required' message")
                    test_results.append(("Test 3a: POST /api/receipts/ai-extract empty body", "PASS"))
                else:
                    print(f"   ❌ FAIL: 400 returned but wrong error message: {resp.text}")
                    test_results.append(("Test 3a: POST /api/receipts/ai-extract empty body", "FAIL"))
            except:
                print("   ❌ FAIL: 400 returned but response is NOT valid JSON")
                test_results.append(("Test 3a: POST /api/receipts/ai-extract empty body", "FAIL"))
        else:
            print(f"   ❌ FAIL: Expected 400, got {resp.status_code}")
            test_results.append(("Test 3a: POST /api/receipts/ai-extract empty body", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 3a: POST /api/receipts/ai-extract empty body", "FAIL"))
    
    # ========================================================================
    # TEST 4: PUT /api/receipts/:id
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 4: PUT /api/receipts/:id")
    print("=" * 80)
    
    # Test 4a: PUT /api/receipts/some-id with chef JWT + {"status":"submitted"} -> 500 supabase-env, no crash
    print("\n📋 Test 4a: PUT /api/receipts/some-id with chef JWT → should reach DB (500 supabase-env), no crash")
    try:
        resp = requests.put(f"{BASE_URL}/receipts/some-test-id", headers=headers_with_auth, json={"status": "submitted"}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 4a: PUT /api/receipts/:id", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 4a: PUT /api/receipts/:id", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes")
                    test_results.append(("Test 4a: PUT /api/receipts/:id", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 4a: PUT /api/receipts/:id", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 4a: PUT /api/receipts/:id", "FAIL"))
    
    # ========================================================================
    # TEST 5: DELETE /api/receipts/:id
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 5: DELETE /api/receipts/:id")
    print("=" * 80)
    
    # Test 5a: DELETE /api/receipts/some-id with chef JWT -> 500 supabase-env or JSON error, not 404, no crash
    print("\n📋 Test 5a: DELETE /api/receipts/some-id with chef JWT → should reach DB (500 or JSON error), not 404, no crash")
    try:
        resp = requests.delete(f"{BASE_URL}/receipts/some-test-id", headers=headers_with_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 5a: DELETE /api/receipts/:id", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 5a: DELETE /api/receipts/:id", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes")
                    test_results.append(("Test 5a: DELETE /api/receipts/:id", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 5a: DELETE /api/receipts/:id", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 5a: DELETE /api/receipts/:id", "FAIL"))
    
    # ========================================================================
    # TEST 6: REGRESSION - Product endpoints (edit attribution + note)
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 6: REGRESSION - Product endpoints (edit attribution + note)")
    print("=" * 80)
    
    # Test 6a: PUT /api/products/some-id with chef JWT + {"name":"X","quantity":1,"note":"test note"} -> 500 supabase-env, no crash
    print("\n📋 Test 6a: PUT /api/products/some-id with chef JWT + note → should reach DB (500 supabase-env), no crash (new edit-attribution code path)")
    try:
        resp = requests.put(f"{BASE_URL}/products/some-test-id", headers=headers_with_auth, json={"name": "X", "quantity": 1, "note": "test note"}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 6a: PUT /api/products/:id with note", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 6a: PUT /api/products/:id with note", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes (edit attribution working)")
                    test_results.append(("Test 6a: PUT /api/products/:id with note", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 6a: PUT /api/products/:id with note", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 6a: PUT /api/products/:id with note", "FAIL"))
    
    # Test 6b: POST /api/products with chef JWT + {"name":"Y"} -> 500 supabase-env
    print("\n📋 Test 6b: POST /api/products with chef JWT → should reach DB (500 supabase-env), no crash")
    try:
        resp = requests.post(f"{BASE_URL}/products", headers=headers_with_auth, json={"name": "Y"}, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 6b: POST /api/products", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for JS crashes
                resp_text = resp.text.lower()
                if any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response")
                    test_results.append(("Test 6b: POST /api/products", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, no JS crashes")
                    test_results.append(("Test 6b: POST /api/products", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 6b: POST /api/products", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 6b: POST /api/products", "FAIL"))
    
    # Test 6c: GET /api/products with chef JWT -> 500 supabase-env (CRITICAL: check for "url is not defined" / "status is not defined" crash!)
    print("\n📋 Test 6c: GET /api/products with chef JWT → should reach DB (500 supabase-env), NO 'url is not defined' / 'status is not defined' crash!")
    print("   ⚠️  CRITICAL: Main agent edited this handler's variable declarations — confirm no ReferenceError!")
    try:
        resp = requests.get(f"{BASE_URL}/products", headers=headers_with_auth, timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")
        
        # Check it's NOT 404
        if resp.status_code == 404:
            print("   ❌ FAIL: Got 404 (route not wired)")
            test_results.append(("Test 6c: GET /api/products (CRITICAL)", "FAIL"))
        else:
            # Check response is valid JSON
            try:
                data = resp.json()
                # Check for SPECIFIC JS crashes mentioned in review_request
                resp_text = resp.text.lower()
                if 'url is not defined' in resp_text or 'status is not defined' in resp_text:
                    print(f"   ❌ FAIL: REGRESSION DETECTED! Variable declaration error: {resp.text}")
                    test_results.append(("Test 6c: GET /api/products (CRITICAL)", "FAIL"))
                elif any(x in resp_text for x in ['referenceerror', 'typeerror', 'is not defined', 'cannot read properties']):
                    print(f"   ❌ FAIL: JavaScript crash detected in response: {resp.text}")
                    test_results.append(("Test 6c: GET /api/products (CRITICAL)", "FAIL"))
                else:
                    print(f"   ✅ PASS: Got {resp.status_code} (NOT 404), response is valid JSON, NO variable declaration crashes!")
                    test_results.append(("Test 6c: GET /api/products (CRITICAL)", "PASS"))
            except:
                print("   ❌ FAIL: Response is NOT valid JSON")
                test_results.append(("Test 6c: GET /api/products (CRITICAL)", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 6c: GET /api/products (CRITICAL)", "FAIL"))
    
    # ========================================================================
    # TEST 7: REGRESSION - Health endpoint
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST 7: REGRESSION - Health endpoint")
    print("=" * 80)
    
    # Test 7a: GET /api/health -> 200
    print("\n📋 Test 7a: GET /api/health → should return 200")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:200]}")
        
        if resp.status_code == 200:
            try:
                data = resp.json()
                print("   ✅ PASS: 200 returned, response is valid JSON")
                test_results.append(("Test 7a: GET /api/health", "PASS"))
            except:
                print("   ❌ FAIL: 200 returned but response is NOT valid JSON")
                test_results.append(("Test 7a: GET /api/health", "FAIL"))
        else:
            print(f"   ❌ FAIL: Expected 200, got {resp.status_code}")
            test_results.append(("Test 7a: GET /api/health", "FAIL"))
    except Exception as e:
        print(f"   ❌ FAIL: Exception: {e}")
        test_results.append(("Test 7a: GET /api/health", "FAIL"))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in test_results if result == "PASS")
    failed = sum(1 for _, result in test_results if result == "FAIL")
    
    for test_name, result in test_results:
        emoji = "✅" if result == "PASS" else "❌"
        print(f"{emoji} {test_name}: {result}")
    
    print()
    print(f"Total: {len(test_results)} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print()
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED! Receipts feature + product edit attribution wiring is correct.")
        return 0
    else:
        print(f"⚠️  {failed} test(s) failed. Please review the failures above.")
        return 1

if __name__ == "__main__":
    sys.exit(test_receipts_endpoints())
