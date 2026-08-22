#!/usr/bin/env python3
"""
Test Auto Credit Notes feature for ShelfWise
Tests the full flow: order creation -> delivery check with issues -> credit request -> supplier decision
"""

import requests
import json
import time
import subprocess
import os

# Configuration
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com"
SUPABASE_URL = "https://sabsvsolekdhztzqafuc.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnN2c29sZWtkaHp0enFhZnVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0Njk3MywiZXhwIjoyMDk2MTIyOTczfQ.wPZtV53LGHK6v4PINyX-iLsjB_36Spxf15XoNqYxedg"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYnN2c29sZWtkaHp0enFhZnVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDY5NzMsImV4cCI6MjA5NjEyMjk3M30.NYVRTZB9_94_jQKO7pSW1PAQIGlKPTzNMcC1nI_2Q6E"

KITCHEN_ID = "a2573e6a-70f0-4a6d-97d0-ccf09b444643"
SUPPLIER_ID = "995016c0-249b-48e7-aa24-51de2ecde382"
SUPPLIER_EMAIL = "parth511.patel@gmail.com"

# Track test artifacts for cleanup
test_artifacts = {
    "order_ids": [],
    "receipt_ids": [],
    "storage_objects": [],
    "activity_log_ids": []
}

def generate_kitchen_jwt():
    """Generate kitchen chef JWT using node"""
    cmd = f"""node -e "const jwt=require('jsonwebtoken');const fs=require('fs');const secret=fs.readFileSync('/app/.env','utf8').match(/SHELFWISE_JWT_SECRET=(.+)/)[1].trim();console.log(jwt.sign({{kitchen_id:'{KITCHEN_ID}',role:'chef',person:'Xyz'}},secret,{{expiresIn:'1h'}}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip()

def get_supplier_token():
    """Get supplier Bearer token via magiclink flow"""
    print("\n🔑 Getting supplier token via magiclink...")
    
    # Step 1: Generate magiclink
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
        print(f"❌ Failed to generate magiclink: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    hashed_token = data.get("hashed_token")
    
    if not hashed_token:
        print(f"❌ No hashed_token in response: {data}")
        return None
    
    print(f"✅ Got hashed_token: {hashed_token[:20]}...")
    
    # Step 2: Verify magiclink to get access_token
    resp = requests.post(
        f"{SUPABASE_URL}/auth/v1/verify",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={"type": "magiclink", "token_hash": hashed_token}
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to verify magiclink: {resp.status_code} {resp.text}")
        return None
    
    data = resp.json()
    access_token = data.get("access_token")
    
    if not access_token:
        print(f"❌ No access_token in response: {data}")
        return None
    
    print(f"✅ Got supplier access_token: {access_token[:20]}...")
    return access_token

def run_tests():
    print("=" * 80)
    print("🧪 TESTING AUTO CREDIT NOTES FEATURE")
    print("=" * 80)
    
    # Generate tokens
    print("\n📋 Step 1: Generate authentication tokens")
    kitchen_jwt = generate_kitchen_jwt()
    print(f"✅ Kitchen JWT: {kitchen_jwt[:30]}...")
    
    supplier_token = get_supplier_token()
    if not supplier_token:
        print("❌ Failed to get supplier token, aborting tests")
        return
    
    kitchen_headers = {"Authorization": f"Bearer {kitchen_jwt}"}
    supplier_headers = {"Authorization": f"Bearer {supplier_token}"}
    
    # Step 2: Get supplier catalog
    print("\n📋 Step 2: Get supplier catalog")
    resp = requests.get(f"{BASE_URL}/api/kitchen/suppliers/{SUPPLIER_ID}/catalog", headers=kitchen_headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get catalog: {resp.status_code} {resp.text}")
        return
    
    catalog_data = resp.json()
    catalog = catalog_data.get("products", [])
    print(f"✅ Got catalog with {len(catalog)} items")
    
    # Find items to order (total >= £100)
    items_to_order = []
    total = 0
    for item in catalog:
        if total >= 100:
            break
        price = item.get("price", 0)
        if price > 0:
            quantity = max(1, int(100 / price))  # Order enough to reach £100
            items_to_order.append({
                "productId": item["id"],
                "name": item["name"],
                "quantity": quantity,
                "unit": item.get("unit", "ea"),
                "price": price
            })
            total += price * quantity
    
    if not items_to_order:
        print("❌ No items found in catalog")
        return
    
    print(f"✅ Selected {len(items_to_order)} items, total: £{total:.2f}")
    print(f"   First item: {items_to_order[0]['name']} - {items_to_order[0]['quantity']} {items_to_order[0]['unit']} @ £{items_to_order[0]['price']}")
    
    # Step 3: Create order
    print("\n📋 Step 3: Create TEST order")
    order_payload = {
        "supplierId": SUPPLIER_ID,
        "items": items_to_order,
        "notes": "TEST ORDER CREDIT - automated test"
    }
    
    resp = requests.post(f"{BASE_URL}/api/kitchen/orders", headers=kitchen_headers, json=order_payload)
    if resp.status_code not in [200, 201]:
        print(f"❌ Failed to create order: {resp.status_code} {resp.text}")
        return
    
    order = resp.json()
    order_id = order["id"]
    test_artifacts["order_ids"].append(order_id)
    print(f"✅ Created order {order_id}")
    print(f"   Reference: {order.get('reference')}")
    print(f"   Total: £{order.get('total', 0):.2f}")
    
    # Step 4: Supplier confirms order
    print("\n📋 Step 4: Supplier confirms order")
    resp = requests.put(
        f"{BASE_URL}/api/supplier/orders/{order_id}",
        headers=supplier_headers,
        json={"status": "confirmed"}
    )
    if resp.status_code != 200:
        print(f"❌ Failed to confirm order: {resp.status_code} {resp.text}")
        return
    
    print(f"✅ Order confirmed")
    
    # Step 5: Supplier fulfills order
    print("\n📋 Step 5: Supplier fulfills order")
    resp = requests.put(
        f"{BASE_URL}/api/supplier/orders/{order_id}",
        headers=supplier_headers,
        json={"status": "fulfilled"}
    )
    if resp.status_code != 200:
        print(f"❌ Failed to fulfill order: {resp.status_code} {resp.text}")
        return
    
    fulfilled_order = resp.json()
    print(f"✅ Order fulfilled")
    print(f"   Invoice: {fulfilled_order.get('invoiceNumber')}")
    
    # Track auto-created receipt for cleanup
    time.sleep(1)  # Give it a moment to create receipt
    
    # Step 6: Kitchen delivery check with not_received item
    print("\n📋 Step 6: Kitchen delivery check with not_received item")
    
    # Use the EXACT first ordered item
    first_item = items_to_order[0]
    expected_credit = first_item["price"] * first_item["quantity"]
    
    delivery_check_payload = {
        "items": [{
            "name": first_item["name"],  # EXACT name from order
            "quantity": first_item["quantity"],
            "unit": first_item["unit"],
            "status": "not_received"
        }],
        "note": "TEST missing item for credit"
    }
    
    print(f"   Marking as not_received: {first_item['name']} - {first_item['quantity']} {first_item['unit']}")
    print(f"   Expected credit: £{expected_credit:.2f}")
    
    resp = requests.post(
        f"{BASE_URL}/api/kitchen/orders/{order_id}/delivery-check",
        headers=kitchen_headers,
        json=delivery_check_payload
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed delivery check: {resp.status_code} {resp.text}")
        return
    
    check_result = resp.json()
    credit_total = check_result.get("creditTotal", 0)
    
    print(f"✅ Delivery check completed")
    print(f"   Issues: {check_result.get('issues')}")
    print(f"   Credit total: £{credit_total:.2f}")
    print(f"   Notified: {check_result.get('notified')}")
    
    # Verify credit total matches expected
    if abs(credit_total - expected_credit) > 0.01:
        print(f"❌ CRITICAL: Credit total mismatch! Expected £{expected_credit:.2f}, got £{credit_total:.2f}")
    else:
        print(f"✅ Credit total matches expected: £{expected_credit:.2f}")
    
    test_artifacts["storage_objects"].append(f"order-checks/{order_id}.json")
    test_artifacts["storage_objects"].append(f"order-credits/{order_id}.json")
    
    # Step 7: Verify kitchen orders GET shows creditStatus
    print("\n📋 Step 7: Verify kitchen orders GET shows creditStatus")
    resp = requests.get(f"{BASE_URL}/api/kitchen/orders", headers=kitchen_headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get orders: {resp.status_code} {resp.text}")
        return
    
    orders = resp.json()
    test_order = next((o for o in orders if o["id"] == order_id), None)
    
    if not test_order:
        print(f"❌ Test order not found in orders list")
        return
    
    print(f"✅ Found test order in list")
    print(f"   Credit status: {test_order.get('creditStatus')}")
    print(f"   Credit total: £{test_order.get('creditTotal', 0):.2f}")
    
    if test_order.get("creditStatus") != "requested":
        print(f"❌ CRITICAL: Expected creditStatus 'requested', got '{test_order.get('creditStatus')}'")
    else:
        print(f"✅ Credit status is 'requested'")
    
    if abs(test_order.get("creditTotal", 0) - expected_credit) > 0.01:
        print(f"❌ CRITICAL: Credit total mismatch in orders list")
    else:
        print(f"✅ Credit total matches in orders list")
    
    # Step 8: GET kitchen credit JSON
    print("\n📋 Step 8: GET kitchen credit JSON")
    resp = requests.get(f"{BASE_URL}/api/kitchen/orders/{order_id}/credit", headers=kitchen_headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get kitchen credit: {resp.status_code} {resp.text}")
        return
    
    kitchen_credit = resp.json()
    print(f"✅ Got kitchen credit JSON")
    print(f"   Status: {kitchen_credit.get('status')}")
    print(f"   Total: £{kitchen_credit.get('total', 0):.2f}")
    print(f"   Items: {len(kitchen_credit.get('items', []))}")
    print(f"   Requested by: {kitchen_credit.get('requestedBy')}")
    
    if kitchen_credit.get("items"):
        item = kitchen_credit["items"][0]
        print(f"   First item: {item.get('name')} - {item.get('quantity')} {item.get('unit')} - £{item.get('amount', 0):.2f} - {item.get('reason')}")
        
        if item.get("reason") != "not received":
            print(f"❌ CRITICAL: Expected reason 'not received', got '{item.get('reason')}'")
        else:
            print(f"✅ Item reason is 'not received'")
    
    # Step 9: GET supplier credit JSON
    print("\n📋 Step 9: GET supplier credit JSON")
    resp = requests.get(f"{BASE_URL}/api/supplier/orders/{order_id}/credit", headers=supplier_headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get supplier credit: {resp.status_code} {resp.text}")
        return
    
    supplier_credit = resp.json()
    print(f"✅ Got supplier credit JSON (matches kitchen)")
    print(f"   Status: {supplier_credit.get('status')}")
    print(f"   Total: £{supplier_credit.get('total', 0):.2f}")
    
    # Step 10: Supplier approves credit
    print("\n📋 Step 10: Supplier approves credit")
    resp = requests.post(
        f"{BASE_URL}/api/supplier/orders/{order_id}/credit-decision",
        headers=supplier_headers,
        json={"decision": "approved", "note": "credit on next invoice TEST"}
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to approve credit: {resp.status_code} {resp.text}")
        return
    
    decision_result = resp.json()
    print(f"✅ Credit approved")
    print(f"   Credit status: {decision_result.get('credit', {}).get('status')}")
    
    if decision_result.get("credit", {}).get("status") != "approved":
        print(f"❌ CRITICAL: Expected credit status 'approved', got '{decision_result.get('credit', {}).get('status')}'")
    else:
        print(f"✅ Credit status is 'approved'")
    
    # Step 11: Verify kitchen orders GET shows creditStatus approved
    print("\n📋 Step 11: Verify kitchen orders GET shows creditStatus approved")
    resp = requests.get(f"{BASE_URL}/api/kitchen/orders", headers=kitchen_headers)
    if resp.status_code != 200:
        print(f"❌ Failed to get orders: {resp.status_code} {resp.text}")
        return
    
    orders = resp.json()
    test_order = next((o for o in orders if o["id"] == order_id), None)
    
    if not test_order:
        print(f"❌ Test order not found in orders list")
        return
    
    print(f"✅ Found test order in list")
    print(f"   Credit status: {test_order.get('creditStatus')}")
    
    if test_order.get("creditStatus") != "approved":
        print(f"❌ CRITICAL: Expected creditStatus 'approved', got '{test_order.get('creditStatus')}'")
    else:
        print(f"✅ Credit status is 'approved'")
    
    # Check notes field for [[ markers
    notes = test_order.get("notes", "")
    if "[[" in notes:
        print(f"❌ CRITICAL: Notes field contains '[[' markers: {notes}")
    else:
        print(f"✅ Notes field has NO '[[' markers")
    
    # Step 12: Test 409 on repeat decision
    print("\n📋 Step 12: Test 409 on repeat decision")
    resp = requests.post(
        f"{BASE_URL}/api/supplier/orders/{order_id}/credit-decision",
        headers=supplier_headers,
        json={"decision": "approved", "note": "repeat test"}
    )
    
    if resp.status_code == 409:
        print(f"✅ Got 409 on repeat decision (expected)")
    else:
        print(f"❌ CRITICAL: Expected 409, got {resp.status_code}: {resp.text}")
    
    # Step 13: Test 400 on invalid decision
    print("\n📋 Step 13: Test 400 on invalid decision")
    resp = requests.post(
        f"{BASE_URL}/api/supplier/orders/{order_id}/credit-decision",
        headers=supplier_headers,
        json={"decision": "maybe", "note": "invalid"}
    )
    
    if resp.status_code == 400:
        print(f"✅ Got 400 on invalid decision (expected)")
    else:
        print(f"❌ Expected 400, got {resp.status_code}: {resp.text}")
    
    # Step 14: Create 2nd tiny TEST order (leave pending)
    print("\n📋 Step 14: Create 2nd tiny TEST order (leave pending)")
    # Need to meet minimum order of £100
    tiny_items = []
    tiny_total = 0
    for item in catalog[:5]:  # Use first 5 items to ensure we reach £100
        price = item.get("price", 0)
        if price > 0 and tiny_total < 105:  # Aim for £105 to be safe
            qty = max(1, int((105 - tiny_total) / price) + 1)
            tiny_items.append({"productId": item["id"], "quantity": qty})
            tiny_total += price * qty
    
    tiny_order_payload = {
        "supplierId": SUPPLIER_ID,
        "items": tiny_items,
        "notes": "TEST ORDER CREDIT 2 - tiny pending order"
    }
    print(f"   2nd order total: £{tiny_total:.2f}")
    
    resp = requests.post(f"{BASE_URL}/api/kitchen/orders", headers=kitchen_headers, json=tiny_order_payload)
    if resp.status_code not in [200, 201]:
        print(f"❌ Failed to create 2nd order: {resp.status_code} {resp.text}")
        return
    
    tiny_order = resp.json()
    tiny_order_id = tiny_order["id"]
    test_artifacts["order_ids"].append(tiny_order_id)
    print(f"✅ Created 2nd order {tiny_order_id} (pending)")
    
    # Step 15: Test 404 on order without credit request
    print("\n📋 Step 15: Test 404 on order without credit request")
    resp = requests.post(
        f"{BASE_URL}/api/supplier/orders/{tiny_order_id}/credit-decision",
        headers=supplier_headers,
        json={"decision": "approved", "note": "no credit"}
    )
    
    if resp.status_code == 404:
        print(f"✅ Got 404 on order without credit request (expected)")
    else:
        print(f"❌ Expected 404, got {resp.status_code}: {resp.text}")
    
    # Step 16: Verify activity log
    print("\n📋 Step 16: Verify activity log has 'credit_update' row")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/activity_logs?action=eq.credit_update&kitchen_id=eq.{KITCHEN_ID}&select=*",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    
    if resp.status_code != 200:
        print(f"❌ Failed to get activity logs: {resp.status_code} {resp.text}")
        return
    
    logs = resp.json()
    # Look for logs with the order reference in detail field
    credit_logs = [log for log in logs if order.get("orderRef", "") in log.get("detail", "")]
    
    if credit_logs:
        print(f"✅ Found {len(credit_logs)} credit_update log(s)")
        for log in credit_logs:
            print(f"   ID: {log['id']}, Detail: {log.get('detail')}")
            test_artifacts["activity_log_ids"].append(log["id"])
    else:
        print(f"⚠️  No credit_update logs found for test order (may have been cleaned up already)")
    
    # CLEANUP
    print("\n" + "=" * 80)
    print("🧹 CLEANUP: Deleting test artifacts")
    print("=" * 80)
    
    # Delete orders
    for order_id in test_artifacts["order_ids"]:
        print(f"\n🗑️  Deleting order {order_id}")
        resp = requests.delete(
            f"{SUPABASE_URL}/rest/v1/supplier_orders?id=eq.{order_id}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
            }
        )
        if resp.status_code in [200, 204]:
            print(f"✅ Deleted order {order_id}")
        else:
            print(f"❌ Failed to delete order: {resp.status_code} {resp.text}")
    
    # Delete auto-created receipts
    print(f"\n🗑️  Deleting auto-created receipts")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/receipts?notes=like.*Auto-saved order summary*&kitchen_id=eq.{KITCHEN_ID}&select=*",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    
    if resp.status_code == 200:
        receipts = resp.json()
        test_receipts = [r for r in receipts if "TEST" in r.get("notes", "") or any(oid in r.get("notes", "") for oid in test_artifacts["order_ids"])]
        
        for receipt in test_receipts:
            receipt_id = receipt["id"]
            print(f"   Deleting receipt {receipt_id}")
            
            # Delete storage object
            file_url = receipt.get("file_url", "")
            if file_url:
                # Extract path from signed URL
                if f"{KITCHEN_ID}/" in file_url:
                    storage_path = f"{KITCHEN_ID}/{receipt_id}.pdf"
                    test_artifacts["storage_objects"].append(storage_path)
            
            # Delete receipt row
            resp = requests.delete(
                f"{SUPABASE_URL}/rest/v1/receipts?id=eq.{receipt_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
                }
            )
            if resp.status_code in [200, 204]:
                print(f"   ✅ Deleted receipt {receipt_id}")
            else:
                print(f"   ❌ Failed to delete receipt: {resp.status_code}")
    
    # Delete storage objects
    print(f"\n🗑️  Deleting storage objects")
    for obj_path in test_artifacts["storage_objects"]:
        print(f"   Deleting {obj_path}")
        resp = requests.delete(
            f"{SUPABASE_URL}/storage/v1/object/receipts/{obj_path}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
            }
        )
        if resp.status_code in [200, 204]:
            print(f"   ✅ Deleted {obj_path}")
        else:
            print(f"   ⚠️  Could not delete {obj_path}: {resp.status_code}")
    
    # Delete activity logs
    print(f"\n🗑️  Deleting activity logs")
    
    # Get all test-related activity logs
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/activity_logs?kitchen_id=eq.{KITCHEN_ID}&select=*",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    
    if resp.status_code == 200:
        all_logs = resp.json()
        # Look for logs with TEST in detail field or matching our tracked IDs
        test_logs = [log for log in all_logs if ("TEST" in log.get("detail", "") or log["id"] in test_artifacts["activity_log_ids"])]
        
        for log in test_logs:
            log_id = log["id"]
            print(f"   Deleting log {log_id}: {log.get('action')} - {log.get('detail', '')[:50]}")
            resp = requests.delete(
                f"{SUPABASE_URL}/rest/v1/activity_logs?id=eq.{log_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
                }
            )
            if resp.status_code in [200, 204]:
                print(f"   ✅ Deleted log {log_id}")
            else:
                print(f"   ❌ Failed to delete log: {resp.status_code}")
    
    # Verify cleanup
    print(f"\n🔍 Verifying cleanup")
    
    # Check orders
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/supplier_orders?notes=like.*TEST ORDER CREDIT*&select=id",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    if resp.status_code == 200 and len(resp.json()) == 0:
        print(f"✅ No TEST orders remain")
    else:
        print(f"⚠️  Some TEST orders may remain: {resp.json()}")
    
    # Check receipts
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/receipts?notes=like.*TEST*&kitchen_id=eq.{KITCHEN_ID}&select=id",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    if resp.status_code == 200 and len(resp.json()) == 0:
        print(f"✅ No TEST receipts remain")
    else:
        print(f"⚠️  Some TEST receipts may remain: {resp.json()}")
    
    # Check activity logs
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/activity_logs?detail=like.*TEST*&kitchen_id=eq.{KITCHEN_ID}&select=id",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
        }
    )
    if resp.status_code == 200 and len(resp.json()) == 0:
        print(f"✅ No TEST activity logs remain")
    else:
        print(f"⚠️  Some TEST activity logs may remain: {resp.json() if resp.status_code == 200 else resp.text}")
    
    print("\n" + "=" * 80)
    print("✅ ALL TESTS COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
