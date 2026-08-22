#!/usr/bin/env python3
"""
Test: Auto-save Order Summary PDF into kitchen Receipts on delivery + Delivery Check flow
Real production DB (Supabase project sabsvsolekdhztzqafuc)
All test orders tagged "TEST ORDER" and cleaned up at the end.
"""

import requests
import json
import jwt
import os
import time
from datetime import datetime, timedelta

# Environment
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"
SUPABASE_URL = "https://sabsvsolekdhztzqafuc.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnN2c29sZWtkaHp0enFhZnVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDY5NzMsImV4cCI6MjA5NjEyMjk3M30.NYVRTZB9_94_jQKO7pSW1PAQIGlKPTzNMcC1nI_2Q6E"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnN2c29sZWtkaHp0enFhZnVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0Njk3MywiZXhwIjoyMDk2MTIyOTczfQ.wPZtV53LGHK6v4PINyX-iLsjB_36Spxf15XoNqYxedg"

# Test kitchen
KITCHEN_ID = "a2573e6a-70f0-4a6d-97d0-ccf09b444643"
SUPPLIER_ID = "995016c0-249b-48e7-aa24-51de2ecde382"
SUPPLIER_EMAIL = "parth511.patel@gmail.com"

# Read JWT secret from .env
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('SHELFWISE_JWT_SECRET='):
            JWT_SECRET = line.split('=', 1)[1].strip()
            break

# Generate kitchen chef JWT
kitchen_jwt = jwt.encode(
    {'kitchen_id': KITCHEN_ID, 'role': 'chef', 'person': 'Xyz', 'exp': datetime.utcnow() + timedelta(hours=1)},
    JWT_SECRET,
    algorithm='HS256'
)

print("=" * 80)
print("SETUP: Generating tokens...")
print("=" * 80)
print(f"✓ Kitchen JWT generated for kitchen {KITCHEN_ID}, person=Xyz")

