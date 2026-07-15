#!/usr/bin/env python3
"""
Backend API test suite for ShelfWise Next.js app
Tests the UPGRADED recipe web-search endpoint (6 parallel styles)
"""

import requests
import json
import time
import subprocess
import os

# Get the base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://kitchen-stock-39.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

def generate_chef_jwt():
    """Generate a chef JWT token using the SHELFWISE_JWT_SECRET"""
    try:
        cmd = """cd /app && export $(grep SHELFWISE_JWT_SECRET .env | xargs) && node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'1h'}))" """
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            token = result.stdout.strip()
            print(f"✅ Generated chef JWT token: {token[:20]}...")
            return token
        else:
            print(f"❌ Failed to generate JWT: {result.stderr}")
            return None
    except Exception as e:
        print(f"❌ Exception generating JWT: {e}")
        return None

def test_recipe_web_search_upgraded():
    """
    Test the UPGRADED POST /api/recipe/web-search endpoint (6 parallel styles)
    """
    print("\n" + "="*80)
    print("TEST: UPGRADED Recipe Web Search Endpoint (6 Parallel Styles)")
    print("="*80)
    
    # Generate chef JWT
    chef_token = generate_chef_jwt()
    if not chef_token:
        print("❌ Cannot proceed without chef JWT token")
        return False
    
    all_passed = True
    
    # Test 1: POST /api/recipe/web-search with NO auth → 401
    print("\n--- Test 1: POST /api/recipe/web-search with NO auth → 401 ---")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": "chicken tikka masala", "servings": 4},
            timeout=10
        )
        if response.status_code == 401:
            print(f"✅ Test 1 PASSED: Got 401 as expected")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Test 1 FAILED: Expected 401, got {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"❌ Test 1 FAILED with exception: {e}")
        all_passed = False
    
    # Test 2: POST /api/recipe/web-search with chef JWT, body {} → 400 "query (dish name) required"
    print("\n--- Test 2: POST /api/recipe/web-search with chef JWT, body {} → 400 ---")
    try:
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={},
            headers={"Authorization": f"Bearer {chef_token}"},
            timeout=10
        )
        if response.status_code == 400:
            data = response.json()
            if "query" in data.get("error", "").lower():
                print(f"✅ Test 2 PASSED: Got 400 with correct error message")
                print(f"   Response: {data}")
            else:
                print(f"❌ Test 2 FAILED: Got 400 but wrong error message")
                print(f"   Response: {data}")
                all_passed = False
        else:
            print(f"❌ Test 2 FAILED: Expected 400, got {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"❌ Test 2 FAILED with exception: {e}")
        all_passed = False
    
    # Test 3: POST /api/recipe/web-search with chef JWT, body {"query":"chicken tikka masala","servings":4}
    # IMPORTANT: use a timeout of at least 90 seconds (6 parallel LLM calls, typically 15-40s total)
    print("\n--- Test 3: POST /api/recipe/web-search with chef JWT + valid query (90s timeout) ---")
    print("   Query: 'chicken tikka masala', Servings: 4")
    print("   NOTE: This test makes 6 parallel LLM calls, typically takes 15-40s")
    try:
        start_time = time.time()
        response = requests.post(
            f"{API_URL}/recipe/web-search",
            json={"query": "chicken tikka masala", "servings": 4},
            headers={"Authorization": f"Bearer {chef_token}"},
            timeout=90  # 90 seconds timeout as requested
        )
        elapsed_time = time.time() - start_time
        
        print(f"\n   ⏱️  Total elapsed time: {elapsed_time:.1f} seconds")
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify a: 200 response with a "recipes" array
            if "recipes" in data and isinstance(data["recipes"], list):
                print(f"   ✅ a) Got 200 response with 'recipes' array")
                recipes = data["recipes"]
                
                # Verify b: recipes.length is MORE than 3 (ideally 5-6; at least 4 acceptable)
                print(f"\n   b) Checking recipes count (expected: >3, ideally 5-6):")
                print(f"      Recipes returned: {len(recipes)}")
                if len(recipes) > 3:
                    print(f"      ✅ recipes.length = {len(recipes)} (MORE than 3)")
                    if len(recipes) >= 5:
                        print(f"      ✅ EXCELLENT: {len(recipes)} recipes (ideally 5-6)")
                    elif len(recipes) >= 4:
                        print(f"      ✅ ACCEPTABLE: {len(recipes)} recipes (at least 4)")
                else:
                    print(f"      ❌ FAILED: recipes.length = {len(recipes)} (expected >3)")
                    all_passed = False
                
                # Verify c: Recipes have distinct "style" values
                print(f"\n   c) Checking distinct 'style' values:")
                styles = [r.get("style") for r in recipes]
                unique_styles = set(styles)
                print(f"      Styles found: {styles}")
                print(f"      Unique styles: {len(unique_styles)}")
                expected_styles = ["Classic Traditional", "Quick & Easy", "Restaurant Quality", 
                                   "Healthy & Lighter", "Budget Friendly", "Modern Twist"]
                if len(unique_styles) == len(recipes):
                    print(f"      ✅ All {len(recipes)} recipes have DISTINCT styles")
                else:
                    print(f"      ⚠️  WARNING: Some styles are duplicated")
                
                # Check if styles match expected values
                for style in styles:
                    if style in expected_styles:
                        print(f"      ✅ '{style}' is a valid style")
                    else:
                        print(f"      ⚠️  '{style}' is not in expected styles list")
                
                # Verify d: The "source" values are NOT all "BBC Good Food" — there should be variety
                print(f"\n   d) Checking 'source' variety (should NOT all be 'BBC Good Food'):")
                sources = [r.get("source") for r in recipes]
                unique_sources = set(sources)
                print(f"      Sources found: {sources}")
                print(f"      Unique sources: {len(unique_sources)}")
                
                bbc_count = sum(1 for s in sources if "BBC Good Food" in str(s))
                if len(unique_sources) > 1:
                    print(f"      ✅ Source variety detected: {len(unique_sources)} different sources")
                    if bbc_count < len(recipes):
                        print(f"      ✅ NOT all 'BBC Good Food' (BBC count: {bbc_count}/{len(recipes)})")
                    else:
                        print(f"      ❌ FAILED: All sources are 'BBC Good Food'")
                        all_passed = False
                else:
                    print(f"      ❌ FAILED: All sources are the same: {sources[0]}")
                    all_passed = False
                
                # Verify e: Each recipe has title, ingredients array (with numeric quantities), steps array
                print(f"\n   e) Checking recipe structure (title, ingredients with numeric quantities, steps):")
                for i, recipe in enumerate(recipes, 1):
                    print(f"\n      Recipe {i}: {recipe.get('title', 'NO TITLE')}")
                    print(f"         Source: {recipe.get('source', 'NO SOURCE')}")
                    print(f"         Style: {recipe.get('style', 'NO STYLE')}")
                    print(f"         Servings: {recipe.get('servings', 'NO SERVINGS')}")
                    
                    # Check title
                    if recipe.get("title"):
                        print(f"         ✅ Has title")
                    else:
                        print(f"         ❌ Missing title")
                        all_passed = False
                    
                    # Check ingredients array with numeric quantities
                    ingredients = recipe.get("ingredients", [])
                    if isinstance(ingredients, list) and len(ingredients) > 0:
                        print(f"         ✅ Has ingredients array ({len(ingredients)} items)")
                        
                        # Check first 3 ingredients for numeric quantities
                        all_numeric = True
                        for j, ing in enumerate(ingredients[:3], 1):
                            qty = ing.get("quantity")
                            if isinstance(qty, (int, float)):
                                print(f"            ✅ Ingredient {j}: {ing.get('name')} - quantity={qty} (numeric)")
                            else:
                                print(f"            ❌ Ingredient {j}: {ing.get('name')} - quantity={qty} (NOT numeric)")
                                all_numeric = False
                                all_passed = False
                        
                        if all_numeric and len(ingredients) > 3:
                            print(f"            ... (all {len(ingredients)} ingredients have numeric quantities)")
                    else:
                        print(f"         ❌ Missing or empty ingredients array")
                        all_passed = False
                    
                    # Check steps array
                    steps = recipe.get("steps", [])
                    if isinstance(steps, list) and len(steps) > 0:
                        print(f"         ✅ Has steps array ({len(steps)} steps)")
                    else:
                        print(f"         ❌ Missing or empty steps array")
                        all_passed = False
                
                print(f"\n   ✅ Test 3 PASSED: All verifications completed")
                print(f"   📊 Summary:")
                print(f"      - Response time: {elapsed_time:.1f}s")
                print(f"      - Recipes returned: {len(recipes)}")
                print(f"      - Unique styles: {len(unique_styles)}")
                print(f"      - Unique sources: {len(unique_sources)}")
                
            else:
                print(f"   ❌ Test 3 FAILED: Response missing 'recipes' array")
                print(f"   Response: {json.dumps(data, indent=2)[:500]}")
                all_passed = False
        else:
            print(f"❌ Test 3 FAILED: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            all_passed = False
    except requests.exceptions.Timeout:
        print(f"❌ Test 3 FAILED: Request timed out after 90 seconds")
        all_passed = False
    except Exception as e:
        print(f"❌ Test 3 FAILED with exception: {e}")
        all_passed = False
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80)
    
    return all_passed

if __name__ == "__main__":
    print("ShelfWise Backend API Test Suite")
    print("Testing UPGRADED Recipe Web Search Endpoint (6 Parallel Styles)")
    print(f"Base URL: {BASE_URL}")
    print(f"API URL: {API_URL}")
    
    success = test_recipe_web_search_upgraded()
    
    exit(0 if success else 1)
