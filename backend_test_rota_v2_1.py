#!/usr/bin/env python3
"""
Regression test for Rota v2.1 backend changes.
Tests config people persistence/sanitization, bulk leave role+notes, and packed JSON notes.

CRITICAL: Production Supabase DB - must save/restore config, use 2027 dates, cleanup all created rows.
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoiYTI1NzNlNmEtNzBmMC00YTZkLTk3ZDAtY2NmMDliNDQ0NjQzIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJYeXoiLCJpYXQiOjE3ODgxMjc1MTUsImV4cCI6MTc4ODE3MDcxNX0.LWjdrcLgKfCediPATB2IXckAJXIE-RdDylOYPGBn0mI"
HEADERS = {
    "Authorization": f"Bearer {JWT_TOKEN}",
    "Content-Type": "application/json"
}

# Track created rota IDs for cleanup
created_rota_ids = []
original_config = None

def log_test(test_num, description):
    """Log test start"""
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)

def log_pass(message):
    """Log test pass"""
    print(f"✅ PASS: {message}")

def log_fail(message):
    """Log test failure"""
    print(f"❌ FAIL: {message}")
    
def log_info(message):
    """Log info"""
    print(f"ℹ️  INFO: {message}")

def test_1_get_config_and_save():
    """Test 1: GET /api/rota/config and save original config"""
    global original_config
    log_test(1, "GET /api/rota/config → 200, has keys mode/templates/people")
    
    try:
        response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        original_config = data  # SAVE for restoration later
        
        # Verify structure
        if 'mode' not in data:
            log_fail("Response missing 'mode' key")
            return False
        if 'templates' not in data:
            log_fail("Response missing 'templates' key")
            return False
        if 'people' not in data:
            log_fail("Response missing 'people' key")
            return False
        
        log_pass(f"Config retrieved: mode={data['mode']}, templates={len(data['templates'])}, people={len(data['people'])}")
        log_info(f"Original config saved: {json.dumps(original_config, indent=2)}")
        
        # Verify current state matches expected (mode='flex', 6 templates, people=[])
        if data['mode'] != 'flex':
            log_fail(f"Expected mode='flex', got '{data['mode']}'")
            return False
        if len(data['templates']) != 6:
            log_fail(f"Expected 6 templates, got {len(data['templates'])}")
            return False
        if len(data['people']) != 0:
            log_fail(f"Expected people=[], got {len(data['people'])} people")
            return False
        
        log_pass("Current state verified: mode='flex', 6 templates, people=[]")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_2_post_config_with_people():
    """Test 2: POST /api/rota/config with people array → verify sanitization"""
    log_test(2, "POST /api/rota/config with people array → verify sanitization")
    
    try:
        # Create config with people array including invalid data
        config_with_people = {
            **original_config,
            "people": [
                {
                    "name": "TestPerson",
                    "role": "Chef",
                    "offDays": [2, 5, 99, -1],  # 99 and -1 are invalid (should be filtered)
                    "defaultBreakMins": 9999,  # Should be clamped to 480
                    "breakPaid": True
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/rota/config", headers=HEADERS, json=config_with_people)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        log_pass(f"Config updated: {json.dumps(data, indent=2)}")
        
        # Verify sanitization
        if len(data['people']) != 1:
            log_fail(f"Expected 1 person, got {len(data['people'])}")
            return False
        
        person = data['people'][0]
        
        # Check offDays sanitization (should be [2, 5] - invalid values filtered)
        if person['offDays'] != [2, 5]:
            log_fail(f"Expected offDays=[2, 5], got {person['offDays']}")
            return False
        log_pass("offDays sanitized correctly: [2, 5, 99, -1] → [2, 5]")
        
        # Check defaultBreakMins clamping (should be 480)
        if person['defaultBreakMins'] != 480:
            log_fail(f"Expected defaultBreakMins=480, got {person['defaultBreakMins']}")
            return False
        log_pass("defaultBreakMins clamped correctly: 9999 → 480")
        
        # Verify GET returns the same
        get_response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        if get_response.status_code != 200:
            log_fail(f"GET after POST failed: {get_response.status_code}")
            return False
        
        get_data = get_response.json()
        if len(get_data['people']) != 1:
            log_fail(f"GET returned {len(get_data['people'])} people, expected 1")
            return False
        
        if get_data['people'][0]['offDays'] != [2, 5]:
            log_fail(f"GET returned offDays={get_data['people'][0]['offDays']}, expected [2, 5]")
            return False
        
        if get_data['people'][0]['defaultBreakMins'] != 480:
            log_fail(f"GET returned defaultBreakMins={get_data['people'][0]['defaultBreakMins']}, expected 480")
            return False
        
        log_pass("GET confirms persistence of sanitized values")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_3_bulk_leave_with_role_and_notes():
    """Test 3: POST /api/rota/bulk with role='leave:annual' + notes"""
    log_test(3, "POST /api/rota/bulk with leave role + notes → verify creation")
    
    try:
        bulk_data = {
            "names": ["TestPerson"],
            "dates": ["2027-04-05", "2027-04-06"],
            "shiftName": "Annual leave",
            "role": "leave:annual",
            "notes": "Approved by manager"
        }
        
        response = requests.post(f"{BASE_URL}/rota/bulk", headers=HEADERS, json=bulk_data)
        
        if response.status_code != 201:
            log_fail(f"Expected 201, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            log_fail(f"Response ok=False: {data}")
            return False
        
        if data.get('created') != 2:
            log_fail(f"Expected created=2, got {data.get('created')}")
            return False
        
        log_pass(f"Bulk create successful: {data['created']} rows created")
        
        # Verify the created rows
        get_response = requests.get(f"{BASE_URL}/rota?from=2027-04-05&to=2027-04-06", headers=HEADERS)
        if get_response.status_code != 200:
            log_fail(f"GET rota failed: {get_response.status_code}")
            return False
        
        rows = get_response.json()
        if len(rows) != 2:
            log_fail(f"Expected 2 rows, got {len(rows)}")
            return False
        
        # Track IDs for cleanup
        for row in rows:
            created_rota_ids.append(row['id'])
        
        # Verify both rows have correct role and notes
        for row in rows:
            if row['role'] != 'leave:annual':
                log_fail(f"Expected role='leave:annual', got '{row['role']}'")
                return False
            if row['shiftSlot'] != 'Annual leave':
                log_fail(f"Expected shiftSlot='Annual leave', got '{row['shiftSlot']}'")
                return False
            if row['notes'] != 'Approved by manager':
                log_fail(f"Expected notes='Approved by manager', got '{row['notes']}'")
                return False
        
        log_pass("Both rows have role='leave:annual', shiftSlot='Annual leave', notes='Approved by manager'")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_4_bulk_invalid_role_fallback():
    """Test 4: POST /api/rota/bulk with invalid role → verify fallback to 'shift'"""
    log_test(4, "POST /api/rota/bulk with invalid role → verify fallback to 'shift'")
    
    try:
        bulk_data = {
            "names": ["TestPerson"],
            "dates": ["2027-04-07"],
            "shiftName": "X",
            "role": "hacker-role"  # Invalid role
        }
        
        response = requests.post(f"{BASE_URL}/rota/bulk", headers=HEADERS, json=bulk_data)
        
        if response.status_code != 201:
            log_fail(f"Expected 201, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            log_fail(f"Response ok=False: {data}")
            return False
        
        if data.get('created') != 1:
            log_fail(f"Expected created=1, got {data.get('created')}")
            return False
        
        log_pass(f"Bulk create successful: {data['created']} row created")
        
        # Verify the created row has role='shift' (fallback)
        get_response = requests.get(f"{BASE_URL}/rota?from=2027-04-07&to=2027-04-07", headers=HEADERS)
        if get_response.status_code != 200:
            log_fail(f"GET rota failed: {get_response.status_code}")
            return False
        
        rows = get_response.json()
        if len(rows) != 1:
            log_fail(f"Expected 1 row, got {len(rows)}")
            return False
        
        row = rows[0]
        created_rota_ids.append(row['id'])
        
        if row['role'] != 'shift':
            log_fail(f"Expected role='shift' (fallback), got '{row['role']}'")
            return False
        
        log_pass("Invalid role 'hacker-role' correctly fell back to 'shift'")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_5_packed_json_notes():
    """Test 5: POST /api/rota with packed JSON notes → verify preservation"""
    log_test(5, "POST /api/rota with packed JSON notes → verify preservation")
    
    try:
        packed_notes = '{"n":"train","bm":30,"bp":false}'
        rota_data = {
            "shiftDate": "2027-04-08",
            "chefName": "TestPerson",
            "shiftSlot": "BreakShift",
            "role": "shift",
            "startTime": "09:00",
            "endTime": "17:00",
            "notes": packed_notes
        }
        
        response = requests.post(f"{BASE_URL}/rota", headers=HEADERS, json=rota_data)
        
        if response.status_code != 201:
            log_fail(f"Expected 201, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        created_rota_ids.append(data['id'])
        
        log_pass(f"Rota created: {data['id']}")
        
        # Verify notes are preserved exactly
        if data['notes'] != packed_notes:
            log_fail(f"Expected notes='{packed_notes}', got '{data['notes']}'")
            return False
        
        log_pass(f"Packed JSON notes preserved in POST response: {data['notes']}")
        
        # Verify GET returns the same
        get_response = requests.get(f"{BASE_URL}/rota?from=2027-04-08&to=2027-04-08", headers=HEADERS)
        if get_response.status_code != 200:
            log_fail(f"GET rota failed: {get_response.status_code}")
            return False
        
        rows = get_response.json()
        if len(rows) != 1:
            log_fail(f"Expected 1 row, got {len(rows)}")
            return False
        
        row = rows[0]
        if row['notes'] != packed_notes:
            log_fail(f"GET returned notes='{row['notes']}', expected '{packed_notes}'")
            return False
        
        log_pass(f"Packed JSON notes preserved in GET response: {row['notes']}")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_6_restore_original_config():
    """Test 6: RESTORE original config (people back to [])"""
    log_test(6, "RESTORE original config → verify people=[] and 6 templates unchanged")
    
    try:
        if original_config is None:
            log_fail("Original config not saved!")
            return False
        
        log_info(f"Restoring original config: {json.dumps(original_config, indent=2)}")
        
        response = requests.post(f"{BASE_URL}/rota/config", headers=HEADERS, json=original_config)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        log_pass(f"Config restored: {json.dumps(data, indent=2)}")
        
        # Verify restoration
        if data['mode'] != 'flex':
            log_fail(f"Expected mode='flex', got '{data['mode']}'")
            return False
        
        if len(data['templates']) != 6:
            log_fail(f"Expected 6 templates, got {len(data['templates'])}")
            return False
        
        if len(data['people']) != 0:
            log_fail(f"Expected people=[], got {len(data['people'])} people")
            return False
        
        log_pass("Config restored: mode='flex', 6 templates, people=[]")
        
        # Verify GET confirms restoration
        get_response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        if get_response.status_code != 200:
            log_fail(f"GET after restore failed: {get_response.status_code}")
            return False
        
        get_data = get_response.json()
        if len(get_data['people']) != 0:
            log_fail(f"GET returned {len(get_data['people'])} people, expected 0")
            return False
        
        if len(get_data['templates']) != 6:
            log_fail(f"GET returned {len(get_data['templates'])} templates, expected 6")
            return False
        
        log_pass("GET confirms restoration: people=[], 6 templates unchanged")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def test_7_cleanup():
    """Test 7: CLEANUP all created rows (DELETE + purge from trash)"""
    log_test(7, "CLEANUP all created rows → verify GET returns []")
    
    try:
        log_info(f"Cleaning up {len(created_rota_ids)} created rota rows")
        
        # Step 1: DELETE all created rota rows
        for rota_id in created_rota_ids:
            delete_response = requests.delete(f"{BASE_URL}/rota/{rota_id}", headers=HEADERS)
            if delete_response.status_code != 200:
                log_fail(f"DELETE /api/rota/{rota_id} failed: {delete_response.status_code}")
                return False
            log_pass(f"Deleted rota row: {rota_id}")
        
        # Step 2: Get trash items
        trash_response = requests.get(f"{BASE_URL}/trash", headers=HEADERS)
        if trash_response.status_code != 200:
            log_fail(f"GET /api/trash failed: {trash_response.status_code}")
            return False
        
        trash_data = trash_response.json()
        trash_items = trash_data.get('items', [])
        log_info(f"Trash contains {len(trash_items)} items")
        
        # Step 3: Purge rota shifts from trash (only the ones we created - 2027-04 dates)
        purged_count = 0
        for item in trash_items:
            if item.get('entityType') == 'Rota shift':
                # Check if this is one of our created items (label contains 2027-04)
                label = item.get('label', '')
                if '2027-04' in label:
                    purge_response = requests.delete(f"{BASE_URL}/trash/{item['id']}", headers=HEADERS)
                    if purge_response.status_code != 200:
                        log_fail(f"DELETE /api/trash/{item['id']} failed: {purge_response.status_code}")
                        return False
                    log_pass(f"Purged from trash: {item['id']} ({label})")
                    purged_count += 1
        
        log_pass(f"Purged {purged_count} items from trash")
        
        # Step 4: Verify GET /api/rota?from=2027-04-01&to=2027-04-30 returns []
        verify_response = requests.get(f"{BASE_URL}/rota?from=2027-04-01&to=2027-04-30", headers=HEADERS)
        if verify_response.status_code != 200:
            log_fail(f"GET rota verification failed: {verify_response.status_code}")
            return False
        
        remaining_rows = verify_response.json()
        if len(remaining_rows) != 0:
            log_fail(f"Expected 0 rows in April 2027, got {len(remaining_rows)}")
            return False
        
        log_pass("Verified: GET /api/rota?from=2027-04-01&to=2027-04-30 returns []")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("ROTA V2.1 REGRESSION TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Kitchen ID: a2573e6a-70f0-4a6d-97d0-ccf09b444643")
    print(f"Person: Xyz")
    print("="*80)
    
    tests = [
        test_1_get_config_and_save,
        test_2_post_config_with_people,
        test_3_bulk_leave_with_role_and_notes,
        test_4_bulk_invalid_role_fallback,
        test_5_packed_json_notes,
        test_6_restore_original_config,
        test_7_cleanup
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            log_fail(f"Test crashed: {str(e)}")
            results.append(False)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {total - passed}/{total}")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
