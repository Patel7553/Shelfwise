#!/usr/bin/env python3
"""
Backend test for Barcode Memory API endpoints
Tests GET/POST /api/barcodes and product creation with customFields.barcode
Uses REAL production Supabase DB with approved test kitchen a2573e6a-70f0-4a6d-97d0-ccf09b444643
"""

import requests
import json
import subprocess
import os
from datetime import datetime, timedelta

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://kitchen-stock-39.preview.emergentagent.com')
TEST_KITCHEN_ID = 'a2573e6a-70f0-4a6d-97d0-ccf09b444643'
TEST_BARCODE = 'TEST9999999999'
TEST_PRODUCT_NAME = 'TEST Barcode Product'

# Mint a chef JWT for the test kitchen
def mint_jwt():
    """Mint a chef JWT using SHELFWISE_JWT_SECRET from .env"""
    cmd = f"""cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({{kitchen_id:'{TEST_KITCHEN_ID}',role:'chef',person:'Xyz'}},process.env.SHELFWISE_JWT_SECRET,{{expiresIn:'12h'}}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Failed to mint JWT: {result.stderr}")
    # Extract only the JWT token (last line, ignore dotenvx output)
    lines = result.stdout.strip().split('\n')
    token = lines[-1].strip()
    return token

def get_supabase_service_key():
    """Get Supabase service role key from .env"""
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                return line.split('=', 1)[1].strip()
    raise Exception("SUPABASE_SERVICE_ROLE_KEY not found in .env")

def get_supabase_url():
    """Get Supabase URL from .env"""
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
                return line.split('=', 1)[1].strip()
    raise Exception("NEXT_PUBLIC_SUPABASE_URL not found in .env")

print("=" * 80)
print("BARCODE MEMORY API BACKEND TEST")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Test Kitchen ID: {TEST_KITCHEN_ID}")
print(f"Test Barcode: {TEST_BARCODE}")
print(f"Test Product: {TEST_PRODUCT_NAME}")
print()

# Mint JWT
print("Minting chef JWT...")
try:
    jwt_token = mint_jwt()
    print(f"✓ JWT minted successfully (length: {len(jwt_token)})")
except Exception as e:
    print(f"✗ Failed to mint JWT: {e}")
    exit(1)

headers = {
    'Authorization': f'Bearer {jwt_token}',
    'Content-Type': 'application/json'
}

# Store original barcode map for cleanup
original_barcode_map = None
created_product_ids = []

print()
print("=" * 80)
print("TEST 1: GET /api/barcodes with valid JWT → 200, returns JSON object")
print("=" * 80)
try:
    response = requests.get(f'{BASE_URL}/api/barcodes', headers=headers, timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, dict):
            print(f"✓ Test 1 PASSED: Returns JSON object with {len(data)} entries")
            original_barcode_map = data.copy()
            print(f"  Saved original barcode map for cleanup ({len(original_barcode_map)} entries)")
        else:
            print(f"✗ Test 1 FAILED: Expected dict, got {type(data)}")
    else:
        print(f"✗ Test 1 FAILED: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"✗ Test 1 FAILED with exception: {e}")

print()
print("=" * 80)
print("TEST 2: POST /api/barcodes with TEST data → success, then GET must include it")
print("=" * 80)
try:
    payload = {
        'code': TEST_BARCODE,
        'name': TEST_PRODUCT_NAME,
        'unit': 'ea',
        'category': 'Dairy',
        'storageType': 'Fridge'
    }
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    response = requests.post(f'{BASE_URL}/api/barcodes', headers=headers, json=payload, timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('ok'):
            print(f"✓ POST succeeded: {json.dumps(data, indent=2)}")
            
            # Verify with GET
            print("  Verifying with GET /api/barcodes...")
            get_response = requests.get(f'{BASE_URL}/api/barcodes', headers=headers, timeout=30)
            if get_response.status_code == 200:
                barcode_map = get_response.json()
                if TEST_BARCODE in barcode_map:
                    entry = barcode_map[TEST_BARCODE]
                    print(f"  ✓ Found barcode entry: {json.dumps(entry, indent=2)}")
                    
                    # Verify all fields
                    checks = [
                        ('name', TEST_PRODUCT_NAME),
                        ('unit', 'ea'),
                        ('category', 'Dairy'),
                        ('storageType', 'Fridge')
                    ]
                    all_match = True
                    for field, expected in checks:
                        actual = entry.get(field)
                        if actual == expected:
                            print(f"    ✓ {field}: {actual}")
                        else:
                            print(f"    ✗ {field}: expected '{expected}', got '{actual}'")
                            all_match = False
                    
                    if all_match and 'savedAt' in entry:
                        print(f"    ✓ savedAt: {entry['savedAt']}")
                        print(f"✓ Test 2 PASSED: Barcode saved and retrieved correctly")
                    else:
                        print(f"✗ Test 2 FAILED: Field mismatch or missing savedAt")
                else:
                    print(f"✗ Test 2 FAILED: Barcode {TEST_BARCODE} not found in map")
            else:
                print(f"✗ Test 2 FAILED: GET returned {get_response.status_code}")
        else:
            print(f"✗ Test 2 FAILED: POST did not return ok:true")
    else:
        print(f"✗ Test 2 FAILED: Expected 200, got {response.status_code}")
except Exception as e:
    print(f"✗ Test 2 FAILED with exception: {e}")

print()
print("=" * 80)
print("TEST 3: POST /api/products with customFields.barcode → 200/201, then GET must show it")
print("=" * 80)
try:
    today = datetime.now().strftime('%Y-%m-%d')
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    payload = {
        'name': TEST_PRODUCT_NAME,
        'quantity': 2,
        'unit': 'ea',
        'storageType': 'Fridge',
        'dateReceived': today,
        'expiryDate': tomorrow,
        'customFields': {
            'barcode': TEST_BARCODE
        }
    }
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    response = requests.post(f'{BASE_URL}/api/products', headers=headers, json=payload, timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code in [200, 201]:
        data = response.json()
        product_id = data.get('id')
        if product_id:
            created_product_ids.append(product_id)
            print(f"✓ Product created with ID: {product_id}")
            
            # Verify with GET
            print("  Verifying with GET /api/products...")
            get_response = requests.get(f'{BASE_URL}/api/products', headers=headers, timeout=30)
            if get_response.status_code == 200:
                products = get_response.json()
                test_product = next((p for p in products if p.get('id') == product_id), None)
                if test_product:
                    print(f"  ✓ Found product: {test_product.get('name')}")
                    custom_fields = test_product.get('customFields', {})
                    barcode = custom_fields.get('barcode')
                    if barcode == TEST_BARCODE:
                        print(f"    ✓ customFields.barcode: {barcode}")
                        print(f"✓ Test 3 PASSED: Product created with barcode in customFields")
                    else:
                        print(f"    ✗ customFields.barcode: expected '{TEST_BARCODE}', got '{barcode}'")
                        print(f"✗ Test 3 FAILED: Barcode mismatch")
                else:
                    print(f"✗ Test 3 FAILED: Product {product_id} not found in GET response")
            else:
                print(f"✗ Test 3 FAILED: GET returned {get_response.status_code}")
        else:
            print(f"✗ Test 3 FAILED: No product ID in response")
    else:
        print(f"✗ Test 3 FAILED: Expected 200/201, got {response.status_code}")
except Exception as e:
    print(f"✗ Test 3 FAILED with exception: {e}")

print()
print("=" * 80)
print("TEST 4: Auth checks - GET /api/barcodes WITHOUT Authorization → 401")
print("=" * 80)
try:
    response = requests.get(f'{BASE_URL}/api/barcodes', timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
    
    if response.status_code == 401:
        print(f"✓ Test 4a PASSED: GET /api/barcodes without auth → 401")
    else:
        print(f"✗ Test 4a FAILED: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"✗ Test 4a FAILED with exception: {e}")

print()
print("=" * 80)
print("TEST 5: Auth checks - POST /api/barcodes WITHOUT Authorization → 401")
print("=" * 80)
try:
    payload = {
        'code': 'TEST123',
        'name': 'Test Product'
    }
    response = requests.post(f'{BASE_URL}/api/barcodes', json=payload, timeout=30)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
    
    if response.status_code == 401:
        print(f"✓ Test 5 PASSED: POST /api/barcodes without auth → 401")
    else:
        print(f"✗ Test 5 FAILED: Expected 401, got {response.status_code}")
except Exception as e:
    print(f"✗ Test 5 FAILED with exception: {e}")

print()
print("=" * 80)
print("CLEANUP: Deleting test products and restoring barcode map")
print("=" * 80)

# Delete created products
for product_id in created_product_ids:
    try:
        print(f"Deleting product {product_id}...")
        response = requests.delete(f'{BASE_URL}/api/products/{product_id}', headers=headers, timeout=30)
        if response.status_code == 200:
            print(f"  ✓ Product {product_id} deleted")
        else:
            print(f"  ✗ Failed to delete product {product_id}: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Failed to delete product {product_id}: {e}")

# Restore original barcode map by removing TEST entry
if original_barcode_map is not None:
    try:
        print(f"Restoring original barcode map (removing {TEST_BARCODE})...")
        
        # Get current map
        response = requests.get(f'{BASE_URL}/api/barcodes', headers=headers, timeout=30)
        if response.status_code == 200:
            current_map = response.json()
            
            # If TEST barcode exists and wasn't in original, we need to remove it
            if TEST_BARCODE in current_map and TEST_BARCODE not in original_barcode_map:
                print(f"  TEST barcode {TEST_BARCODE} needs to be removed")
                
                # Use Supabase REST API to restore the original map
                supabase_url = get_supabase_url()
                service_key = get_supabase_service_key()
                
                storage_url = f"{supabase_url}/storage/v1/object/receipts/barcode-maps/{TEST_KITCHEN_ID}.json"
                storage_headers = {
                    'Authorization': f'Bearer {service_key}',
                    'Content-Type': 'application/json'
                }
                
                # Upload original map
                upload_response = requests.put(
                    storage_url,
                    headers=storage_headers,
                    data=json.dumps(original_barcode_map),
                    timeout=30
                )
                
                if upload_response.status_code in [200, 201]:
                    print(f"  ✓ Original barcode map restored via Supabase storage")
                    
                    # Verify
                    verify_response = requests.get(f'{BASE_URL}/api/barcodes', headers=headers, timeout=30)
                    if verify_response.status_code == 200:
                        final_map = verify_response.json()
                        if TEST_BARCODE not in final_map:
                            print(f"  ✓ Verified: TEST barcode removed from map")
                        else:
                            print(f"  ✗ Warning: TEST barcode still in map after restore")
                else:
                    print(f"  ✗ Failed to restore barcode map: {upload_response.status_code}")
                    print(f"     Response: {upload_response.text[:200]}")
            elif TEST_BARCODE not in current_map:
                print(f"  ✓ TEST barcode not in current map, no cleanup needed")
            else:
                print(f"  ℹ TEST barcode was in original map, leaving it as-is")
        else:
            print(f"  ✗ Failed to get current barcode map: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Failed to restore barcode map: {e}")
else:
    print("  ℹ No original barcode map saved, skipping restore")

# Final verification
print()
print("=" * 80)
print("FINAL VERIFICATION")
print("=" * 80)
try:
    # Check products
    response = requests.get(f'{BASE_URL}/api/products', headers=headers, timeout=30)
    if response.status_code == 200:
        products = response.json()
        test_products = [p for p in products if p.get('name', '').startswith('TEST')]
        if len(test_products) == 0:
            print(f"✓ No TEST products remaining in inventory")
        else:
            print(f"✗ Warning: {len(test_products)} TEST products still in inventory:")
            for p in test_products:
                print(f"  - {p.get('name')} (ID: {p.get('id')})")
    
    # Check barcode map
    response = requests.get(f'{BASE_URL}/api/barcodes', headers=headers, timeout=30)
    if response.status_code == 200:
        barcode_map = response.json()
        if TEST_BARCODE in barcode_map:
            print(f"✗ Warning: TEST barcode {TEST_BARCODE} still in barcode map")
        else:
            print(f"✓ TEST barcode removed from barcode map")
except Exception as e:
    print(f"✗ Final verification failed: {e}")

print()
print("=" * 80)
print("BARCODE MEMORY API TEST COMPLETE")
print("=" * 80)
