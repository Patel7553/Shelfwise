#!/usr/bin/env python3
"""
Test script for AI Recipe Web Search endpoint (POST /api/recipe/web-search)
Tests ONLY the new recipe/web-search endpoint as per review_request.
"""

import requests
import json
import sys
import subprocess

# Get base URL from .env
def get_base_url():
    try:
        with open('/app/.env', 'r') as f:
            for line in f:
                if line.startswith('NEXT_PUBLIC_BASE_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading .env: {e}")
    return "http://localhost:3000"

BASE_URL = get_base_url()
API_URL = f"{BASE_URL}/api"

print(f"Testing against: {API_URL}")
print("=" * 80)

# Generate a fresh JWT token
def generate_jwt():
    try:
        result = subprocess.run(
            ["node", "-e", "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))"],
            cwd="/app",
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"Error generating JWT: {result.stderr}")
            return None
    except Exception as e:
        print(f"Exception generating JWT: {e}")
        return None

CHEF_JWT = generate_jwt()
if not CHEF_JWT:
    print("CRITICAL: Failed to generate JWT token")
    sys.exit(1)

print(f"Generated JWT token: {CHEF_JWT[:50]}...")
print("=" * 80)

# Test counters
tests_passed = 0
tests_failed = 0
test_results = []

def test_case(name, func):
    global tests_passed, tests_failed
    print(f"\n🧪 TEST: {name}")
    print("-" * 80)
    try:
        result = func()
        if result:
            tests_passed += 1
            test_results.append(f"✅ {name}")
            print(f"✅ PASSED: {name}")
        else:
            tests_failed += 1
            test_results.append(f"❌ {name}")
            print(f"❌ FAILED: {name}")
        return result
    except Exception as e:
        tests_failed += 1
        test_results.append(f"❌ {name} (Exception: {str(e)})")
        print(f"❌ FAILED: {name}")
        print(f"   Exception: {e}")
        return False

# TEST 1: No auth header → expect 401
def test_no_auth():
    print("Testing POST /api/recipe/web-search without auth header...")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": "Spaghetti Carbonara", "servings": 4},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 401:
            data = response.json()
            if 'error' in data and 'authenticated' in data['error'].lower():
                print("✓ Correctly returned 401 with authentication error")
                return True
            else:
                print(f"✗ Got 401 but unexpected error message: {data}")
                return False
        else:
            print(f"✗ Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

# TEST 2: Valid JWT but empty body → expect 400
def test_empty_body():
    print("Testing POST /api/recipe/web-search with valid JWT but empty body...")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'query' in data['error'].lower():
                print("✓ Correctly returned 400 with query error")
                return True
            else:
                print(f"✗ Got 400 but unexpected error message: {data}")
                return False
        else:
            print(f"✗ Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

# TEST 3: Valid JWT + valid query → expect 200 with 3 recipes
def test_valid_carbonara():
    print("Testing POST /api/recipe/web-search with valid JWT + Spaghetti Carbonara...")
    print("⚠️  This calls gpt-4o-mini and may take 20-40 seconds...")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": "Spaghetti Carbonara", "servings": 4},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=90  # LLM call can take time
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        print(f"Response keys: {data.keys()}")
        
        # Check structure
        if 'recipes' not in data:
            print(f"✗ Missing 'recipes' key in response")
            return False
        
        recipes = data['recipes']
        if not isinstance(recipes, list):
            print(f"✗ 'recipes' is not an array")
            return False
        
        print(f"✓ Got {len(recipes)} recipes")
        
        if len(recipes) == 0:
            print(f"✗ Expected at least 1 recipe, got 0")
            return False
        
        if len(recipes) > 3:
            print(f"⚠️  Got {len(recipes)} recipes (expected up to 3)")
        
        # Validate each recipe
        for i, recipe in enumerate(recipes[:3]):  # Check up to 3
            print(f"\n  Recipe {i+1}: {recipe.get('title', 'NO TITLE')}")
            
            # Required fields
            required_fields = ['title', 'source', 'style', 'servings', 'prepMinutes', 
                             'cookMinutes', 'difficulty', 'cuisine', 'allergens', 
                             'ingredients', 'steps']
            
            for field in required_fields:
                if field not in recipe:
                    print(f"    ✗ Missing field: {field}")
                    return False
            
            # Check types
            if not isinstance(recipe['title'], str):
                print(f"    ✗ title is not a string")
                return False
            
            if not isinstance(recipe['source'], str):
                print(f"    ✗ source is not a string")
                return False
            
            if not isinstance(recipe['style'], str):
                print(f"    ✗ style is not a string")
                return False
            
            if recipe['servings'] != 4:
                print(f"    ✗ servings is {recipe['servings']}, expected 4")
                return False
            
            if not isinstance(recipe['prepMinutes'], (int, float)):
                print(f"    ✗ prepMinutes is not a number: {type(recipe['prepMinutes'])}")
                return False
            
            if not isinstance(recipe['cookMinutes'], (int, float)):
                print(f"    ✗ cookMinutes is not a number: {type(recipe['cookMinutes'])}")
                return False
            
            if not isinstance(recipe['allergens'], list):
                print(f"    ✗ allergens is not an array")
                return False
            
            # Check allergens are lowercase strings
            for allergen in recipe['allergens']:
                if not isinstance(allergen, str) or allergen != allergen.lower():
                    print(f"    ✗ allergen '{allergen}' is not lowercase string")
                    return False
            
            # Carbonara should have eggs and/or dairy and/or gluten
            allergen_set = set(recipe['allergens'])
            if not any(a in allergen_set for a in ['eggs', 'dairy', 'gluten']):
                print(f"    ⚠️  Carbonara allergens {recipe['allergens']} missing eggs/dairy/gluten (may be acceptable)")
            else:
                print(f"    ✓ Allergens include expected items: {recipe['allergens']}")
            
            # Check ingredients
            if not isinstance(recipe['ingredients'], list):
                print(f"    ✗ ingredients is not an array")
                return False
            
            if len(recipe['ingredients']) == 0:
                print(f"    ✗ ingredients array is empty")
                return False
            
            print(f"    ✓ Has {len(recipe['ingredients'])} ingredients")
            
            # Validate ingredient structure
            for j, ing in enumerate(recipe['ingredients'][:3]):  # Check first 3
                if not isinstance(ing, dict):
                    print(f"      ✗ Ingredient {j+1} is not an object")
                    return False
                
                if 'name' not in ing or not isinstance(ing['name'], str):
                    print(f"      ✗ Ingredient {j+1} missing/invalid name")
                    return False
                
                if 'quantity' not in ing:
                    print(f"      ✗ Ingredient {j+1} missing quantity")
                    return False
                
                # CRITICAL: quantity must be numeric type
                if not isinstance(ing['quantity'], (int, float)):
                    print(f"      ✗ Ingredient {j+1} '{ing['name']}' quantity is {type(ing['quantity'])}, not number")
                    return False
                
                if 'unit' not in ing or not isinstance(ing['unit'], str):
                    print(f"      ✗ Ingredient {j+1} missing/invalid unit")
                    return False
                
                print(f"      ✓ Ingredient {j+1}: {ing['name']} - {ing['quantity']} {ing['unit']}")
            
            # Check steps
            if not isinstance(recipe['steps'], list):
                print(f"    ✗ steps is not an array")
                return False
            
            if len(recipe['steps']) == 0:
                print(f"    ✗ steps array is empty")
                return False
            
            print(f"    ✓ Has {len(recipe['steps'])} steps")
            
            for step in recipe['steps']:
                if not isinstance(step, str):
                    print(f"    ✗ Step is not a string: {type(step)}")
                    return False
            
            print(f"  ✓ Recipe {i+1} validation passed")
        
        print("\n✓ All recipe validations passed")
        return True
        
    except requests.exceptions.Timeout:
        print(f"✗ Request timed out (LLM call took too long)")
        return False
    except Exception as e:
        print(f"✗ Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# TEST 4: Valid JWT + Butter Chicken with servings=2 → expect servings=2
def test_butter_chicken_servings():
    print("Testing POST /api/recipe/web-search with Butter Chicken, servings=2...")
    print("⚠️  This calls gpt-4o-mini and may take 20-40 seconds...")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": "Butter Chicken", "servings": 2},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=90
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        recipes = data.get('recipes', [])
        
        if len(recipes) == 0:
            print(f"✗ No recipes returned")
            return False
        
        print(f"✓ Got {len(recipes)} recipes")
        
        # Check all recipes have servings=2
        all_correct = True
        for i, recipe in enumerate(recipes):
            servings = recipe.get('servings')
            print(f"  Recipe {i+1}: {recipe.get('title', 'NO TITLE')} - servings={servings}")
            if servings != 2:
                print(f"    ✗ Expected servings=2, got {servings}")
                all_correct = False
        
        if all_correct:
            print("✓ All recipes have servings=2")
            return True
        else:
            return False
        
    except requests.exceptions.Timeout:
        print(f"✗ Request timed out")
        return False
    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

# TEST 5: Valid JWT + empty query → expect 400
def test_empty_query():
    print("Testing POST /api/recipe/web-search with empty query...")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": ""},
            headers={"Authorization": f"Bearer {CHEF_JWT}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'query' in data['error'].lower():
                print("✓ Correctly returned 400 with query error")
                return True
            else:
                print(f"✗ Got 400 but unexpected error message: {data}")
                return False
        else:
            print(f"✗ Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

# Run all tests
print("\n" + "=" * 80)
print("STARTING RECIPE WEB SEARCH ENDPOINT TESTS")
print("=" * 80)

test_case("1. No auth header → 401", test_no_auth)
test_case("2. Valid JWT + empty body → 400", test_empty_body)
test_case("3. Valid JWT + Spaghetti Carbonara → 200 with recipes", test_valid_carbonara)
test_case("4. Valid JWT + Butter Chicken servings=2 → servings=2", test_butter_chicken_servings)
test_case("5. Valid JWT + empty query → 400", test_empty_query)

# Summary
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
for result in test_results:
    print(result)

print(f"\nTotal: {tests_passed + tests_failed} tests")
print(f"Passed: {tests_passed}")
print(f"Failed: {tests_failed}")

if tests_failed == 0:
    print("\n🎉 ALL TESTS PASSED!")
    sys.exit(0)
else:
    print(f"\n❌ {tests_failed} TEST(S) FAILED")
    sys.exit(1)
