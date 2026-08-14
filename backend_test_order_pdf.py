#!/usr/bin/env python3
"""
Focused backend test for ShelfWise Order Summary PDF + Push Resubscribe
Tests:
1. Kitchen: GET catalog, POST order with notes "TEST ORDER PDF", total >= £100
2. Supplier: Generate Bearer token via Supabase admin API
3. Supplier: PUT order status confirmed → dispatched → fulfilled with deliveryNote
4. Check logs for "order summary pdf failed" (must NOT appear)
5. Kitchen: GET orders, verify deliveryNote, status fulfilled, notes don't contain "[["
6. PUBLIC: POST /api/push/resubscribe (404 for unknown, 400 for bad body)
7. Cleanup: delete test order via service-role REST
"""

import requests
import json
import os
import subprocess
import time
from datetime import datetime

# Load env vars
def load_env():
    env = {}
    with open('/app/.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key] = value
    return env

env = load_env()
BASE_URL = env['NEXT_PUBLIC_BASE_URL']
SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
JWT_SECRET = env['SHELFWISE_JWT_SECRET']

KITCHEN_ID = 'a2573e6a-70f0-4a6d-97d0-ccf09b444643'
SUPPLIER_ID = '995016c0-249b-48e7-aa24-51de2ecde382'
SUPPLIER_EMAIL = 'parth511.patel@gmail.com'

print("=" * 80)
print("SHELFWISE ORDER SUMMARY PDF + PUSH RESUBSCRIBE TEST")
print("=" * 80)

# Generate kitchen chef JWT
print("\n[SETUP] Generating kitchen chef JWT...")
import subprocess
jwt_cmd = f"node -e \"const jwt=require('jsonwebtoken');const secret='{JWT_SECRET}';console.log(jwt.sign({{kitchen_id:'{KITCHEN_ID}',role:'chef',person:'Xyz'}},secret,{{expiresIn:'1h'}}))\""
result = subprocess.run(jwt_cmd, shell=True, capture_output=True, text=True)
KITCHEN_JWT = result.stdout.strip()
print(f"✓ Kitchen JWT generated (length: {len(KITCHEN_JWT)})")

kitchen_headers = {
    'Authorization': f'Bearer {KITCHEN_JWT}',
    'Content-Type': 'application/json'
}

# Test 1: Kitchen - GET supplier catalog
print("\n" + "=" * 80)
print("TEST 1: Kitchen - GET supplier catalog")
print("=" * 80)
try:
    url = f"{BASE_URL}/api/kitchen/suppliers/{SUPPLIER_ID}/catalog"
    print(f"GET {url}")
    resp = requests.get(url, headers=kitchen_headers, timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        catalog_data = resp.json()
        products = catalog_data.get('products', [])
        print(f"✓ Catalog retrieved: {len(products)} items")
        
        # Find an item with price >= £10
        selected_item = None
        for item in products:
            if item.get('price', 0) >= 10:
                selected_item = item
                break
        
        if selected_item:
            print(f"✓ Selected item: {selected_item['name']} @ £{selected_item['price']}")
            # Calculate quantity to exceed £100
            quantity = int(100 / selected_item['price']) + 1
            print(f"✓ Quantity to order: {quantity} (total: £{quantity * selected_item['price']:.2f})")
            
            TEST_ITEM = selected_item
            TEST_QUANTITY = quantity
        else:
            print("✗ No item with price >= £10 found")
            TEST_ITEM = None
            TEST_QUANTITY = 0
    else:
        print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
        TEST_ITEM = None
        TEST_QUANTITY = 0
except Exception as e:
    print(f"✗ Exception: {e}")
    TEST_ITEM = None
    TEST_QUANTITY = 0

# Test 2: Kitchen - POST order with notes "TEST ORDER PDF"
print("\n" + "=" * 80)
print("TEST 2: Kitchen - POST order with notes 'TEST ORDER PDF'")
print("=" * 80)
ORDER_ID = None
if TEST_ITEM:
    try:
        url = f"{BASE_URL}/api/kitchen/orders"
        payload = {
            "supplierId": SUPPLIER_ID,
            "items": [
                {
                    "productId": TEST_ITEM['id'],
                    "name": TEST_ITEM['name'],
                    "quantity": TEST_QUANTITY,
                    "unit": TEST_ITEM.get('unit', 'ea'),
                    "price": TEST_ITEM['price']
                }
            ],
            "notes": "TEST ORDER PDF"
        }
        print(f"POST {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        resp = requests.post(url, headers=kitchen_headers, json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [200, 201]:
            order = resp.json()
            ORDER_ID = order.get('id') or order.get('orderId')
            print(f"✓ Order created: {ORDER_ID}")
            print(f"✓ Status: {order.get('status', 'N/A')}")
            print(f"✓ Total: £{order.get('total', 0):.2f}")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no test item selected)")

# Test 3: Supplier - Generate Bearer token via Supabase admin API
print("\n" + "=" * 80)
print("TEST 3: Supplier - Generate Bearer token via Supabase admin API")
print("=" * 80)
SUPPLIER_TOKEN = None
try:
    # Step 1: Generate magiclink
    url = f"{SUPABASE_URL}/auth/v1/admin/generate_link"
    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json'
    }
    payload = {
        "type": "magiclink",
        "email": SUPPLIER_EMAIL
    }
    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    resp = requests.post(url, headers=headers, json=payload, timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        hashed_token = data.get('hashed_token')
        print(f"✓ Hashed token: {hashed_token[:20]}...")
        
        # Step 2: Verify token
        url = f"{SUPABASE_URL}/auth/v1/verify"
        headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        }
        payload = {
            "type": "magiclink",
            "token_hash": hashed_token
        }
        print(f"\nPOST {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            SUPPLIER_TOKEN = data.get('access_token')
            print(f"✓ Access token: {SUPPLIER_TOKEN[:20]}...")
        else:
            print(f"✗ Verify failed: {resp.status_code} {resp.text[:200]}")
    else:
        print(f"✗ Generate link failed: {resp.status_code} {resp.text[:200]}")
except Exception as e:
    print(f"✗ Exception: {e}")

supplier_headers = {
    'Authorization': f'Bearer {SUPPLIER_TOKEN}',
    'Content-Type': 'application/json'
} if SUPPLIER_TOKEN else {}

# Test 4: Supplier - GET orders (verify TEST order appears)
print("\n" + "=" * 80)
print("TEST 4: Supplier - GET orders (verify TEST order appears)")
print("=" * 80)
if SUPPLIER_TOKEN and ORDER_ID:
    try:
        url = f"{BASE_URL}/api/supplier/orders"
        print(f"GET {url}")
        resp = requests.get(url, headers=supplier_headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            orders = resp.json()
            print(f"✓ Orders retrieved: {len(orders)} total")
            
            test_order = None
            for order in orders:
                if order.get('id') == ORDER_ID:
                    test_order = order
                    break
            
            if test_order:
                print(f"✓ TEST order found: {ORDER_ID}")
                print(f"  Status: {test_order.get('status', 'N/A')}")
                print(f"  Notes: {test_order.get('notes', 'N/A')}")
            else:
                print(f"✗ TEST order NOT found in supplier orders")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no supplier token or order ID)")

# Test 5: Supplier - PUT order status confirmed
print("\n" + "=" * 80)
print("TEST 5: Supplier - PUT order status confirmed")
print("=" * 80)
if SUPPLIER_TOKEN and ORDER_ID:
    try:
        url = f"{BASE_URL}/api/supplier/orders/{ORDER_ID}"
        payload = {"status": "confirmed"}
        print(f"PUT {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        resp = requests.put(url, headers=supplier_headers, json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            order = resp.json()
            print(f"✓ Order status updated to: {order.get('status', 'N/A')}")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no supplier token or order ID)")

time.sleep(1)

# Test 6: Supplier - PUT order status dispatched
print("\n" + "=" * 80)
print("TEST 6: Supplier - PUT order status dispatched")
print("=" * 80)
if SUPPLIER_TOKEN and ORDER_ID:
    try:
        url = f"{BASE_URL}/api/supplier/orders/{ORDER_ID}"
        payload = {"status": "dispatched"}
        print(f"PUT {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        resp = requests.put(url, headers=supplier_headers, json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            order = resp.json()
            print(f"✓ Order status updated to: {order.get('status', 'N/A')}")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no supplier token or order ID)")

time.sleep(1)

# Test 7: Supplier - PUT order status fulfilled with deliveryNote
print("\n" + "=" * 80)
print("TEST 7: Supplier - PUT order status fulfilled with deliveryNote")
print("=" * 80)
if SUPPLIER_TOKEN and ORDER_ID:
    try:
        url = f"{BASE_URL}/api/supplier/orders/{ORDER_ID}"
        payload = {
            "status": "fulfilled",
            "deliveryNote": "left with kitchen manager TEST"
        }
        print(f"PUT {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        resp = requests.put(url, headers=supplier_headers, json=payload, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            order = resp.json()
            print(f"✓ Order status updated to: {order.get('status', 'N/A')}")
            delivery_note = order.get('deliveryNote', '')
            print(f"✓ Delivery note: {delivery_note}")
            
            if delivery_note == "left with kitchen manager TEST":
                print(f"✓ Delivery note matches expected text")
            else:
                print(f"✗ Delivery note mismatch: expected 'left with kitchen manager TEST', got '{delivery_note}'")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no supplier token or order ID)")

time.sleep(2)  # Wait for PDF generation

# Test 8: Check logs for "order summary pdf failed"
print("\n" + "=" * 80)
print("TEST 8: Check logs for 'order summary pdf failed'")
print("=" * 80)
try:
    result = subprocess.run(
        "tail -n 50 /var/log/supervisor/nextjs.out.log",
        shell=True,
        capture_output=True,
        text=True,
        timeout=5
    )
    logs = result.stdout
    
    if "order summary pdf failed" in logs.lower():
        print("✗ FOUND 'order summary pdf failed' in logs")
        print("Last 50 lines:")
        print(logs)
    else:
        print("✓ NO 'order summary pdf failed' in last 50 lines")
        print("Last 10 lines (for context):")
        print('\n'.join(logs.split('\n')[-10:]))
except Exception as e:
    print(f"✗ Exception: {e}")

# Test 9: Kitchen - GET orders, verify deliveryNote and status
print("\n" + "=" * 80)
print("TEST 9: Kitchen - GET orders, verify deliveryNote and status")
print("=" * 80)
if ORDER_ID:
    try:
        url = f"{BASE_URL}/api/kitchen/orders"
        print(f"GET {url}")
        resp = requests.get(url, headers=kitchen_headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            orders = resp.json()
            print(f"✓ Orders retrieved: {len(orders)} total")
            
            test_order = None
            for order in orders:
                if order.get('id') == ORDER_ID:
                    test_order = order
                    break
            
            if test_order:
                print(f"✓ TEST order found: {ORDER_ID}")
                print(f"  Status: {test_order.get('status', 'N/A')}")
                print(f"  Delivery note: {test_order.get('deliveryNote', 'N/A')}")
                print(f"  Notes: {test_order.get('notes', 'N/A')[:100]}")
                
                # Verify status
                if test_order.get('status') == 'fulfilled':
                    print(f"✓ Status is 'fulfilled'")
                else:
                    print(f"✗ Status is NOT 'fulfilled': {test_order.get('status')}")
                
                # Verify deliveryNote
                if test_order.get('deliveryNote') == "left with kitchen manager TEST":
                    print(f"✓ Delivery note matches expected text")
                else:
                    print(f"✗ Delivery note mismatch: {test_order.get('deliveryNote')}")
                
                # Verify notes don't contain "[["
                notes = test_order.get('notes', '')
                if '[[' in notes:
                    print(f"✗ Notes contain '[[' markers: {notes}")
                else:
                    print(f"✓ Notes do NOT contain '[[' markers")
            else:
                print(f"✗ TEST order NOT found in kitchen orders")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no order ID)")

# Test 10: PUBLIC - POST /api/push/resubscribe (404 for unknown oldEndpoint)
print("\n" + "=" * 80)
print("TEST 10: PUBLIC - POST /api/push/resubscribe (404 for unknown oldEndpoint)")
print("=" * 80)
try:
    url = f"{BASE_URL}/api/push/resubscribe"
    payload = {
        "oldEndpoint": "https://example.com/nonexistent",
        "subscription": {
            "endpoint": "https://example.com/new",
            "keys": {
                "p256dh": "x",
                "auth": "y"
            }
        }
    }
    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    resp = requests.post(url, json=payload, timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 404:
        data = resp.json()
        print(f"✓ Got 404 as expected")
        print(f"  Error: {data.get('error', 'N/A')}")
        
        if data.get('error') == "Unknown subscription":
            print(f"✓ Error message matches: 'Unknown subscription'")
        else:
            print(f"✗ Error message mismatch: {data.get('error')}")
    else:
        print(f"✗ Expected 404, got {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    print(f"✗ Exception: {e}")

# Test 11: PUBLIC - POST /api/push/resubscribe (400 for bad body - missing keys)
print("\n" + "=" * 80)
print("TEST 11: PUBLIC - POST /api/push/resubscribe (400 for bad body - missing keys)")
print("=" * 80)
try:
    url = f"{BASE_URL}/api/push/resubscribe"
    payload = {
        "subscription": {
            "endpoint": "x"
        }
    }
    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    resp = requests.post(url, json=payload, timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 400:
        print(f"✓ Got 400 as expected (missing keys)")
    else:
        print(f"✗ Expected 400, got {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    print(f"✗ Exception: {e}")

# Test 12: PUBLIC - POST /api/push/resubscribe (400 for empty body)
print("\n" + "=" * 80)
print("TEST 12: PUBLIC - POST /api/push/resubscribe (400 for empty body)")
print("=" * 80)
try:
    url = f"{BASE_URL}/api/push/resubscribe"
    payload = {}
    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    resp = requests.post(url, json=payload, timeout=10)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code == 400:
        print(f"✓ Got 400 as expected (empty body)")
    else:
        print(f"✗ Expected 400, got {resp.status_code}: {resp.text[:200]}")
except Exception as e:
    print(f"✗ Exception: {e}")

# Test 13: CLEANUP - Delete test order via service-role REST
print("\n" + "=" * 80)
print("TEST 13: CLEANUP - Delete test order via service-role REST")
print("=" * 80)
if ORDER_ID:
    try:
        url = f"{SUPABASE_URL}/rest/v1/supplier_orders?id=eq.{ORDER_ID}"
        headers = {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json'
        }
        print(f"DELETE {url}")
        resp = requests.delete(url, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [200, 204]:
            print(f"✓ Test order deleted")
            
            # Verify deletion
            url = f"{SUPABASE_URL}/rest/v1/supplier_orders?id=eq.{ORDER_ID}"
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                orders = resp.json()
                if len(orders) == 0:
                    print(f"✓ Verified: order is gone")
                else:
                    print(f"✗ Order still exists after deletion")
        else:
            print(f"✗ Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⚠ Skipped (no order ID)")

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