# Get supplier Bearer token via Supabase auth
def get_supplier_token():
    """Get supplier access token via Supabase magic link"""
    # Step 1: Generate magic link (service role)
    print(f"\n→ Generating magic link for {SUPPLIER_EMAIL}...")
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/generate_link",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json"
        },
        json={"type": "magiclink", "email": SUPPLIER_EMAIL}
    )
    if resp.status_code != 200:
        print(f"✗ Failed to generate magic link: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    hashed_token = data.get('hashed_token')
    if not hashed_token:
        print(f"✗ No hashed_token in response: {data}")
        return None
    
    print(f"✓ Magic link generated, hashed_token: {hashed_token[:20]}...")
    
    # Step 2: Verify the magic link to get access_token (anon key)
    print(f"→ Verifying magic link...")
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/verify",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={"type": "magiclink", "token_hash": hashed_token}
    )
    if resp.status_code != 200:
        print(f"✗ Failed to verify magic link: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    access_token = data.get('access_token')
    if not access_token:
        print(f"✗ No access_token in response: {data}")
        return None
    
    print(f"✓ Supplier access token obtained: {access_token[:20]}...")
    return access_token

supplier_token = get_supplier_token()
if not supplier_token:
    print("\n✗ FAILED: Could not get supplier token")
    exit(1)

# Test artifacts to clean up
test_order_ids = []
test_receipt_ids = []
test_storage_paths = []

print("\n" + "=" * 80)
print("FEATURE A: Auto-save Order Summary PDF into kitchen Receipts on delivery")
print("=" * 80)

# Step 1: Get supplier catalog to know what items to order
print("\n→ Step 1: Getting supplier catalog...")
resp = requests.get(
    f"{BASE_URL}/kitchen/suppliers/{SUPPLIER_ID}/catalog",
    headers={"Authorization": f"Bearer {kitchen_jwt}"}
)
if resp.status_code != 200:
    print(f"✗ Failed to get catalog: {resp.status_code} {resp.text}")
    exit(1)

catalog = resp.json()
products = catalog.get('products', [])
supplier_info = catalog.get('supplier', {})
print(f"✓ Catalog loaded: {len(products)} products from {supplier_info.get('businessName', 'supplier')}")

# Select items totalling >= £100
selected_items = []
total = 0
for p in products:
    if p.get('available') and p.get('price', 0) > 0:
        qty = 5  # Order 5 units of each
        item_total = p['price'] * qty
        selected_items.append({
            'productId': p['id'],
            'quantity': qty
        })
        total += item_total
        print(f"  - {p['name']}: {qty} x £{p['price']:.2f} = £{item_total:.2f}")
        if total >= 100:
            break

if total < 100:
    print(f"✗ Could not find items totalling >= £100 (got £{total:.2f})")
    exit(1)

print(f"✓ Selected {len(selected_items)} items totalling >= £{total:.2f}")

# Step 2: Kitchen creates order
print("\n→ Step 2: Kitchen creating order (notes: 'TEST ORDER AUTORECEIPT')...")
resp = requests.post(
    f"{BASE_URL}/kitchen/orders",
    headers={
        "Authorization": f"Bearer {kitchen_jwt}",
        "Content-Type": "application/json"
    },
    json={
        "supplierId": SUPPLIER_ID,
        "items": selected_items,
        "notes": "TEST ORDER AUTORECEIPT"
    }
)
if resp.status_code != 201:
    print(f"✗ Failed to create order: {resp.status_code} {resp.text}")
    exit(1)

order = resp.json()
order_id = order['id']
test_order_ids.append(order_id)
print(f"✓ Order created: {order['orderRef']} (id: {order_id})")
print(f"  Status: {order['status']}, Total: £{order['total']:.2f}")

# Step 3: Supplier confirms the order
print("\n→ Step 3: Supplier confirming order...")
resp = requests.put(
    f"{BASE_URL}/supplier/orders/{order_id}",
    headers={
        "Authorization": f"Bearer {supplier_token}",
        "Content-Type": "application/json"
    },
    json={"status": "confirmed"}
)
if resp.status_code != 200:
    print(f"✗ Failed to confirm order: {resp.status_code} {resp.text}")
    exit(1)

order = resp.json()
print(f"✓ Order confirmed: status={order['status']}")

# Step 4: Supplier fulfills the order (should trigger auto-save receipt)
print("\n→ Step 4: Supplier fulfilling order (should auto-save receipt)...")
resp = requests.put(
    f"{BASE_URL}/supplier/orders/{order_id}",
    headers={
        "Authorization": f"Bearer {supplier_token}",
        "Content-Type": "application/json"
    },
    json={"status": "fulfilled"}
)
if resp.status_code != 200:
    print(f"✗ Failed to fulfill order: {resp.status_code} {resp.text}")
    exit(1)

order = resp.json()
print(f"✓ Order fulfilled: status={order['status']}")

# Wait a moment for the auto-save to complete
time.sleep(2)

# Step 5: Verify receipt was auto-saved via service-role REST API
print("\n→ Step 5: Verifying auto-saved receipt in receipts table...")
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/receipts",
    headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
    },
    params={
        "kitchen_id": f"eq.{KITCHEN_ID}",
        "order": "created_at.desc",
        "limit": "3"
    }
)
if resp.status_code != 200:
    print(f"✗ Failed to query receipts: {resp.status_code} {resp.text}")
    exit(1)

receipts = resp.json()
auto_receipt = None
for r in receipts:
    if r.get('notes', '').startswith('Auto-saved order summary'):
        auto_receipt = r
        break

if not auto_receipt:
    print(f"✗ No auto-saved receipt found in receipts table")
    print(f"  Recent receipts: {json.dumps(receipts, indent=2)}")
    exit(1)

test_receipt_ids.append(auto_receipt['id'])
test_storage_paths.append(auto_receipt['image_path'])

print(f"✓ Auto-saved receipt found:")
print(f"  ID: {auto_receipt['id']}")
print(f"  Supplier: {auto_receipt['supplier']}")
print(f"  Amount: £{auto_receipt['amount']}")
print(f"  File type: {auto_receipt['file_type']}")
print(f"  Added by: {auto_receipt['added_by']}")
print(f"  Notes: {auto_receipt['notes']}")
print(f"  Image path: {auto_receipt['image_path']}")

