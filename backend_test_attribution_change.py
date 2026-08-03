#!/usr/bin/env python3
"""
Test the CHANGED product attribution behavior in ShelfWise.

CHANGE UNDER TEST: PUT /api/products/:id now REPLACES custom_fields._addedBy 
with the person making the edit (previously it preserved the original adder 
and stamped a separate _editedBy). It also sets _editedAt and deletes _editedBy.

TEST SEQUENCE:
1. POST /api/products as person 'Dev' → expect addedBy='Dev'
2. PUT /api/products/<id> as person 'Parth' → expect addedBy='Parth' (REPLACED), editedBy='', editedAt set
3. Edit again as 'Xyz' → addedBy becomes owner's name, editedBy stays ''
4. DELETE /api/products/<id> (cleanup - mandatory)
"""

import os
import sys
import json
import subprocess
from datetime import datetime, timedelta

# Load environment variables
def load_env():
    env_vars = {}
    with open('/app/.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env_vars[key] = value
    return env_vars

env = load_env()
BASE_URL = env.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
JWT_SECRET = env.get('SHELFWISE_JWT_SECRET', 'local-dev-secret-shelfwise-2026')
KITCHEN_ID = 'a2573e6a-70f0-4a6d-97d0-ccf09b444643'

# Mint JWT for a specific person
def mint_jwt(person):
    """Mint a chef JWT with embedded person name"""
    cmd = f"""cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({{kitchen_id:'{KITCHEN_ID}',role:'chef',person:'{person}'}},process.env.SHELFWISE_JWT_SECRET,{{expiresIn:'1h'}}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT for {person}: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

# HTTP helper
def http_request(method, path, token=None, body=None):
    """Make HTTP request using curl"""
    import subprocess
    url = f"{BASE_URL}/api{path}"
    cmd = ['curl', '-s', '-w', '\nHTTP_CODE:%{http_code}', '-X', method, url]
    
    if token:
        cmd.extend(['-H', f'Authorization: Bearer {token}'])
    
    if body:
        cmd.extend(['-H', 'Content-Type: application/json', '-d', json.dumps(body)])
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Split response body and HTTP code
    output = result.stdout
    if 'HTTP_CODE:' in output:
        parts = output.rsplit('HTTP_CODE:', 1)
        body_text = parts[0].strip()
        http_code = parts[1].strip()
    else:
        body_text = output
        http_code = '000'
    
    # Try to parse JSON response
    try:
        response = json.loads(body_text)
        response['_http_code'] = http_code
        return response
    except:
        return {'raw': body_text, 'stderr': result.stderr, '_http_code': http_code}

print("=" * 80)
print("PRODUCT ATTRIBUTION CHANGE TEST")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Kitchen ID: {KITCHEN_ID}")
print(f"Test persons: Dev, Parth, Xyz")
print()

# Step 1: Mint JWT for Dev and create product
print("Step 1: Create product as person 'Dev'")
print("-" * 80)
dev_token = mint_jwt('Dev')
print(f"✓ Minted JWT for Dev")

product_body = {
    "name": "TEST-ATTRIBUTION-ITEM",
    "quantity": 3,
    "unit": "ea",
    "category": "Test",
    "storageType": "Fridge"
}

response = http_request('POST', '/products', token=dev_token, body=product_body)
print(f"Response: {json.dumps(response, indent=2)}")

if 'id' not in response:
    print(f"❌ FAILED: Expected 'id' in response, got: {response}")
    sys.exit(1)

product_id = response['id']
print(f"✓ Product created with ID: {product_id}")

# Verify addedBy is 'Dev'
if response.get('addedBy') != 'Dev':
    print(f"❌ FAILED: Expected addedBy='Dev', got '{response.get('addedBy')}'")
    sys.exit(1)
print(f"✓ addedBy = '{response.get('addedBy')}' (correct)")
print()

# Step 2: Edit product as person 'Parth'
print("Step 2: Edit product as person 'Parth'")
print("-" * 80)
parth_token = mint_jwt('Parth')
print(f"✓ Minted JWT for Parth")

edit_body = {
    "name": "TEST-ATTRIBUTION-ITEM",
    "quantity": 5,  # Changed from 3 to 5
    "unit": "ea",
    "category": "Test",
    "storageType": "Fridge"
}

response = http_request('PUT', f'/products/{product_id}', token=parth_token, body=edit_body)
print(f"Response: {json.dumps(response, indent=2)}")

if 'id' not in response:
    print(f"❌ FAILED: Expected 'id' in response, got: {response}")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)

# Verify addedBy is now 'Parth' (REPLACED)
if response.get('addedBy') != 'Parth':
    print(f"❌ FAILED: Expected addedBy='Parth' (REPLACED), got '{response.get('addedBy')}'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ addedBy = '{response.get('addedBy')}' (REPLACED from 'Dev' to 'Parth')")

# Verify editedBy is empty
if response.get('editedBy') != '':
    print(f"❌ FAILED: Expected editedBy='', got '{response.get('editedBy')}'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ editedBy = '' (correct)")

# Verify editedAt is set
if not response.get('editedAt'):
    print(f"❌ FAILED: Expected editedAt to be set, got '{response.get('editedAt')}'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ editedAt = '{response.get('editedAt')}' (set)")

# Verify quantity changed
if response.get('quantity') != 5:
    print(f"❌ FAILED: Expected quantity=5, got {response.get('quantity')}")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ quantity = {response.get('quantity')} (updated)")
print()

# Step 3: Edit product as person 'Xyz' (owner)
print("Step 3: Edit product as person 'Xyz' (owner)")
print("-" * 80)
xyz_token = mint_jwt('Xyz')
print(f"✓ Minted JWT for Xyz")

edit_body2 = {
    "name": "TEST-ATTRIBUTION-ITEM",
    "quantity": 7,  # Changed from 5 to 7
    "unit": "ea",
    "category": "Test",
    "storageType": "Fridge"
}

response = http_request('PUT', f'/products/{product_id}', token=xyz_token, body=edit_body2)
print(f"Response: {json.dumps(response, indent=2)}")

if 'id' not in response:
    print(f"❌ FAILED: Expected 'id' in response, got: {response}")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)

# Verify addedBy changed from 'Parth' to owner's name (accept any non-'Parth' name)
new_added_by = response.get('addedBy')
if new_added_by == 'Parth':
    print(f"❌ FAILED: Expected addedBy to change from 'Parth', but it's still 'Parth'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ addedBy = '{new_added_by}' (REPLACED from 'Parth' to owner's name)")

# Verify editedBy is still empty
if response.get('editedBy') != '':
    print(f"❌ FAILED: Expected editedBy='', got '{response.get('editedBy')}'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ editedBy = '' (still empty)")

# Verify editedAt is updated
if not response.get('editedAt'):
    print(f"❌ FAILED: Expected editedAt to be set, got '{response.get('editedAt')}'")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ editedAt = '{response.get('editedAt')}' (updated)")

# Verify quantity changed
if response.get('quantity') != 7:
    print(f"❌ FAILED: Expected quantity=7, got {response.get('quantity')}")
    # Try to cleanup
    http_request('DELETE', f'/products/{product_id}', token=dev_token)
    sys.exit(1)
print(f"✓ quantity = {response.get('quantity')} (updated)")
print()

# Step 4: Cleanup - DELETE product
print("Step 4: Cleanup - DELETE product")
print("-" * 80)
response = http_request('DELETE', f'/products/{product_id}', token=dev_token)
print(f"Response: {json.dumps(response, indent=2)}")

# Verify deletion by trying to GET the product
get_response = http_request('GET', f'/products/{product_id}', token=dev_token)
if 'error' not in get_response and get_response.get('id') == product_id:
    print(f"❌ FAILED: Product still exists after deletion")
    sys.exit(1)
print(f"✓ Product deleted successfully (verified by GET)")
print()

print("=" * 80)
print("✅ ALL TESTS PASSED")
print("=" * 80)
print()
print("Summary:")
print("- ✓ Product created as 'Dev' → addedBy='Dev'")
print("- ✓ Product edited as 'Parth' → addedBy='Parth' (REPLACED), editedBy='', editedAt set")
print("- ✓ Product edited as 'Xyz' → addedBy changed to owner's name, editedBy='', editedAt updated")
print("- ✓ Product deleted successfully (cleanup complete)")
print()
print("ATTRIBUTION REPLACEMENT BEHAVIOR VERIFIED ✓")
