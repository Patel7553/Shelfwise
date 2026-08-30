#!/usr/bin/env python3
"""
Backend test for App update detection endpoint hardening (/api/version no-store)

Tests:
1. GET /api/version WITHOUT auth → 200 JSON {version: <non-empty string>}
2. Response MUST include Cache-Control header containing "no-store"
3. Content-Type is application/json
4. Regression: GET /api/products with chef JWT → 200 array
5. Regression: GET /api/trash with chef JWT → 200 {items:[...], retentionDays:30}
"""

import requests
import json

BASE_URL = "http://localhost:3000/api"

# Chef JWT generated with: cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))"
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoiYTI1NzNlNmEtNzBmMC00YTZkLTk3ZDAtY2NmMDliNDQ0NjQzIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJYeXoiLCJpYXQiOjE3ODgxMTQwMDIsImV4cCI6MTc4ODE1NzIwMn0.5KQvSRifmJ--MLHL4JsXLFf1UVZf1ahcVFY7DTqX2es"

def test_version_endpoint():
    """Test 1: GET /api/version WITHOUT auth → 200 JSON {version: <non-empty string>}"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/version WITHOUT auth")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/version", timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Response Body: {response.text}")
        
        # Check status code
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Status code is 200")
        
        # Check JSON response
        try:
            data = response.json()
            print(f"✅ Response is valid JSON: {data}")
        except Exception as e:
            print(f"❌ Response is not valid JSON: {e}")
            raise
        
        # Check version field exists and is non-empty
        assert "version" in data, "Response missing 'version' field"
        assert isinstance(data["version"], str), f"Version should be string, got {type(data['version'])}"
        assert len(data["version"]) > 0, "Version string is empty"
        print(f"✅ Version field exists and is non-empty: '{data['version']}'")
        
        print("\n✅ TEST 1 PASSED: /api/version returns 200 with valid JSON {version: <string>}")
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 1 FAILED: {e}")
        return False


def test_cache_control_header():
    """Test 2: Response MUST include Cache-Control header containing "no-store"""
    print("\n" + "="*80)
    print("TEST 2: Cache-Control header must contain 'no-store'")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/version", timeout=10)
        
        # Check Cache-Control header exists
        cache_control = response.headers.get("Cache-Control", "")
        print(f"Cache-Control header: '{cache_control}'")
        
        assert cache_control, "Cache-Control header is missing"
        print("✅ Cache-Control header exists")
        
        # Check it contains "no-store"
        assert "no-store" in cache_control.lower(), f"Cache-Control does not contain 'no-store': {cache_control}"
        print("✅ Cache-Control contains 'no-store'")
        
        # Additional check for other cache directives (informational)
        if "no-cache" in cache_control.lower():
            print("✅ Cache-Control also contains 'no-cache' (good)")
        if "must-revalidate" in cache_control.lower():
            print("✅ Cache-Control also contains 'must-revalidate' (good)")
        
        print("\n✅ TEST 2 PASSED: Cache-Control header contains 'no-store'")
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 2 FAILED: {e}")
        return False


def test_content_type_header():
    """Test 3: Content-Type is application/json"""
    print("\n" + "="*80)
    print("TEST 3: Content-Type must be application/json")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/version", timeout=10)
        
        content_type = response.headers.get("Content-Type", "")
        print(f"Content-Type header: '{content_type}'")
        
        assert content_type, "Content-Type header is missing"
        print("✅ Content-Type header exists")
        
        # Check it contains "application/json" (may have charset)
        assert "application/json" in content_type.lower(), f"Content-Type is not application/json: {content_type}"
        print("✅ Content-Type is application/json")
        
        print("\n✅ TEST 3 PASSED: Content-Type is application/json")
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 3 FAILED: {e}")
        return False


def test_products_regression():
    """Test 4: Regression - GET /api/products with chef JWT → 200 array"""
    print("\n" + "="*80)
    print("TEST 4: REGRESSION - GET /api/products with chef JWT")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        response = requests.get(f"{BASE_URL}/products", headers=headers, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        
        # Check status code
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Status code is 200")
        
        # Check JSON response is an array
        try:
            data = response.json()
            assert isinstance(data, list), f"Expected array, got {type(data)}"
            print(f"✅ Response is a valid array with {len(data)} items")
        except Exception as e:
            print(f"❌ Response is not valid JSON array: {e}")
            raise
        
        print("\n✅ TEST 4 PASSED: GET /api/products returns 200 with array")
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 4 FAILED: {e}")
        return False


def test_trash_regression():
    """Test 5: Regression - GET /api/trash with chef JWT → 200 {items:[...], retentionDays:30}"""
    print("\n" + "="*80)
    print("TEST 5: REGRESSION - GET /api/trash with chef JWT")
    print("="*80)
    
    try:
        headers = {"Authorization": f"Bearer {CHEF_JWT}"}
        response = requests.get(f"{BASE_URL}/trash", headers=headers, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        
        # Check status code
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Status code is 200")
        
        # Check JSON response structure
        try:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            assert isinstance(data, dict), f"Expected object, got {type(data)}"
            print("✅ Response is a valid object")
            
            assert "items" in data, "Response missing 'items' field"
            assert isinstance(data["items"], list), f"Expected items to be array, got {type(data['items'])}"
            print(f"✅ Response has 'items' array with {len(data['items'])} items")
            
            assert "retentionDays" in data, "Response missing 'retentionDays' field"
            assert isinstance(data["retentionDays"], int), f"Expected retentionDays to be int, got {type(data['retentionDays'])}"
            print(f"✅ Response has 'retentionDays' field: {data['retentionDays']}")
            
        except Exception as e:
            print(f"❌ Response structure invalid: {e}")
            raise
        
        print("\n✅ TEST 5 PASSED: GET /api/trash returns 200 with {items:[...], retentionDays:...}")
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 5 FAILED: {e}")
        return False


def main():
    print("\n" + "="*80)
    print("BACKEND TEST: App update detection endpoint hardening (/api/version no-store)")
    print("="*80)
    
    results = []
    
    # Run all tests
    results.append(("Test 1: /api/version without auth", test_version_endpoint()))
    results.append(("Test 2: Cache-Control no-store", test_cache_control_header()))
    results.append(("Test 3: Content-Type application/json", test_content_type_header()))
    results.append(("Test 4: Regression /api/products", test_products_regression()))
    results.append(("Test 5: Regression /api/trash", test_trash_regression()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! The /api/version endpoint is correctly hardened with no-store cache headers.")
        print("   Regression tests also passed - /api/products and /api/trash still working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