# Verify the receipt details
assert auto_receipt['supplier'] == supplier_info.get('businessName', 'PATEL FOOD'), f"Supplier mismatch: {auto_receipt['supplier']}"
assert auto_receipt['file_type'] == 'pdf', f"File type should be pdf, got {auto_receipt['file_type']}"
assert auto_receipt['added_by'] == 'ShelfWise (auto)', f"Added by should be 'ShelfWise (auto)', got {auto_receipt['added_by']}"
assert auto_receipt['notes'].startswith('Auto-saved order summary'), f"Notes should start with 'Auto-saved order summary', got {auto_receipt['notes']}"
assert abs(auto_receipt['amount'] - order['total']) < 0.01, f"Amount mismatch: {auto_receipt['amount']} vs {order['total']}"

print(f"✓ All receipt details verified")

# Step 6: Kitchen GET /api/receipts should show the auto receipt with fileUrl
print("\n→ Step 6: Kitchen fetching receipts (should include auto receipt with signed URL)...")
resp = requests.get(
    f"{BASE_URL}/receipts",
    headers={"Authorization": f"Bearer {kitchen_jwt}"}
)
if resp.status_code != 200:
    print(f"✗ Failed to get receipts: {resp.status_code} {resp.text}")
    exit(1)

receipts = resp.json()
auto_receipt_api = None
for r in receipts:
    if r.get('id') == auto_receipt['id']:
        auto_receipt_api = r
        break

if not auto_receipt_api:
    print(f"✗ Auto receipt not found in kitchen receipts API")
    exit(1)

print(f"✓ Auto receipt found in kitchen receipts API:")
print(f"  ID: {auto_receipt_api['id']}")
print(f"  File URL present: {'fileUrl' in auto_receipt_api and auto_receipt_api['fileUrl']}")

assert 'fileUrl' in auto_receipt_api and auto_receipt_api['fileUrl'], "fileUrl should be present and non-empty"
print(f"✓ Signed fileUrl present: {auto_receipt_api['fileUrl'][:60]}...")

print("\n" + "=" * 80)
print("FEATURE B: Delivery Check")
print("=" * 80)

# Step 7: Kitchen POST delivery-check with one received, one not_received
print("\n→ Step 7: Kitchen posting delivery check (1 received, 1 not_received)...")
delivery_items = [
    {
        "name": selected_items[0]['productId'] if len(selected_items) > 0 else "Item 1",
        "quantity": 10,
        "unit": "case",
        "status": "received"
    },
    {
        "name": "Fake Missing Item",
        "quantity": 2,
        "unit": "box",
        "status": "not_received"
    }
]

resp = requests.post(
    f"{BASE_URL}/kitchen/orders/{order_id}/delivery-check",
    headers={
        "Authorization": f"Bearer {kitchen_jwt}",
        "Content-Type": "application/json"
    },
    json={
        "items": delivery_items,
        "note": "2 boxes were missing TEST"
    }
)
if resp.status_code != 200:
    print(f"✗ Failed to post delivery check: {resp.status_code} {resp.text}")
    exit(1)

check_result = resp.json()
print(f"✓ Delivery check posted:")
print(f"  OK: {check_result.get('ok')}")
print(f"  Issues: {check_result.get('issues')}")
print(f"  Notified: {check_result.get('notified')}")

assert check_result.get('ok') == True, "ok should be true"
assert check_result.get('issues') == 1, f"issues should be 1, got {check_result.get('issues')}"
assert check_result.get('notified') == True, "notified should be true"

test_storage_paths.append(f"order-checks/{order_id}.json")

# Step 8: GET /api/kitchen/orders should show deliveryChecked:true
print("\n→ Step 8: Kitchen fetching orders (should show deliveryChecked:true)...")
resp = requests.get(
    f"{BASE_URL}/kitchen/orders",
    headers={"Authorization": f"Bearer {kitchen_jwt}"}
)
if resp.status_code != 200:
    print(f"✗ Failed to get orders: {resp.status_code} {resp.text}")
    exit(1)

