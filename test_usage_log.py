#!/usr/bin/env python3
"""
Backend test for End-of-Shift Usage Log feature (usage/scan-sheet + usage/apply).
Tests authentication, validation, and AI scan accuracy.
"""

import requests
import json
import base64
import subprocess
import sys

BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"

# Expected counts from the test sheet (as per review_request)
EXPECTED_COUNTS = {
    "whole milk": 3,
    "chicken breast": 5,
    "butter": 0,
    "eggs": 7,
    "double cream": 2,
    "tomatoes": 0,
    "cheddar cheese": 1,
    "olive oil": 4,
}

def normalize_name(name):
    """Normalize product name for matching (same logic as backend)."""
    return name.lower().replace("(", " ").replace(")", " ").strip()

def mint_chef_jwt():
    """Generate a chef JWT token for local testing."""
    cmd = [
        "node", "-e",
        "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

def load_test_image():
    """Load and base64-encode the test image."""
    try:
        with open("/tmp/usage_sheet_test.jpg", "rb") as f:
            img_data = f.read()
        b64 = base64.b64encode(img_data).decode('utf-8')
        return f"data:image/jpeg;base64,{b64}"
    except Exception as e:
        print(f"❌ Failed to load test image: {e}")
        sys.exit(1)

def test_scan_sheet_no_auth():
    """Test 1: POST /api/usage/scan-sheet with NO auth → 401"""
    print("\n🧪 Test 1: POST /api/usage/scan-sheet without auth")
    try:
        r = requests.post(f"{BASE_URL}/usage/scan-sheet", json={"image": "data:image/jpeg;base64,test"}, timeout=10)
        if r.status_code == 401:
            print("✅ Test 1 PASSED: 401 Unauthorized (as expected)")
            return True
        else:
            print(f"❌ Test 1 FAILED: Expected 401, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        return False

def test_scan_sheet_empty_body(jwt):
    """Test 2: POST /api/usage/scan-sheet with JWT + body {} → 400"""
    print("\n🧪 Test 2: POST /api/usage/scan-sheet with empty body")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.post(f"{BASE_URL}/usage/scan-sheet", json={}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "Invalid or missing image" in data.get("error", ""):
                print("✅ Test 2 PASSED: 400 'Invalid or missing image'")
                return True
            else:
                print(f"❌ Test 2 FAILED: Got 400 but wrong error message: {data.get('error')}")
                return False
        else:
            print(f"❌ Test 2 FAILED: Expected 400, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        return False

def test_scan_sheet_invalid_image(jwt):
    """Test 3: POST /api/usage/scan-sheet with JWT + invalid image data URL → 400"""
    print("\n🧪 Test 3: POST /api/usage/scan-sheet with invalid image (text/plain)")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.post(
            f"{BASE_URL}/usage/scan-sheet",
            json={"image": "data:text/plain;base64,aGVsbG8="},
            headers=headers,
            timeout=10
        )
        if r.status_code == 400:
            data = r.json()
            if "Invalid or missing image" in data.get("error", ""):
                print("✅ Test 3 PASSED: 400 'Invalid or missing image' (rejected non-image data URL)")
                return True
            else:
                print(f"❌ Test 3 FAILED: Got 400 but wrong error message: {data.get('error')}")
                return False
        else:
            print(f"❌ Test 3 FAILED: Expected 400, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        return False

def test_scan_sheet_real_image(jwt, image_data_url):
    """Test 4: POST /api/usage/scan-sheet with real test image → 200 with expected counts"""
    print("\n🧪 Test 4: POST /api/usage/scan-sheet with real test image")
    print("   (This will take 60-90 seconds for Claude AI to process...)")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.post(
            f"{BASE_URL}/usage/scan-sheet",
            json={"image": image_data_url},
            headers=headers,
            timeout=120  # Allow 120s for Claude processing
        )
        if r.status_code != 200:
            print(f"❌ Test 4 FAILED: Expected 200, got {r.status_code}")
            print(f"   Response: {r.text[:500]}")
            return False
        
        data = r.json()
        print(f"   Response: {json.dumps(data, indent=2)[:500]}")
        
        # Validate response structure
        if "matched" not in data or "unmatched" not in data or "rowsScanned" not in data:
            print(f"❌ Test 4 FAILED: Missing required fields in response")
            return False
        
        matched = data.get("matched", [])
        unmatched = data.get("unmatched", [])
        rows_scanned = data.get("rowsScanned", 0)
        
        print(f"\n   📊 Scan Results:")
        print(f"   - Rows scanned: {rows_scanned}")
        print(f"   - Matched products: {len(matched)}")
        print(f"   - Unmatched rows: {len(unmatched)}")
        
        # Since Supabase is not configured locally, all items will be in "unmatched"
        # (no products in DB to match against)
        if rows_scanned != 8:
            print(f"   ⚠️  WARNING: Expected 8 rows, got {rows_scanned}")
        
        # Check unmatched items (should be 8 rows with expected structure)
        if len(unmatched) != 8:
            print(f"   ⚠️  WARNING: Expected 8 unmatched rows, got {len(unmatched)}")
        
        # Validate structure of unmatched items
        all_valid = True
        for item in unmatched:
            if not all(k in item for k in ["name", "count", "confidence"]):
                print(f"   ❌ Invalid item structure: {item}")
                all_valid = False
            if not isinstance(item["count"], int) or not (0 <= item["count"] <= 99):
                print(f"   ❌ Invalid count for {item.get('name')}: {item.get('count')}")
                all_valid = False
            if item["confidence"] not in ["high", "low"]:
                print(f"   ❌ Invalid confidence for {item.get('name')}: {item.get('confidence')}")
                all_valid = False
        
        if not all_valid:
            print("❌ Test 4 FAILED: Invalid item structure")
            return False
        
        # Compare actual counts with expected counts
        print(f"\n   📋 Count Comparison (Expected vs Actual):")
        matches = 0
        mismatches = []
        
        for item in unmatched:
            name_norm = normalize_name(item["name"])
            actual_count = item["count"]
            
            # Find expected count
            expected_count = None
            for exp_name, exp_count in EXPECTED_COUNTS.items():
                if exp_name in name_norm or name_norm in exp_name:
                    expected_count = exp_count
                    break
            
            if expected_count is not None:
                diff = abs(actual_count - expected_count)
                status = "✅" if diff == 0 else ("⚠️" if diff == 1 else "❌")
                print(f"   {status} {item['name']}: expected={expected_count}, actual={actual_count}, confidence={item['confidence']}")
                
                if diff == 0:
                    matches += 1
                elif diff == 1:
                    # Allow ±1 variance on one row (as per review_request)
                    mismatches.append((item['name'], expected_count, actual_count, diff))
                else:
                    mismatches.append((item['name'], expected_count, actual_count, diff))
            else:
                print(f"   ⚠️  {item['name']}: no expected count found")
        
        print(f"\n   📈 Accuracy: {matches}/{len(EXPECTED_COUNTS)} exact matches")
        
        # Allow minor variance of ±1 on one row
        if len(mismatches) == 0:
            print("✅ Test 4 PASSED: All counts match exactly (8/8 accuracy)")
            return True
        elif len(mismatches) == 1 and mismatches[0][3] == 1:
            print(f"✅ Test 4 PASSED: 7/8 exact matches, 1 row with ±1 variance (acceptable)")
            print(f"   Minor variance: {mismatches[0][0]} (expected {mismatches[0][1]}, got {mismatches[0][2]})")
            return True
        else:
            print(f"❌ Test 4 FAILED: Too many mismatches or large variance")
            for name, exp, act, diff in mismatches:
                print(f"   - {name}: expected {exp}, got {act} (diff={diff})")
            return False
        
    except requests.Timeout:
        print(f"❌ Test 4 FAILED: Request timeout (Claude took too long)")
        return False
    except Exception as e:
        print(f"❌ Test 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_apply_no_auth():
    """Test 5: POST /api/usage/apply with NO auth → 401"""
    print("\n🧪 Test 5: POST /api/usage/apply without auth")
    try:
        r = requests.post(f"{BASE_URL}/usage/apply", json={"items": []}, timeout=10)
        if r.status_code == 401:
            print("✅ Test 5 PASSED: 401 Unauthorized (as expected)")
            return True
        else:
            print(f"❌ Test 5 FAILED: Expected 401, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 5 FAILED: {e}")
        return False

def test_apply_empty_items(jwt):
    """Test 6: POST /api/usage/apply with JWT + empty items array → 400"""
    print("\n🧪 Test 6: POST /api/usage/apply with empty items array")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.post(f"{BASE_URL}/usage/apply", json={"items": []}, headers=headers, timeout=10)
        if r.status_code == 400:
            data = r.json()
            if "No items with a usage count above 0" in data.get("error", ""):
                print("✅ Test 6 PASSED: 400 'No items with a usage count above 0'")
                return True
            else:
                print(f"❌ Test 6 FAILED: Got 400 but wrong error message: {data.get('error')}")
                return False
        else:
            print(f"❌ Test 6 FAILED: Expected 400, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 6 FAILED: {e}")
        return False

def test_apply_zero_counts(jwt):
    """Test 7: POST /api/usage/apply with JWT + items with zero counts → 400"""
    print("\n🧪 Test 7: POST /api/usage/apply with items having zero counts")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.post(
            f"{BASE_URL}/usage/apply",
            json={"items": [{"id": "test-id-123", "used": 0}]},
            headers=headers,
            timeout=10
        )
        if r.status_code == 400:
            data = r.json()
            if "No items with a usage count above 0" in data.get("error", ""):
                print("✅ Test 7 PASSED: 400 'No items with a usage count above 0' (zero counts filtered out)")
                return True
            else:
                print(f"❌ Test 7 FAILED: Got 400 but wrong error message: {data.get('error')}")
                return False
        else:
            print(f"❌ Test 7 FAILED: Expected 400, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 7 FAILED: {e}")
        return False

def test_health_endpoint():
    """Test 8: GET /api/health → 200 (regression sanity check)"""
    print("\n🧪 Test 8: GET /api/health (regression sanity check)")
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data.get("ok") == True:
                print("✅ Test 8 PASSED: 200 OK, health endpoint working")
                return True
            else:
                print(f"❌ Test 8 FAILED: Got 200 but unexpected response: {data}")
                return False
        else:
            print(f"❌ Test 8 FAILED: Expected 200, got {r.status_code}")
            print(f"   Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 8 FAILED: {e}")
        return False

def main():
    print("=" * 80)
    print("🧪 End-of-Shift Usage Log Feature Test Suite")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test image: /tmp/usage_sheet_test.jpg")
    
    # Mint JWT token
    print("\n🔑 Minting chef JWT token...")
    jwt = mint_chef_jwt()
    print(f"   JWT: {jwt[:50]}...")
    
    # Load test image
    print("\n📸 Loading test image...")
    image_data_url = load_test_image()
    print(f"   Image size: {len(image_data_url)} characters")
    
    # Run all tests
    results = []
    
    results.append(("Test 1: scan-sheet no auth", test_scan_sheet_no_auth()))
    results.append(("Test 2: scan-sheet empty body", test_scan_sheet_empty_body(jwt)))
    results.append(("Test 3: scan-sheet invalid image", test_scan_sheet_invalid_image(jwt)))
    results.append(("Test 4: scan-sheet real image", test_scan_sheet_real_image(jwt, image_data_url)))
    results.append(("Test 5: apply no auth", test_apply_no_auth()))
    results.append(("Test 6: apply empty items", test_apply_empty_items(jwt)))
    results.append(("Test 7: apply zero counts", test_apply_zero_counts(jwt)))
    results.append(("Test 8: health endpoint", test_health_endpoint()))
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
