#!/usr/bin/env python3
"""
Backend test for Unified Trash / Recently Deleted (soft delete app-wide)
Tests the 7-step plan WITHOUT artificial waits - the in-memory write-through cache
should make immediate read-after-write consistent.

Kitchen: a2573e6a-70f0-4a6d-97d0-ccf09b444643 (Shelfwise)
Person: Xyz (owner/manager)
"""

import requests
import subprocess
import json
import sys
import time

BASE_URL = "http://localhost:3000/api"

def get_jwt():
    """Generate a chef JWT for the test kitchen"""
    cmd = [
        "node", "-e",
        "require('dotenv').config({silent:true}); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}))"
    ]
    result = subprocess.run(cmd, cwd="/app", capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to generate JWT: {result.stderr}")
        sys.exit(1)
    # Extract only the JWT token (last line, in case there's debug output)
    lines = result.stdout.strip().split('\n')
    token = lines[-1].strip()
    return token

def cleanup_test_items(headers):
    """Clean up any leftover TEST items from previous runs"""
    print("\n[CLEANUP] Removing any leftover TEST items...")
    
    # Clean up products
    r = requests.get(f"{BASE_URL}/products", headers=headers)
    if r.status_code == 200:
        products = r.json()
        test_products = [p for p in products if "TEST" in p.get("name", "")]
        for p in test_products:
            print(f"   Deleting leftover product: {p.get('name')} (id={p.get('id')})")
            requests.delete(f"{BASE_URL}/products/{p.get('id')}", headers=headers)
    
    # Clean up trash
    r = requests.get(f"{BASE_URL}/trash", headers=headers)
    if r.status_code == 200:
        trash_data = r.json()
        items = trash_data.get("items", [])
        test_items = [item for item in items if "TEST" in item.get("label", "")]
        for item in test_items:
            print(f"   Permanently deleting from trash: {item.get('label')} (id={item.get('id')})")
            requests.delete(f"{BASE_URL}/trash/{item.get('id')}", headers=headers)
    
    print("✅ Cleanup complete")

def main():
    print("=" * 80)
    print("UNIFIED TRASH / RECENTLY DELETED - CONSISTENCY FIX RETEST")
    print("Testing immediate read-after-write consistency (no artificial waits)")
    print("=" * 80)
    
    token = get_jwt()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Clean up any leftover TEST items from previous runs
    cleanup_test_items(headers)
    
    product_id = None
    trash_id = None
    
    try:
        # ===== STEP 1: Create "TEST TrashMe" product =====
        print("\n[STEP 1] Creating TEST TrashMe product...")
        payload = {
            "name": "TEST TrashMe",
            "quantity": 1,
            "unit": "ea",
            "storageType": "Fridge"
        }
        r = requests.post(f"{BASE_URL}/products", json=payload, headers=headers)
        if r.status_code not in [200, 201]:
            print(f"❌ Failed to create product: {r.status_code} {r.text}")
            sys.exit(1)
        
        data = r.json()
        product_id = data.get("id")
        if not product_id:
            print(f"❌ No product ID returned: {data}")
            sys.exit(1)
        
        print(f"✅ Product created: id={product_id}")
        
        # ===== STEP 2: Delete it → gone from products =====
        print("\n[STEP 2] Deleting product (should move to trash)...")
        r = requests.delete(f"{BASE_URL}/products/{product_id}", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to delete product: {r.status_code} {r.text}")
            sys.exit(1)
        
        print(f"✅ Product deleted: {r.json()}")
        
        # Verify it's gone from products
        print("   Verifying product is gone from inventory...")
        r = requests.get(f"{BASE_URL}/products", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch products: {r.status_code} {r.text}")
            sys.exit(1)
        
        products = r.json()
        if any(p.get("id") == product_id for p in products):
            print(f"❌ Product still in inventory after delete!")
            sys.exit(1)
        
        print("✅ Product confirmed gone from inventory")
        
        # ===== STEP 3: Immediately GET /api/trash → entry present =====
        print("\n[STEP 3] IMMEDIATELY fetching trash (NO WAIT - testing cache consistency)...")
        r = requests.get(f"{BASE_URL}/trash", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch trash: {r.status_code} {r.text}")
            sys.exit(1)
        
        trash_data = r.json()
        items = trash_data.get("items", [])
        
        # Find our TEST TrashMe entry
        trash_entry = None
        for item in items:
            if "TEST TrashMe" in item.get("label", ""):
                trash_entry = item
                break
        
        if not trash_entry:
            print(f"❌ TEST TrashMe NOT found in trash immediately after delete!")
            print(f"   Trash items: {json.dumps(items, indent=2)}")
            sys.exit(1)
        
        trash_id = trash_entry.get("id")
        print(f"✅ Entry found in trash IMMEDIATELY (cache working!):")
        print(f"   - id: {trash_id}")
        print(f"   - entityType: {trash_entry.get('entityType')}")
        print(f"   - label: {trash_entry.get('label')}")
        print(f"   - deletedBy: {trash_entry.get('deletedBy')}")
        print(f"   - deletedAt: {trash_entry.get('deletedAt')}")
        
        # Validate fields
        if trash_entry.get("entityType") != "Inventory item":
            print(f"❌ Wrong entityType: {trash_entry.get('entityType')}")
            sys.exit(1)
        if trash_entry.get("deletedBy") != "Xyz":
            print(f"❌ Wrong deletedBy: {trash_entry.get('deletedBy')}")
            sys.exit(1)
        
        print("✅ All trash entry fields correct")
        
        # ===== STEP 4: Restore → product back with same id, entry gone from trash immediately =====
        print("\n[STEP 4] Restoring product from trash...")
        r = requests.post(f"{BASE_URL}/trash/restore", json={"id": trash_id}, headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to restore: {r.status_code} {r.text}")
            sys.exit(1)
        
        restore_data = r.json()
        print(f"✅ Restore response: {restore_data}")
        
        if not restore_data.get("restored"):
            print(f"❌ Restore did not return restored:true")
            sys.exit(1)
        
        # Verify product is back in inventory with SAME ID
        print("   IMMEDIATELY verifying product is back in inventory (NO WAIT)...")
        r = requests.get(f"{BASE_URL}/products", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch products: {r.status_code} {r.text}")
            sys.exit(1)
        
        products = r.json()
        restored_product = None
        for p in products:
            if p.get("id") == product_id:
                restored_product = p
                break
        
        if not restored_product:
            print(f"❌ Product NOT back in inventory immediately after restore!")
            sys.exit(1)
        
        print(f"✅ Product back in inventory with SAME ID: {product_id}")
        print(f"   - name: {restored_product.get('name')}")
        
        # Verify entry is gone from trash IMMEDIATELY
        print("   IMMEDIATELY verifying entry is gone from trash (NO WAIT)...")
        r = requests.get(f"{BASE_URL}/trash", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch trash: {r.status_code} {r.text}")
            sys.exit(1)
        
        trash_data = r.json()
        items = trash_data.get("items", [])
        
        if any(item.get("id") == trash_id for item in items):
            print(f"❌ Entry STILL in trash immediately after restore!")
            sys.exit(1)
        
        print("✅ Entry confirmed gone from trash IMMEDIATELY (cache working!)")
        
        # ===== STEP 5: Delete again → in trash; DELETE /api/trash/{trashId} → immediately gone (permanent) =====
        print("\n[STEP 5] Deleting product again...")
        r = requests.delete(f"{BASE_URL}/products/{product_id}", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to delete product: {r.status_code} {r.text}")
            sys.exit(1)
        
        print(f"✅ Product deleted again")
        
        # IMMEDIATELY verify it's in trash
        print("   IMMEDIATELY verifying it's in trash (NO WAIT)...")
        r = requests.get(f"{BASE_URL}/trash", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch trash: {r.status_code} {r.text}")
            sys.exit(1)
        
        trash_data = r.json()
        items = trash_data.get("items", [])
        
        trash_entry = None
        for item in items:
            if "TEST TrashMe" in item.get("label", ""):
                trash_entry = item
                break
        
        if not trash_entry:
            print(f"❌ TEST TrashMe NOT in trash immediately after second delete!")
            sys.exit(1)
        
        trash_id = trash_entry.get("id")
        print(f"✅ Entry in trash IMMEDIATELY: id={trash_id}")
        
        # Permanently delete from trash
        print("   Permanently deleting from trash...")
        r = requests.delete(f"{BASE_URL}/trash/{trash_id}", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to permanently delete: {r.status_code} {r.text}")
            sys.exit(1)
        
        print(f"✅ Permanent delete response: {r.json()}")
        
        # IMMEDIATELY verify it's gone from trash
        print("   IMMEDIATELY verifying it's gone from trash (NO WAIT)...")
        r = requests.get(f"{BASE_URL}/trash", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch trash: {r.status_code} {r.text}")
            sys.exit(1)
        
        trash_data = r.json()
        items = trash_data.get("items", [])
        
        if any(item.get("id") == trash_id for item in items):
            print(f"❌ Entry STILL in trash immediately after permanent delete!")
            sys.exit(1)
        
        print("✅ Entry confirmed PERMANENTLY GONE from trash IMMEDIATELY (cache working!)")
        
        # ===== STEP 6: 401 without auth on GET /api/trash + POST /api/trash/restore =====
        print("\n[STEP 6] Testing auth requirements...")
        
        # GET /api/trash without auth
        r = requests.get(f"{BASE_URL}/trash")
        if r.status_code != 401:
            print(f"❌ GET /api/trash without auth should return 401, got {r.status_code}")
            sys.exit(1)
        print(f"✅ GET /api/trash without auth → 401 {r.json()}")
        
        # POST /api/trash/restore without auth
        r = requests.post(f"{BASE_URL}/trash/restore", json={"id": "fake-id"})
        if r.status_code != 401:
            print(f"❌ POST /api/trash/restore without auth should return 401, got {r.status_code}")
            sys.exit(1)
        print(f"✅ POST /api/trash/restore without auth → 401 {r.json()}")
        
        # ===== STEP 7: Full cleanup: no TEST items left in products or trash =====
        print("\n[STEP 7] Verifying full cleanup...")
        
        # Check products
        r = requests.get(f"{BASE_URL}/products", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch products: {r.status_code} {r.text}")
            sys.exit(1)
        
        products = r.json()
        test_products = [p for p in products if "TEST" in p.get("name", "")]
        if test_products:
            print(f"❌ Found TEST products still in inventory: {test_products}")
            sys.exit(1)
        
        print("✅ No TEST products in inventory")
        
        # Check trash
        r = requests.get(f"{BASE_URL}/trash", headers=headers)
        if r.status_code != 200:
            print(f"❌ Failed to fetch trash: {r.status_code} {r.text}")
            sys.exit(1)
        
        trash_data = r.json()
        items = trash_data.get("items", [])
        test_items = [item for item in items if "TEST" in item.get("label", "")]
        if test_items:
            print(f"❌ Found TEST items still in trash: {test_items}")
            sys.exit(1)
        
        print("✅ No TEST items in trash")
        
        print("\n" + "=" * 80)
        print("✅ ALL 7 STEPS PASSED - UNIFIED TRASH WORKING PERFECTLY!")
        print("=" * 80)
        print("\n🎉 KEY VALIDATIONS:")
        print("   ✅ Immediate read-after-write consistency (NO waits needed)")
        print("   ✅ Delete → trash entry appears IMMEDIATELY")
        print("   ✅ Restore → product back with same ID, trash entry gone IMMEDIATELY")
        print("   ✅ Permanent delete → trash entry gone IMMEDIATELY")
        print("   ✅ Auth required for GET /api/trash and POST /api/trash/restore")
        print("   ✅ Full cleanup verified (no TEST items left)")
        print("\n🚀 In-memory write-through cache working perfectly!")
        print("   - readTrashBin serves from cache")
        print("   - writeTrashBin updates cache first, then persists to storage")
        print("   - No eventual-consistency lag")
        
    except Exception as e:
        print(f"\n❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