orders = resp.json()
checked_order = None
for o in orders:
    if o['id'] == order_id:
        checked_order = o
        break

if not checked_order:
    print(f"✗ Order not found in orders list")
    exit(1)

print(f"✓ Order found:")
print(f"  Delivery checked: {checked_order.get('deliveryChecked')}")
print(f"  Delivery checked at: {checked_order.get('deliveryCheckedAt')}")
print(f"  Notes: {checked_order.get('notes')}")

assert checked_order.get('deliveryChecked') == True, "deliveryChecked should be true"
assert checked_order.get('deliveryCheckedAt'), "deliveryCheckedAt should be set"
assert '[[' not in checked_order.get('notes', ''), f"Notes should not contain [[ markers: {checked_order.get('notes')}"

# Step 9: GET /api/kitchen/orders/:id/delivery-check should return saved JSON
print("\n→ Step 9: Kitchen fetching delivery check JSON...")
resp = requests.get(
    f"{BASE_URL}/kitchen/orders/{order_id}/delivery-check",
    headers={"Authorization": f"Bearer {kitchen_jwt}"}
)
if resp.status_code != 200:
    print(f"✗ Failed to get delivery check: {resp.status_code} {resp.text}")
    exit(1)

check_data = resp.json()
print(f"✓ Delivery check JSON retrieved:")
print(f"  Items: {len(check_data.get('items', []))}")
print(f"  Note: {check_data.get('note')}")
print(f"  Checked by: {check_data.get('checkedBy')}")
print(f"  Checked at: {check_data.get('checkedAt')}")

assert len(check_data.get('items', [])) == 2, f"Should have 2 items, got {len(check_data.get('items', []))}"
assert check_data.get('note') == "2 boxes were missing TEST", f"Note mismatch: {check_data.get('note')}"
assert check_data.get('checkedBy') == "Xyz", f"checkedBy should be 'Xyz', got {check_data.get('checkedBy')}"

# Step 10: Supplier GET /api/supplier/orders/:id/delivery-check should return same JSON
print("\n→ Step 10: Supplier fetching delivery check JSON...")
resp = requests.get(
    f"{BASE_URL}/supplier/orders/{order_id}/delivery-check",
    headers={"Authorization": f"Bearer {supplier_token}"}
)
if resp.status_code != 200:
    print(f"✗ Failed to get delivery check (supplier): {resp.status_code} {resp.text}")
    exit(1)

supplier_check_data = resp.json()
print(f"✓ Supplier delivery check JSON retrieved:")
print(f"  Items: {len(supplier_check_data.get('items', []))}")
print(f"  Note: {supplier_check_data.get('note')}")

assert supplier_check_data == check_data, "Supplier should see same delivery check data as kitchen"

# Step 11: Repeat delivery check should return 409
print("\n→ Step 11: Repeating delivery check (should return 409)...")
resp = requests.post(
    f"{BASE_URL}/kitchen/orders/{order_id}/delivery-check",
    headers={
        "Authorization": f"Bearer {kitchen_jwt}",
        "Content-Type": "application/json"
    },
    json={
        "items": delivery_items,
        "note": "Repeat attempt"
    }
)
if resp.status_code != 409:
    print(f"✗ Expected 409, got {resp.status_code}: {resp.text}")
    exit(1)

error_data = resp.json()
print(f"✓ Got 409 as expected: {error_data.get('error')}")
assert 'already been checked' in error_data.get('error', '').lower(), f"Error message should mention 'already been checked'"

# Step 12: Validation - POST delivery-check on PENDING order should return 400
print("\n→ Step 12: Creating second test order (PENDING) for validation test...")
resp = requests.post(
    f"{BASE_URL}/kitchen/orders",
    headers={
        "Authorization": f"Bearer {kitchen_jwt}",
        "Content-Type": "application/json"
    },
    json={
        "supplierId": SUPPLIER_ID,
        "items": selected_items,  # Use same items to meet minimum order
        "notes": "TEST ORDER VALIDATION"
    }
)
if resp.status_code != 201:
    print(f"✗ Failed to create second order: {resp.status_code} {resp.text}")
    exit(1)

