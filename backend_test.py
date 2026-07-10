#!/usr/bin/env python3
"""
ShelfWise Backend Regression + New Endpoint Tests
Tests push notifications, suppliers, and recipe web search endpoints
"""

import requests
import json
import subprocess
import sys

BASE_URL = "http://localhost:3000"

def generate_chef_jwt():
    """Generate a chef JWT token for authentication"""
    cmd = [
        'node', '-e',
        "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to generate JWT: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

def test_health():
    """Test 1: GET /api/health → 200"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/health")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("✅ TEST 1 PASSED: Health endpoint returns 200")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 FAILED: Exception - {str(e)}")
        return False

def test_push_public_key_no_auth():
    """Test 2: GET /api/push/public-key with NO auth → 401"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/push/public-key (NO AUTH)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/api/push/public-key", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 401:
            print("✅ TEST 2 PASSED: Returns 401 without auth")
            return True
        else:
            print(f"❌ TEST 2 FAILED: Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception - {str(e)}")
        return False

def test_push_public_key_with_auth(token):
    """Test 3: GET /api/push/public-key with chef JWT → 200 with {key: <base64url string ~87 chars>}"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/push/public-key (WITH CHEF JWT)")
    print("="*80)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/push/public-key", headers=headers, timeout=10)
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {data}")
        
        if response.status_code == 200:
            if 'key' in data:
                key_len = len(data['key'])
                print(f"Key length: {key_len} characters")
                if 80 <= key_len <= 95:  # ~87 chars, allow some variance
                    print("✅ TEST 3 PASSED: Returns 200 with valid VAPID public key")
                    return True
                else:
                    print(f"❌ TEST 3 FAILED: Key length {key_len} not in expected range (80-95)")
                    return False
            else:
                print("❌ TEST 3 FAILED: Response missing 'key' field")
                return False
        else:
            print(f"❌ TEST 3 FAILED: Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 3 FAILED: Exception - {str(e)}")
        return False

def test_push_subscribe_invalid(token):
    """Test 4: POST /api/push/subscribe with chef JWT and body {"subscription": {}} → 400"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/push/subscribe (INVALID SUBSCRIPTION)")
    print("="*80)
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {"subscription": {}}
        response = requests.post(f"{BASE_URL}/api/push/subscribe", headers=headers, json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 400:
            print("✅ TEST 4 PASSED: Returns 400 for invalid subscription (validates before DB)")
            return True
        else:
            print(f"❌ TEST 4 FAILED: Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception - {str(e)}")
        return False

def test_push_unsubscribe_invalid(token):
    """Test 5: POST /api/push/unsubscribe with chef JWT and body {} → 400"""
    print("\n" + "="*80)
    print("TEST 5: POST /api/push/unsubscribe (MISSING ENDPOINT)")
    print("="*80)
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {}
        response = requests.post(f"{BASE_URL}/api/push/unsubscribe", headers=headers, json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 400:
            print("✅ TEST 5 PASSED: Returns 400 for missing endpoint (validates before DB)")
            return True
        else:
            print(f"❌ TEST 5 FAILED: Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 5 FAILED: Exception - {str(e)}")
        return False

def test_suppliers_missing_name(token):
    """Test 6: POST /api/suppliers with chef JWT and body {} → 400 with 'Supplier name required'"""
    print("\n" + "="*80)
    print("TEST 6: POST /api/suppliers (MISSING NAME)")
    print("="*80)
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {}
        response = requests.post(f"{BASE_URL}/api/suppliers", headers=headers, json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {data}")
        
        if response.status_code == 400:
            if 'error' in data and 'Supplier name required' in data['error']:
                print("✅ TEST 6 PASSED: Returns 400 with 'Supplier name required' (validates before DB)")
                return True
            else:
                print(f"❌ TEST 6 FAILED: Expected 'Supplier name required' error message")
                return False
        else:
            print(f"❌ TEST 6 FAILED: Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 6 FAILED: Exception - {str(e)}")
        return False

def test_suppliers_order_email_no_resend(token):
    """Test 7: POST /api/suppliers/order-email → 500 with 'RESEND_API_KEY not configured'"""
    print("\n" + "="*80)
    print("TEST 7: POST /api/suppliers/order-email (NO RESEND_API_KEY)")
    print("="*80)
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "toEmail": "not-an-email",
            "items": []
        }
        response = requests.post(f"{BASE_URL}/api/suppliers/order-email", headers=headers, json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {data}")
        
        if response.status_code == 500:
            if 'error' in data and 'RESEND_API_KEY not configured' in data['error']:
                print("✅ TEST 7 PASSED: Returns 500 with 'RESEND_API_KEY not configured' (checks env before validation)")
                return True
            else:
                print(f"❌ TEST 7 FAILED: Expected 'RESEND_API_KEY not configured' error message")
                return False
        else:
            print(f"❌ TEST 7 FAILED: Expected 500, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 7 FAILED: Exception - {str(e)}")
        return False

def test_recipe_web_search_regression(token):
    """Test 8: REGRESSION - POST /api/recipe/web-search with Greek Salad → 200, 3 recipes, numeric quantities, servings=1"""
    print("\n" + "="*80)
    print("TEST 8: REGRESSION - POST /api/recipe/web-search (Greek Salad)")
    print("="*80)
    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {"query": "Greek Salad"}
        response = requests.post(f"{BASE_URL}/api/recipe/web-search", headers=headers, json=payload, timeout=90)
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200:
            if 'recipes' not in data:
                print(f"❌ TEST 8 FAILED: Response missing 'recipes' field")
                return False
            
            recipes = data['recipes']
            print(f"Number of recipes: {len(recipes)}")
            
            if len(recipes) == 0:
                print(f"❌ TEST 8 FAILED: Expected up to 3 recipes, got 0")
                return False
            
            if len(recipes) > 3:
                print(f"❌ TEST 8 FAILED: Expected up to 3 recipes, got {len(recipes)}")
                return False
            
            # Check each recipe
            all_valid = True
            for i, recipe in enumerate(recipes):
                print(f"\nRecipe {i+1}: {recipe.get('title', 'N/A')}")
                print(f"  Source: {recipe.get('source', 'N/A')}")
                print(f"  Style: {recipe.get('style', 'N/A')}")
                print(f"  Servings: {recipe.get('servings', 'N/A')}")
                
                # Check servings = 1 (default when omitted)
                if recipe.get('servings') != 1:
                    print(f"  ❌ Expected servings=1 (default), got {recipe.get('servings')}")
                    all_valid = False
                
                # Check ingredients have numeric quantities
                ingredients = recipe.get('ingredients', [])
                print(f"  Ingredients: {len(ingredients)}")
                
                for j, ing in enumerate(ingredients[:3]):  # Check first 3
                    qty = ing.get('quantity')
                    if not isinstance(qty, (int, float)):
                        print(f"    ❌ Ingredient {j+1} '{ing.get('name')}' has non-numeric quantity: {qty} (type: {type(qty).__name__})")
                        all_valid = False
                    else:
                        print(f"    ✓ Ingredient {j+1} '{ing.get('name')}': {qty} {ing.get('unit')} (numeric)")
            
            if all_valid:
                print("\n✅ TEST 8 PASSED: Recipe web search working - 200, up to 3 recipes, numeric quantities, servings=1 default")
                return True
            else:
                print("\n❌ TEST 8 FAILED: Some validation checks failed")
                return False
        else:
            print(f"❌ TEST 8 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {data}")
            return False
    except Exception as e:
        print(f"❌ TEST 8 FAILED: Exception - {str(e)}")
        return False

def test_service_worker():
    """Test 9: GET /sw.js returns 200 and contains 'push' event listener"""
    print("\n" + "="*80)
    print("TEST 9: GET /sw.js (SERVICE WORKER)")
    print("="*80)
    try:
        response = requests.get(f"{BASE_URL}/sw.js", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            content = response.text
            if "addEventListener('push'" in content or 'addEventListener("push"' in content:
                print("✅ TEST 9 PASSED: Service worker returns 200 and contains 'push' event listener")
                return True
            else:
                print("❌ TEST 9 FAILED: Service worker missing 'push' event listener")
                print(f"Content preview: {content[:200]}")
                return False
        else:
            print(f"❌ TEST 9 FAILED: Expected 200, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 9 FAILED: Exception - {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("ShelfWise Backend Regression + New Endpoint Tests")
    print("Testing: Push notifications, Suppliers, Recipe web search")
    print("="*80)
    
    # Generate JWT token
    print("\nGenerating chef JWT token...")
    token = generate_chef_jwt()
    print(f"Token generated: {token[:20]}...")
    
    # Run all tests
    results = []
    
    results.append(("Health endpoint", test_health()))
    results.append(("Push public-key (no auth)", test_push_public_key_no_auth()))
    results.append(("Push public-key (with auth)", test_push_public_key_with_auth(token)))
    results.append(("Push subscribe (invalid)", test_push_subscribe_invalid(token)))
    results.append(("Push unsubscribe (invalid)", test_push_unsubscribe_invalid(token)))
    results.append(("Suppliers (missing name)", test_suppliers_missing_name(token)))
    results.append(("Suppliers order-email (no RESEND)", test_suppliers_order_email_no_resend(token)))
    results.append(("Recipe web search (regression)", test_recipe_web_search_regression(token)))
    results.append(("Service worker", test_service_worker()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
