#!/usr/bin/env python3
"""
Regression test for POST /api/rota/bulk break packing feature.

Tests that bulk-created shifts inherit each person's profile default break
(packed into notes JSON) from the rota config row's people array.

CRITICAL: Production Supabase DB
- Use ONLY May 2027 dates
- DO NOT modify the config row (chef_name='__rota_config__')
- Clean up ALL created rows (DELETE + purge from trash)
"""

import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
JWT_SECRET = os.getenv('SHELFWISE_JWT_SECRET')
KITCHEN_ID = 'a2573e6a-70f0-4a6d-97d0-ccf09b444643'

# Generate JWT token
import jwt
token = jwt.encode({
    'kitchen_id': KITCHEN_ID,
    'role': 'chef',
    'person': 'Xyz'
}, JWT_SECRET, algorithm='HS256')

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

print("=" * 80)
print("ROTA BREAK PACKING REGRESSION TEST")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print(f"Kitchen ID: {KITCHEN_ID}")
print(f"Test dates: May 2027 (2027-05-03 to 2027-05-05)")
print()

created_ids = []
test_results = []

try:
    # ========================================================================
    # TEST 1: POST /api/rota/bulk with Parth (has profile: defaultBreakMins=60, breakPaid=false)
    # Expected: notes = '{"n":"","bm":60,"bp":false}'
    # ========================================================================
    print("TEST 1: Bulk create shift for Parth (has profile with 60min unpaid break)")
    print("-" * 80)
    
    payload1 = {
        "names": ["Parth"],
        "dates": ["2027-05-03"],
        "shiftName": "BreakBulkTest",
        "startTime": "09:00",
        "endTime": "17:30"
    }
    
    resp1 = requests.post(f'{BASE_URL}/api/rota/bulk', json=payload1, headers=headers)
    print(f"POST /api/rota/bulk (Parth) → {resp1.status_code}")
    
    if resp1.status_code == 201:
        data1 = resp1.json()
        print(f"✓ Response: {data1}")
        if data1.get('created') == 1:
            print(f"✓ Created 1 shift as expected")
            test_results.append(("TEST 1: Create shift for Parth", True))
        else:
            print(f"✗ Expected created=1, got {data1.get('created')}")
            test_results.append(("TEST 1: Create shift for Parth", False))
    else:
        print(f"✗ Expected 201, got {resp1.status_code}: {resp1.text}")
        test_results.append(("TEST 1: Create shift for Parth", False))
    
    # Verify the notes field contains packed break JSON
    print("\nVerifying notes field contains packed break JSON...")
    resp1_get = requests.get(f'{BASE_URL}/api/rota?from=2027-05-03&to=2027-05-03', headers=headers)
    print(f"GET /api/rota?from=2027-05-03&to=2027-05-03 → {resp1_get.status_code}")
    
    if resp1_get.status_code == 200:
        shifts1 = resp1_get.json()
        print(f"✓ Retrieved {len(shifts1)} shift(s)")
        
        if len(shifts1) == 1:
            shift1 = shifts1[0]
            created_ids.append(shift1['id'])
            notes1 = shift1.get('notes', '')
            print(f"  Shift ID: {shift1['id']}")
            print(f"  Chef name: {shift1.get('chefName')}")
            print(f"  Notes: {notes1}")
            
            # Parse and verify the packed JSON
            try:
                notes_obj = json.loads(notes1)
                expected_notes = {"n": "", "bm": 60, "bp": False}
                
                if notes_obj == expected_notes:
                    print(f"✓ Notes match expected packed JSON: {expected_notes}")
                    test_results.append(("TEST 1: Parth notes packed correctly", True))
                else:
                    print(f"✗ Notes mismatch!")
                    print(f"  Expected: {expected_notes}")
                    print(f"  Got: {notes_obj}")
                    test_results.append(("TEST 1: Parth notes packed correctly", False))
            except json.JSONDecodeError as e:
                print(f"✗ Notes is not valid JSON: {e}")
                test_results.append(("TEST 1: Parth notes packed correctly", False))
        else:
            print(f"✗ Expected 1 shift, got {len(shifts1)}")
            test_results.append(("TEST 1: Parth notes packed correctly", False))
    else:
        print(f"✗ Failed to retrieve shifts: {resp1_get.status_code}")
        test_results.append(("TEST 1: Parth notes packed correctly", False))
    
    print()
    
    # ========================================================================
    # TEST 2: POST /api/rota/bulk with NoProfilePerson (no profile in config)
    # Expected: notes = '' (empty string, no break packed)
    # ========================================================================
    print("TEST 2: Bulk create shift for NoProfilePerson (no profile in config)")
    print("-" * 80)
    
    payload2 = {
        "names": ["NoProfilePerson"],
        "dates": ["2027-05-04"],
        "shiftName": "BreakBulkTest2",
        "startTime": "09:00",
        "endTime": "17:00"
    }
    
    resp2 = requests.post(f'{BASE_URL}/api/rota/bulk', json=payload2, headers=headers)
    print(f"POST /api/rota/bulk (NoProfilePerson) → {resp2.status_code}")
    
    if resp2.status_code == 201:
        data2 = resp2.json()
        print(f"✓ Response: {data2}")
        if data2.get('created') == 1:
            print(f"✓ Created 1 shift as expected")
            test_results.append(("TEST 2: Create shift for NoProfilePerson", True))
        else:
            print(f"✗ Expected created=1, got {data2.get('created')}")
            test_results.append(("TEST 2: Create shift for NoProfilePerson", False))
    else:
        print(f"✗ Expected 201, got {resp2.status_code}: {resp2.text}")
        test_results.append(("TEST 2: Create shift for NoProfilePerson", False))
    
    # Verify the notes field is empty
    print("\nVerifying notes field is empty (no profile → no break packed)...")
    resp2_get = requests.get(f'{BASE_URL}/api/rota?from=2027-05-04&to=2027-05-04', headers=headers)
    print(f"GET /api/rota?from=2027-05-04&to=2027-05-04 → {resp2_get.status_code}")
    
    if resp2_get.status_code == 200:
        shifts2 = resp2_get.json()
        print(f"✓ Retrieved {len(shifts2)} shift(s)")
        
        if len(shifts2) == 1:
            shift2 = shifts2[0]
            created_ids.append(shift2['id'])
            notes2 = shift2.get('notes', '')
            print(f"  Shift ID: {shift2['id']}")
            print(f"  Chef name: {shift2.get('chefName')}")
            print(f"  Notes: '{notes2}'")
            
            if notes2 == '':
                print(f"✓ Notes is empty string as expected (no profile → no break packed)")
                test_results.append(("TEST 2: NoProfilePerson notes empty", True))
            else:
                print(f"✗ Expected empty notes, got: '{notes2}'")
                test_results.append(("TEST 2: NoProfilePerson notes empty", False))
        else:
            print(f"✗ Expected 1 shift, got {len(shifts2)}")
            test_results.append(("TEST 2: NoProfilePerson notes empty", False))
    else:
        print(f"✗ Failed to retrieve shifts: {resp2_get.status_code}")
        test_results.append(("TEST 2: NoProfilePerson notes empty", False))
    
    print()
    
    # ========================================================================
    # TEST 3: POST /api/rota/bulk with role:'leave:annual' and notes
    # Expected: notes = 'range note' (leave rows never get break JSON)
    # ========================================================================
    print("TEST 3: Bulk create leave with role:'leave:annual' and notes='range note'")
    print("-" * 80)
    
    payload3 = {
        "names": ["Parth"],
        "dates": ["2027-05-05"],
        "shiftName": "Annual leave",
        "role": "leave:annual",
        "notes": "range note"
    }
    
    resp3 = requests.post(f'{BASE_URL}/api/rota/bulk', json=payload3, headers=headers)
    print(f"POST /api/rota/bulk (leave:annual) → {resp3.status_code}")
    
    if resp3.status_code == 201:
        data3 = resp3.json()
        print(f"✓ Response: {data3}")
        if data3.get('created') == 1:
            print(f"✓ Created 1 leave entry as expected")
            test_results.append(("TEST 3: Create leave entry", True))
        else:
            print(f"✗ Expected created=1, got {data3.get('created')}")
            test_results.append(("TEST 3: Create leave entry", False))
    else:
        print(f"✗ Expected 201, got {resp3.status_code}: {resp3.text}")
        test_results.append(("TEST 3: Create leave entry", False))
    
    # Verify the notes field is exactly 'range note' (not packed JSON)
    print("\nVerifying notes field is exactly 'range note' (leave rows never get break JSON)...")
    resp3_get = requests.get(f'{BASE_URL}/api/rota?from=2027-05-05&to=2027-05-05', headers=headers)
    print(f"GET /api/rota?from=2027-05-05&to=2027-05-05 → {resp3_get.status_code}")
    
    if resp3_get.status_code == 200:
        shifts3 = resp3_get.json()
        print(f"✓ Retrieved {len(shifts3)} shift(s)")
        
        if len(shifts3) == 1:
            shift3 = shifts3[0]
            created_ids.append(shift3['id'])
            notes3 = shift3.get('notes', '')
            role3 = shift3.get('role', '')
            print(f"  Shift ID: {shift3['id']}")
            print(f"  Chef name: {shift3.get('chefName')}")
            print(f"  Role: {role3}")
            print(f"  Notes: '{notes3}'")
            
            if notes3 == 'range note':
                print(f"✓ Notes is exactly 'range note' as expected (leave rows never get break JSON)")
                test_results.append(("TEST 3: Leave notes not packed", True))
            else:
                print(f"✗ Expected notes='range note', got: '{notes3}'")
                test_results.append(("TEST 3: Leave notes not packed", False))
        else:
            print(f"✗ Expected 1 shift, got {len(shifts3)}")
            test_results.append(("TEST 3: Leave notes not packed", False))
    else:
        print(f"✗ Failed to retrieve shifts: {resp3_get.status_code}")
        test_results.append(("TEST 3: Leave notes not packed", False))
    
    print()
    
    # ========================================================================
    # TEST 4: CLEANUP - Delete all created rows and purge from trash
    # ========================================================================
    print("TEST 4: CLEANUP - Delete all created rows and purge from trash")
    print("-" * 80)
    print(f"Created shift IDs: {created_ids}")
    
    # Delete all created shifts
    deleted_count = 0
    for shift_id in created_ids:
        resp_del = requests.delete(f'{BASE_URL}/api/rota/{shift_id}', headers=headers)
        print(f"DELETE /api/rota/{shift_id} → {resp_del.status_code}")
        if resp_del.status_code == 200:
            deleted_count += 1
    
    if deleted_count == len(created_ids):
        print(f"✓ Deleted all {deleted_count} shifts")
        test_results.append(("TEST 4: Delete shifts", True))
    else:
        print(f"✗ Expected to delete {len(created_ids)} shifts, deleted {deleted_count}")
        test_results.append(("TEST 4: Delete shifts", False))
    
    # Get trash items to purge
    print("\nRetrieving trash items to purge...")
    resp_trash = requests.get(f'{BASE_URL}/api/trash', headers=headers)
    print(f"GET /api/trash → {resp_trash.status_code}")
    
    if resp_trash.status_code == 200:
        trash_data = resp_trash.json()
        trash_items = trash_data.get('items', [])
        print(f"✓ Retrieved {len(trash_items)} trash items")
        
        # Find trash items for our test shifts (May 2027 dates)
        test_trash_items = [
            item for item in trash_items
            if item.get('entityType') == 'Rota shift' and 
            any(date in item.get('label', '') for date in ['2027-05-03', '2027-05-04', '2027-05-05'])
        ]
        
        print(f"  Found {len(test_trash_items)} test trash items to purge")
        
        # Purge test trash items
        purged_count = 0
        for item in test_trash_items:
            trash_id = item.get('id')
            resp_purge = requests.delete(f'{BASE_URL}/api/trash/{trash_id}', headers=headers)
            print(f"  DELETE /api/trash/{trash_id} → {resp_purge.status_code}")
            if resp_purge.status_code == 200:
                purged_count += 1
        
        if purged_count == len(test_trash_items):
            print(f"✓ Purged all {purged_count} test trash items")
            test_results.append(("TEST 4: Purge trash", True))
        else:
            print(f"✗ Expected to purge {len(test_trash_items)} items, purged {purged_count}")
            test_results.append(("TEST 4: Purge trash", False))
    else:
        print(f"✗ Failed to retrieve trash: {resp_trash.status_code}")
        test_results.append(("TEST 4: Purge trash", False))
    
    # Verify GET /api/rota returns empty array for date range
    print("\nVerifying no test shifts remain...")
    resp_verify = requests.get(f'{BASE_URL}/api/rota?from=2027-05-01&to=2027-05-07', headers=headers)
    print(f"GET /api/rota?from=2027-05-01&to=2027-05-07 → {resp_verify.status_code}")
    
    if resp_verify.status_code == 200:
        remaining_shifts = resp_verify.json()
        print(f"  Retrieved {len(remaining_shifts)} shifts")
        
        if len(remaining_shifts) == 0:
            print(f"✓ No test shifts remain (cleanup successful)")
            test_results.append(("TEST 4: Verify cleanup", True))
        else:
            print(f"✗ Expected 0 shifts, found {len(remaining_shifts)}")
            for shift in remaining_shifts:
                print(f"    - {shift.get('chefName')} on {shift.get('shiftDate')}")
            test_results.append(("TEST 4: Verify cleanup", False))
    else:
        print(f"✗ Failed to verify cleanup: {resp_verify.status_code}")
        test_results.append(("TEST 4: Verify cleanup", False))
    
    print()

except Exception as e:
    print(f"\n✗ EXCEPTION: {e}")
    import traceback
    traceback.print_exc()
    test_results.append(("Exception handling", False))

# ========================================================================
# SUMMARY
# ========================================================================
print()
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)

passed = sum(1 for _, result in test_results if result)
total = len(test_results)

for test_name, result in test_results:
    status = "✓ PASS" if result else "✗ FAIL"
    print(f"{status}: {test_name}")

print()
print(f"TOTAL: {passed}/{total} tests passed")
print("=" * 80)

sys.exit(0 if passed == total else 1)
