#!/usr/bin/env python3
"""
Backend test for POST /api/recipes/:id/cook endpoint
Tests recipe cook logging with optional ingredient deduction
"""

import requests
import json
import subprocess
import sys

# Get the base URL from environment
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"

def mint_chef_jwt():
    """Mint a chef JWT using the SHELFWISE_JWT_SECRET"""
    cmd = """cd /app && node -e "require('dotenv').config({silent:true}); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'1h'}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    # Extract only the JWT token (last line)
    token = result.stdout.strip().split('\n')[-1]
    return token

def test_recipe_cook_endpoint():
    """Test the POST /api/recipes/:id/cook endpoint"""
    
    print("=" * 80)
    print("BACKEND TEST: Recipe Cook/Deduction Endpoint")
    print("=" * 80)
    
    # Mint JWT
    print("\n🔑 Minting chef JWT...")
    token = mint_chef_jwt()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print(f"✅ JWT minted successfully")
    
    # Track created resources for cleanup
    created_products = []
    created_recipe_id = None
    
    try:
        # ============================================================================
        # SETUP: Create test products
        # ============================================================================
        print("\n" + "=" * 80)
        print("SETUP: Creating test products")
        print("=" * 80)
        
        products_to_create = [
            {"name": "TEST-Plain Flour", "quantity": 5, "unit": "kg", "storageType": "Dry Storage"},
            {"name": "TEST-Whole Milk", "quantity": 2000, "unit": "mL", "storageType": "Fridge"},
            {"name": "TEST-Eggs", "quantity": 12, "unit": "ea", "storageType": "Fridge"}
        ]
        
        for i, product_data in enumerate(products_to_create, 1):
            print(f"\n📦 Creating product {i}/3: {product_data['name']}")
            response = requests.post(f"{BASE_URL}/products", json=product_data, headers=headers)
            if response.status_code == 201:
                product = response.json()
                created_products.append(product['id'])
                print(f"✅ Created: {product['name']} - {product['quantity']} {product['unit']} (ID: {product['id']})")
            else:
                print(f"❌ Failed to create product: {response.status_code} - {response.text}")
                raise Exception(f"Product creation failed")
        
        # ============================================================================
        # SETUP: Create test recipe
        # ============================================================================
        print("\n" + "=" * 80)
        print("SETUP: Creating test recipe")
        print("=" * 80)
        
        recipe_data = {
            "title": "TEST-Pancakes",
            "servings": "Serves 2",
            "ingredients": [
                {"name": "TEST-Plain Flour", "quantity": 500, "unit": "g"},
                {"name": "TEST-Whole Milk", "quantity": 0.5, "unit": "L"},
                {"name": "TEST-Eggs", "quantity": 2, "unit": "ea"},
                {"name": "TEST-Unicorn Dust", "quantity": 10, "unit": "g"}
            ],
            "steps": ["mix", "fry"]
        }
        
        print(f"\n🍳 Creating recipe: {recipe_data['title']}")
        response = requests.post(f"{BASE_URL}/recipes", json=recipe_data, headers=headers)
        if response.status_code == 201:
            recipe = response.json()
            created_recipe_id = recipe['id']
            print(f"✅ Created recipe: {recipe['title']} (ID: {recipe['id']})")
            print(f"   Servings: {recipe['servings']}")
            print(f"   Ingredients: {len(recipe['ingredients'])}")
        else:
            print(f"❌ Failed to create recipe: {response.status_code} - {response.text}")
            raise Exception(f"Recipe creation failed")
        
        # ============================================================================
        # TEST 1: POST without auth → 401
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 1: POST /api/recipes/:id/cook without auth → 401")
        print("=" * 80)
        
        response = requests.post(
            f"{BASE_URL}/recipes/{created_recipe_id}/cook",
            json={"portions": 2, "servings": 2, "deduct": True}
        )
        
        if response.status_code == 401:
            print("✅ Test 1 PASSED: 401 without auth")
        else:
            print(f"❌ Test 1 FAILED: Expected 401, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # ============================================================================
        # TEST 2: portions=0 → 400
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 2: POST with portions=0 → 400")
        print("=" * 80)
        
        response = requests.post(
            f"{BASE_URL}/recipes/{created_recipe_id}/cook",
            json={"portions": 0, "servings": 2, "deduct": True},
            headers=headers
        )
        
        if response.status_code == 400:
            data = response.json()
            print(f"✅ Test 2 PASSED: 400 with portions=0")
            print(f"   Error message: {data.get('error', 'N/A')}")
        else:
            print(f"❌ Test 2 FAILED: Expected 400, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # ============================================================================
        # TEST 3: Non-existent recipe ID → 404
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 3: POST with non-existent recipe ID → 404")
        print("=" * 80)
        
        response = requests.post(
            f"{BASE_URL}/recipes/00000000-0000-0000-0000-000000000000/cook",
            json={"portions": 2, "servings": 2, "deduct": True},
            headers=headers
        )
        
        if response.status_code == 404:
            data = response.json()
            print(f"✅ Test 3 PASSED: 404 for non-existent recipe")
            print(f"   Error message: {data.get('error', 'N/A')}")
        else:
            print(f"❌ Test 3 FAILED: Expected 404, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # ============================================================================
        # TEST 4: Scale=2 deductions (portions=4, servings=2, deduct=true)
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 4: Scale=2 deductions (portions=4, servings=2, deduct=true)")
        print("=" * 80)
        
        response = requests.post(
            f"{BASE_URL}/recipes/{created_recipe_id}/cook",
            json={"portions": 4, "servings": 2, "deduct": True},
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Test 4a PASSED: 200 response")
            print(f"   ok: {data.get('ok')}")
            print(f"   portions: {data.get('portions')}")
            print(f"   deducted: {len(data.get('deducted', []))} items")
            print(f"   skipped: {len(data.get('skipped', []))} items")
            
            # Verify deductions
            deducted = data.get('deducted', [])
            skipped = data.get('skipped', [])
            
            # Expected deductions (scale=2):
            # TEST-Plain Flour: 500g * 2 = 1000g = 1kg, newQuantity = 5 - 1 = 4kg
            # TEST-Whole Milk: 0.5L * 2 = 1L = 1000mL, newQuantity = 2000 - 1000 = 1000mL
            # TEST-Eggs: 2ea * 2 = 4ea, newQuantity = 12 - 4 = 8ea
            
            print("\n   Deducted items:")
            flour_ok = milk_ok = eggs_ok = False
            for item in deducted:
                print(f"   - {item['productName']}: amount={item['amount']} {item['unit']}, newQuantity={item['newQuantity']}, short={item['short']}")
                
                if "Flour" in item['productName']:
                    if item['amount'] == 1 and item['unit'] == 'kg' and item['newQuantity'] == 4 and not item['short']:
                        flour_ok = True
                        print(f"     ✅ Flour deduction correct")
                    else:
                        print(f"     ❌ Flour deduction incorrect (expected: amount=1 kg, newQuantity=4, short=false)")
                
                elif "Milk" in item['productName']:
                    if item['amount'] == 1000 and item['unit'] == 'mL' and item['newQuantity'] == 1000 and not item['short']:
                        milk_ok = True
                        print(f"     ✅ Milk deduction correct")
                    else:
                        print(f"     ❌ Milk deduction incorrect (expected: amount=1000 mL, newQuantity=1000, short=false)")
                
                elif "Eggs" in item['productName']:
                    if item['amount'] == 4 and item['unit'] == 'ea' and item['newQuantity'] == 8 and not item['short']:
                        eggs_ok = True
                        print(f"     ✅ Eggs deduction correct")
                    else:
                        print(f"     ❌ Eggs deduction incorrect (expected: amount=4 ea, newQuantity=8, short=false)")
            
            print("\n   Skipped items:")
            unicorn_ok = False
            for item in skipped:
                print(f"   - {item['name']}: {item['reason']}")
                if "Unicorn Dust" in item['name']:
                    if "no matching item" in item['reason']:
                        unicorn_ok = True
                        print(f"     ✅ Unicorn Dust correctly skipped")
                    else:
                        print(f"     ❌ Unicorn Dust skip reason incorrect")
            
            if flour_ok and milk_ok and eggs_ok and unicorn_ok:
                print("\n✅ Test 4b PASSED: All deductions and skips correct")
            else:
                print(f"\n❌ Test 4b FAILED: Some deductions/skips incorrect (flour={flour_ok}, milk={milk_ok}, eggs={eggs_ok}, unicorn={unicorn_ok})")
            
            # Verify quantities changed in database
            print("\n   Verifying quantities in database...")
            response = requests.get(f"{BASE_URL}/products", headers=headers)
            if response.status_code == 200:
                products = response.json()
                for product in products:
                    if product['id'] in created_products:
                        print(f"   - {product['name']}: {product['quantity']} {product['unit']}")
                        
                        if "Flour" in product['name'] and product['quantity'] == 4 and product['unit'] == 'kg':
                            print(f"     ✅ Flour quantity correct in DB")
                        elif "Milk" in product['name'] and product['quantity'] == 1000 and product['unit'] == 'mL':
                            print(f"     ✅ Milk quantity correct in DB")
                        elif "Eggs" in product['name'] and product['quantity'] == 8 and product['unit'] == 'ea':
                            print(f"     ✅ Eggs quantity correct in DB")
                
                print("✅ Test 4c PASSED: Database quantities verified")
            else:
                print(f"❌ Test 4c FAILED: Could not verify database quantities")
        else:
            print(f"❌ Test 4 FAILED: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # ============================================================================
        # TEST 5: deduct=false (no changes)
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 5: deduct=false (no changes)")
        print("=" * 80)
        
        # Get current quantities
        response = requests.get(f"{BASE_URL}/products", headers=headers)
        products_before = {p['id']: p['quantity'] for p in response.json() if p['id'] in created_products}
        print(f"   Quantities before: {products_before}")
        
        response = requests.post(
            f"{BASE_URL}/recipes/{created_recipe_id}/cook",
            json={"portions": 1, "servings": 2, "deduct": False},
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Test 5a PASSED: 200 response")
            print(f"   ok: {data.get('ok')}")
            print(f"   portions: {data.get('portions')}")
            print(f"   deducted: {len(data.get('deducted', []))} items (should be 0)")
            
            if len(data.get('deducted', [])) == 0:
                print(f"✅ Test 5b PASSED: deducted array is empty")
            else:
                print(f"❌ Test 5b FAILED: deducted array should be empty")
            
            # Verify quantities unchanged
            response = requests.get(f"{BASE_URL}/products", headers=headers)
            products_after = {p['id']: p['quantity'] for p in response.json() if p['id'] in created_products}
            print(f"   Quantities after: {products_after}")
            
            if products_before == products_after:
                print(f"✅ Test 5c PASSED: Quantities unchanged in database")
            else:
                print(f"❌ Test 5c FAILED: Quantities changed when deduct=false")
        else:
            print(f"❌ Test 5 FAILED: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
        
        # ============================================================================
        # TEST 6: Over-deduction/clamp (short flag)
        # ============================================================================
        print("\n" + "=" * 80)
        print("TEST 6: Over-deduction/clamp (portions=100, servings=2, deduct=true)")
        print("=" * 80)
        
        # Current state: Eggs = 8ea
        # Recipe needs: 2ea per serving
        # Scale = 100/2 = 50
        # Needed: 2 * 50 = 100ea
        # Available: 8ea
        # Result: newQuantity=0, short=true
        
        response = requests.post(
            f"{BASE_URL}/recipes/{created_recipe_id}/cook",
            json={"portions": 100, "servings": 2, "deduct": True},
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Test 6a PASSED: 200 response")
            
            deducted = data.get('deducted', [])
            print(f"\n   Deducted items:")
            eggs_short = False
            for item in deducted:
                print(f"   - {item['productName']}: amount={item['amount']} {item['unit']}, newQuantity={item['newQuantity']}, short={item['short']}")
                
                if "Eggs" in item['productName']:
                    if item['newQuantity'] == 0 and item['short']:
                        eggs_short = True
                        print(f"     ✅ Eggs clamped at 0 with short=true")
                    else:
                        print(f"     ❌ Eggs should be clamped at 0 with short=true")
            
            if eggs_short:
                print("\n✅ Test 6b PASSED: Over-deduction handled correctly (clamped at 0, short=true)")
            else:
                print(f"\n❌ Test 6b FAILED: Over-deduction not handled correctly")
        else:
            print(f"❌ Test 6 FAILED: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
        
    except Exception as e:
        print(f"\n❌ TEST SUITE FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # ============================================================================
        # CLEANUP: Delete test data
        # ============================================================================
        print("\n" + "=" * 80)
        print("CLEANUP: Deleting test data")
        print("=" * 80)
        
        # Delete recipe
        if created_recipe_id:
            print(f"\n🗑️  Deleting recipe: {created_recipe_id}")
            response = requests.delete(f"{BASE_URL}/recipes/{created_recipe_id}", headers=headers)
            if response.status_code == 200:
                print(f"✅ Recipe deleted")
            else:
                print(f"❌ Failed to delete recipe: {response.status_code} - {response.text}")
        
        # Delete products
        for product_id in created_products:
            print(f"\n🗑️  Deleting product: {product_id}")
            response = requests.delete(f"{BASE_URL}/products/{product_id}", headers=headers)
            if response.status_code == 200:
                print(f"✅ Product deleted")
            else:
                print(f"❌ Failed to delete product: {response.status_code} - {response.text}")
        
        # Verify cleanup
        print("\n🔍 Verifying cleanup...")
        response = requests.get(f"{BASE_URL}/products", headers=headers)
        if response.status_code == 200:
            products = response.json()
            test_products = [p for p in products if p['name'].startswith('TEST-')]
            if len(test_products) == 0:
                print(f"✅ All test products deleted")
            else:
                print(f"⚠️  Warning: {len(test_products)} test products still exist:")
                for p in test_products:
                    print(f"   - {p['name']} (ID: {p['id']})")
        
        print("\n" + "=" * 80)
        print("TEST SUITE COMPLETE")
        print("=" * 80)

if __name__ == "__main__":
    test_recipe_cook_endpoint()