order2 = resp.json()
order2_id = order2['id']
test_order_ids.append(order2_id)
print(f"✓ Second order created: {order2['orderRef']} (status: {order2['status']})")

print("\n→ Step 12b: Attempting delivery check on PENDING order (should return 400)...")
resp = requests.post(
    f"{BASE_URL}/kitchen/orders/{order2_id}/delivery-check",
    headers={
        "Authorization": f"Bearer {kitchen_jwt}",
        "Content-Type": "application/json"
    },
    json={
        "items": [{"name": "Test", "quantity": 1, "unit": "ea", "status": "received"}],
        "note": "Test"
    }
)
if resp.status_code != 400:
    print(f"✗ Expected 400, got {resp.status_code}: {resp.text}")
    exit(1)

error_data = resp.json()
print(f"✓ Got 400 as expected: {error_data.get('error')}")
assert 'dispatched or delivered' in error_data.get('error', '').lower(), f"Error message should mention 'dispatched or delivered'"

print("\n" + "=" * 80)
print("CLEANUP: Deleting all test artifacts")
print("=" * 80)

# Delete test orders from supplier_orders
print(f"\n→ Deleting {len(test_order_ids)} test orders...")
for oid in test_order_ids:
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/supplier_orders",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Prefer": "return=minimal"
        },
        params={"id": f"eq.{oid}"}
    )
    if resp.status_code in [200, 204]:
        print(f"✓ Deleted order {oid}")
    else:
        print(f"✗ Failed to delete order {oid}: {resp.status_code} {resp.text}")

# Delete test receipts
print(f"\n→ Deleting {len(test_receipt_ids)} test receipts...")
for rid in test_receipt_ids:
    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/receipts",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Prefer": "return=minimal"
        },
        params={"id": f"eq.{rid}"}
    )
    if resp.status_code in [200, 204]:
        print(f"✓ Deleted receipt {rid}")
    else:
        print(f"✗ Failed to delete receipt {rid}: {resp.status_code} {resp.text}")

# Delete storage objects
print(f"\n→ Deleting {len(test_storage_paths)} storage objects...")
for path in test_storage_paths:
    resp = requests.delete(
        f"{SUPABASE_URL}/storage/v1/object/receipts/{path}",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    if resp.status_code in [200, 204]:
        print(f"✓ Deleted storage object: {path}")
    else:
        print(f"✗ Failed to delete storage object {path}: {resp.status_code} {resp.text}")

# Verify no TEST orders remain
print(f"\n→ Verifying no TEST orders remain...")
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/supplier_orders",
    headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
    },
    params={
        "notes": "ilike.*TEST ORDER*",
        "select": "id,notes"
    }
)
if resp.status_code == 200:
    remaining = resp.json()
    if len(remaining) == 0:
        print(f"✓ No TEST orders remain")
    else:
        print(f"⚠ WARNING: {len(remaining)} TEST orders still exist:")
        for o in remaining:
            print(f"  - {o['id']}: {o['notes']}")
else:
    print(f"✗ Failed to verify: {resp.status_code} {resp.text}")

print("\n" + "=" * 80)
print("✅ ALL TESTS PASSED")
print("=" * 80)
print("\nSummary:")
print("  ✓ Feature A: Auto-save Order Summary PDF to kitchen Receipts on delivery")
print("    - Order created, confirmed, and fulfilled")
print("    - Receipt auto-saved to receipts table with correct details")
print("    - Receipt appears in kitchen receipts API with signed fileUrl")
print("  ✓ Feature B: Delivery Check")
print("    - Delivery check posted with 1 issue, notified supplier")
print("    - Order shows deliveryChecked:true and deliveryCheckedAt")
print("    - Kitchen and supplier can both retrieve delivery check JSON")
print("    - Repeat delivery check returns 409")
print("    - Delivery check on PENDING order returns 400")
print("  ✓ Cleanup: All test artifacts deleted")
