#!/usr/bin/env python3
"""
Focused test for POST /api/products/assign-supplier endpoint.
Tests auth, validation, happy path with cleanup, and cross-kitchen safety.
"""

import requests
import subprocess
import json
import sys

# Base URL from .env
BASE_URL = "http://localhost:3000"

# Test kitchen ID
KITCHEN_ID = "a2573e6a-70f0-4a6d-97d0-ccf09b444643"

def mint_chef_jwt():
    """Mint a chef JWT using SHELFWISE_JWT_SECRET from .env"""
    cmd = [
        "node", "-e",
        "require('dotenv').config(); "
        "console.log(require('jsonwebtoken').sign("
        "{kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},"
        "process.env.SHELFWISE_JWT_SECRET,"
        "{expiresIn:'12h'}))"
    ]
    result = subprocess.run(cmd, cwd="/app", capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    # Extract only the JWT token (last line, starts with eyJ)
    lines = result.stdout.strip().split('\n')
    for line in reversed(lines):
        if line.startswith('eyJ'):
            return line.strip()
    return result.stdout.strip()

def test_1_no_auth():
    """Test 1: POST /api/products/assign-supplier without Authorization header → 401"""
    print("\n=== Test 1: POST without Authorization header ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/products/assign-supplier",
            json={"productIds": ["some-uuid"], "supplier": "Test Supplier"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 401:
            print("✅ Test 1 PASSED: 401 without auth")
            return True
        else:
            print(f"❌ Test 1 FAILED: Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Test 1 FAILED with exception: {e}")
        return False

def test_2_empty_product_ids(token):
    """Test 2: With auth, body {productIds: [], supplier: "X"} → 400 "productIds required" """
    print("\n=== Test 2: Empty productIds array ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/products/assign-supplier",
            headers={"Authorization": f"Bearer {token}"},
            json={"productIds": [], "supplier": "Test Supplier"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400 and "productIds required" in response.text:
            print("✅ Test 2 PASSED: 400 with 'productIds required'")
            return True
        else:
            print(f"❌ Test 2 FAILED: Expected 400 with 'productIds required', got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 2 FAILED with exception: {e}")
        return False

def test_3_empty_supplier(token):
    """Test 3: With auth, body {productIds: ["some-uuid"], supplier: ""} → 400 "supplier required" """
    print("\n=== Test 3: Empty supplier string ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/products/assign-supplier",
            headers={"Authorization": f"Bearer {token}"},
            json={"productIds": ["some-uuid"], "supplier": ""},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 400 and "supplier required" in response.text:
            print("✅ Test 3 PASSED: 400 with 'supplier required'")
            return True
        else:
            print(f"❌ Test 3 FAILED: Expected 400 with 'supplier required', got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Test 3 FAILED with exception: {e}")
        return False

def test_4_happy_path_with_cleanup(token):
    """Test 4: Happy path - create product, assign supplier, verify, delete"""
    print("\n=== Test 4: Happy path with cleanup ===")
    
    product_id = None
    try:
        # Step 1: Create test product
        print("Step 1: Creating test product...")
        create_response = requests.post(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "TEST AssignSup",
                "quantity": 1,
                "unit": "ea",
                "storageType": "Fridge"
            },
            timeout=10
        )
        print(f"Create status: {create_response.status_code}")
        
        if create_response.status_code not in [200, 201]:
            print(f"❌ Test 4 FAILED: Could not create test product: {create_response.text}")
            return False
        
        create_data = create_response.json()
        product_id = create_data.get("id")
        print(f"Created product ID: {product_id}")
        
        if not product_id:
            print("❌ Test 4 FAILED: No product ID returned")
            return False
        
        # Step 2: Assign supplier
        print("\nStep 2: Assigning supplier...")
        assign_response = requests.post(
            f"{BASE_URL}/api/products/assign-supplier",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "productIds": [product_id],
                "supplier": "TEST Supplier X"
            },
            timeout=10
        )
        print(f"Assign status: {assign_response.status_code}")
        print(f"Assign response: {assign_response.text}")
        
        if assign_response.status_code != 200:
            print(f"❌ Test 4 FAILED: Could not assign supplier: {assign_response.text}")
            return False
        
        assign_data = assign_response.json()
        if assign_data.get("updated") != 1:
            print(f"❌ Test 4 FAILED: Expected updated=1, got {assign_data.get('updated')}")
            return False
        
        print(f"✅ Assigned supplier, updated count: {assign_data.get('updated')}")
        
        # Step 3: Verify via GET /api/products
        print("\nStep 3: Verifying supplier assignment...")
        get_response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if get_response.status_code != 200:
            print(f"❌ Test 4 FAILED: Could not fetch products: {get_response.text}")
            return False
        
        products = get_response.json()
        test_product = next((p for p in products if p.get("id") == product_id), None)
        
        if not test_product:
            print(f"❌ Test 4 FAILED: Test product not found in GET response")
            return False
        
        if test_product.get("supplier") != "TEST Supplier X":
            print(f"❌ Test 4 FAILED: Expected supplier 'TEST Supplier X', got '{test_product.get('supplier')}'")
            return False
        
        print(f"✅ Verified supplier: {test_product.get('supplier')}")
        
        # Step 4: Delete test product
        print("\nStep 4: Deleting test product...")
        delete_response = requests.delete(
            f"{BASE_URL}/api/products/{product_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"Delete status: {delete_response.status_code}")
        
        if delete_response.status_code not in [200, 204]:
            print(f"❌ Test 4 FAILED: Could not delete test product: {delete_response.text}")
            return False
        
        # Step 5: Verify deletion
        print("\nStep 5: Verifying deletion...")
        verify_response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if verify_response.status_code == 200:
            products_after = verify_response.json()
            if any(p.get("id") == product_id for p in products_after):
                print(f"❌ Test 4 FAILED: Test product still exists after deletion")
                return False
            print("✅ Verified product deleted")
        
        print("✅ Test 4 PASSED: Happy path complete")
        return True
        
    except Exception as e:
        print(f"❌ Test 4 FAILED with exception: {e}")
        # Attempt cleanup
        if product_id:
            try:
                requests.delete(
                    f"{BASE_URL}/api/products/{product_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10
                )
                print(f"Cleanup: Deleted test product {product_id}")
            except:
                pass
        return False

def test_5_cross_kitchen_safety(token):
    """Test 5: Cross-kitchen safety - non-existent UUID → 200 {updated: 0}"""
    print("\n=== Test 5: Cross-kitchen safety (non-existent UUID) ===")
    try:
        # Use a random UUID that doesn't exist
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        
        response = requests.post(
            f"{BASE_URL}/api/products/assign-supplier",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "productIds": [fake_uuid],
                "supplier": "TEST Supplier Y"
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 200:
            print(f"❌ Test 5 FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get("updated") != 0:
            print(f"❌ Test 5 FAILED: Expected updated=0, got {data.get('updated')}")
            return False
        
        print("✅ Test 5 PASSED: Cross-kitchen safety verified (updated=0 for non-existent UUID)")
        return True
        
    except Exception as e:
        print(f"❌ Test 5 FAILED with exception: {e}")
        return False

def main():
    print("=" * 80)
    print("FOCUSED TEST: POST /api/products/assign-supplier")
    print("=" * 80)
    
    # Mint JWT
    print("\n🔑 Minting chef JWT...")
    token = mint_chef_jwt()
    print(f"Token: {token[:50]}...")
    
    # Run all tests
    results = []
    results.append(("Test 1: No auth → 401", test_1_no_auth()))
    results.append(("Test 2: Empty productIds → 400", test_2_empty_product_ids(token)))
    results.append(("Test 3: Empty supplier → 400", test_3_empty_supplier(token)))
    results.append(("Test 4: Happy path with cleanup", test_4_happy_path_with_cleanup(token)))
    results.append(("Test 5: Cross-kitchen safety", test_5_cross_kitchen_safety(token)))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
