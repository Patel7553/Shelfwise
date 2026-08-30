#!/usr/bin/env python3
"""
Backend test for Rota v2 endpoints (ShelfWise Next.js app)
Tests: staff-names, config (mode+templates), copy-week, bulk assign, entry kinds (shift/overtime/leave)

CRITICAL: Uses production Supabase DB with STRICT CLEANUP protocol
- All test rows use FUTURE dates in 2027 (2027-03-01 to 2027-03-14)
- Every created row is deleted via DELETE /api/rota/:id then purged from trash
- Do NOT delete: config row (chef_name __rota_config__) and 5 demo shifts
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoiYTI1NzNlNmEtNzBmMC00YTZkLTk3ZDAtY2NmMDliNDQ0NjQzIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJYeXoiLCJpYXQiOjE3ODgxMjQxODIsImV4cCI6MTc4ODE2NzM4Mn0.W76hRsqLuDGW5HBvSY3Y8c87gtRmOkFtsQXoclUe_xc"

HEADERS = {
    "Authorization": f"Bearer {JWT_TOKEN}",
    "Content-Type": "application/json"
}

# Track created IDs for cleanup
created_rota_ids = []

def test_1_staff_names():
    """Test 1: GET /api/rota/staff-names → should return staff names/roles WITHOUT pins"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/rota/staff-names")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/rota/staff-names", headers=HEADERS)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify structure
        if "staff" not in data:
            print("❌ FAILED: Missing 'staff' field in response")
            return False
        
        staff_list = data["staff"]
        if not isinstance(staff_list, list):
            print("❌ FAILED: 'staff' is not an array")
            return False
        
        # Verify contains Xyz, Dev, Parth
        staff_names = [s.get("name") for s in staff_list]
        print(f"Staff names: {staff_names}")
        
        required_names = ["Xyz", "Dev", "Parth"]
        for name in required_names:
            if name not in staff_names:
                print(f"❌ FAILED: Missing required staff name '{name}'")
                return False
        
        # Verify NO pin field
        for staff in staff_list:
            if "pin" in staff:
                print(f"❌ FAILED: Staff entry contains 'pin' field (should NOT be exposed): {staff}")
                return False
            
            # Verify required fields
            if "name" not in staff or "role" not in staff or "isOwner" not in staff:
                print(f"❌ FAILED: Staff entry missing required fields: {staff}")
                return False
        
        print(f"✅ PASSED: Got {len(staff_list)} staff members (Xyz, Dev, Parth present), NO pin field exposed")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_2_get_config():
    """Test 2: GET /api/rota/config → should return mode + templates"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/rota/config")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify structure
        if "mode" not in data or "templates" not in data:
            print("❌ FAILED: Missing 'mode' or 'templates' field")
            return False, None
        
        if data["mode"] != "flex":
            print(f"❌ FAILED: Expected mode='flex', got '{data['mode']}'")
            return False, None
        
        templates = data["templates"]
        if not isinstance(templates, list):
            print("❌ FAILED: 'templates' is not an array")
            return False, None
        
        # Should have 3 templates: Prep, Lunch service, Close
        print(f"Templates count: {len(templates)}")
        template_names = [t.get("name") for t in templates]
        print(f"Template names: {template_names}")
        
        if len(templates) != 3:
            print(f"⚠️  WARNING: Expected 3 templates, got {len(templates)}")
        
        print(f"✅ PASSED: Got mode='flex' with {len(templates)} templates")
        return True, data
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False, None


def test_3_post_config(original_config):
    """Test 3: POST /api/rota/config → add template, then restore original"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/rota/config (add template + restore)")
    print("="*80)
    
    try:
        # Step 1: Add a new template
        print("\nStep 1: Adding new template 'TestTemp'...")
        new_config = {
            "mode": original_config["mode"],
            "templates": original_config["templates"] + [{
                "name": "TestTemp",
                "startTime": "09:00",
                "endTime": "12:00"
            }]
        }
        
        response = requests.post(f"{BASE_URL}/rota/config", headers=HEADERS, json=new_config)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify 4 templates now
        if len(data["templates"]) != len(original_config["templates"]) + 1:
            print(f"❌ FAILED: Expected {len(original_config['templates']) + 1} templates, got {len(data['templates'])}")
            return False
        
        # Verify TestTemp is present
        template_names = [t.get("name") for t in data["templates"]]
        if "TestTemp" not in template_names:
            print("❌ FAILED: 'TestTemp' not found in templates")
            return False
        
        print(f"✅ Step 1 PASSED: Added TestTemp, now have {len(data['templates'])} templates")
        
        # Step 2: GET config to confirm
        print("\nStep 2: GET config to confirm...")
        response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: GET after POST returned {response.status_code}")
            return False
        
        data = response.json()
        if len(data["templates"]) != len(original_config["templates"]) + 1:
            print(f"❌ FAILED: GET returned {len(data['templates'])} templates, expected {len(original_config['templates']) + 1}")
            return False
        
        print(f"✅ Step 2 PASSED: GET confirmed {len(data['templates'])} templates")
        
        # Step 3: Restore original config
        print("\nStep 3: Restoring original config...")
        response = requests.post(f"{BASE_URL}/rota/config", headers=HEADERS, json=original_config)
        if response.status_code != 200:
            print(f"❌ FAILED: Restore POST returned {response.status_code}")
            return False
        
        data = response.json()
        if len(data["templates"]) != len(original_config["templates"]):
            print(f"❌ FAILED: After restore, got {len(data['templates'])} templates, expected {len(original_config['templates'])}")
            return False
        
        print(f"✅ Step 3 PASSED: Restored original config with {len(data['templates'])} templates")
        
        # Step 4: GET config to confirm restore
        print("\nStep 4: GET config to confirm restore...")
        response = requests.get(f"{BASE_URL}/rota/config", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: Final GET returned {response.status_code}")
            return False
        
        data = response.json()
        if len(data["templates"]) != len(original_config["templates"]):
            print(f"❌ FAILED: Final GET returned {len(data['templates'])} templates, expected {len(original_config['templates'])}")
            return False
        
        print(f"✅ Step 4 PASSED: Final GET confirmed {len(data['templates'])} templates")
        print("✅ TEST 3 PASSED: Config add/restore working correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_4_create_rota_entries():
    """Test 4: POST /api/rota → create shift, overtime, leave entries (2027 dates)"""
    print("\n" + "="*80)
    print("TEST 4: POST /api/rota (create shift/overtime/leave)")
    print("="*80)
    
    try:
        # Entry 1: Regular shift
        print("\nCreating Entry 1: Regular shift (2027-03-01)...")
        shift_entry = {
            "shiftDate": "2027-03-01",
            "chefName": "Xyz",
            "shiftSlot": "Prep",
            "role": "shift",
            "startTime": "06:30",
            "endTime": "14:00"
        }
        
        response = requests.post(f"{BASE_URL}/rota", headers=HEADERS, json=shift_entry)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 201:
            print(f"❌ FAILED: Expected 201, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if "id" not in data:
            print("❌ FAILED: Missing 'id' in response")
            return False
        
        created_rota_ids.append(data["id"])
        print(f"✅ Created shift entry, ID: {data['id']}")
        
        # Entry 2: Overtime
        print("\nCreating Entry 2: Overtime (2027-03-02)...")
        overtime_entry = {
            "shiftDate": "2027-03-02",
            "chefName": "Xyz",
            "shiftSlot": "Overtime",
            "role": "overtime",
            "startTime": "18:00",
            "endTime": "22:00",
            "notes": "test reason"
        }
        
        response = requests.post(f"{BASE_URL}/rota", headers=HEADERS, json=overtime_entry)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 201:
            print(f"❌ FAILED: Expected 201, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        created_rota_ids.append(data["id"])
        print(f"✅ Created overtime entry, ID: {data['id']}")
        
        # Entry 3: Leave (sick)
        print("\nCreating Entry 3: Leave (sick) (2027-03-03)...")
        leave_entry = {
            "shiftDate": "2027-03-03",
            "chefName": "Xyz",
            "shiftSlot": "Sick",
            "role": "leave:sick",
            "startTime": "",
            "endTime": ""
        }
        
        response = requests.post(f"{BASE_URL}/rota", headers=HEADERS, json=leave_entry)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 201:
            print(f"❌ FAILED: Expected 201, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        created_rota_ids.append(data["id"])
        print(f"✅ Created leave entry, ID: {data['id']}")
        
        print(f"\n✅ TEST 4 PASSED: Created 3 rota entries (shift, overtime, leave)")
        print(f"Created IDs: {created_rota_ids}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_5_get_rota_entries():
    """Test 5: GET /api/rota?from=2027-03-01&to=2027-03-07 → verify created entries"""
    print("\n" + "="*80)
    print("TEST 5: GET /api/rota (verify created entries)")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/rota?from=2027-03-01&to=2027-03-07", headers=HEADERS)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if not isinstance(data, list):
            print("❌ FAILED: Response is not an array")
            return False
        
        # Should have exactly 3 entries
        if len(data) != 3:
            print(f"❌ FAILED: Expected 3 entries, got {len(data)}")
            return False
        
        # Verify each entry
        expected_entries = [
            {"date": "2027-03-01", "role": "shift", "shiftSlot": "Prep", "startTime": "06:30", "endTime": "14:00"},
            {"date": "2027-03-02", "role": "overtime", "shiftSlot": "Overtime", "notes": "test reason"},
            {"date": "2027-03-03", "role": "leave:sick", "shiftSlot": "Sick"}
        ]
        
        for expected in expected_entries:
            found = False
            for entry in data:
                if entry.get("shiftDate") == expected["date"] and entry.get("role") == expected["role"]:
                    found = True
                    
                    # Verify shiftSlot
                    if entry.get("shiftSlot") != expected["shiftSlot"]:
                        print(f"❌ FAILED: Entry {expected['date']} has shiftSlot '{entry.get('shiftSlot')}', expected '{expected['shiftSlot']}'")
                        return False
                    
                    # Verify times if present
                    if "startTime" in expected:
                        if entry.get("startTime") != expected["startTime"]:
                            print(f"❌ FAILED: Entry {expected['date']} has startTime '{entry.get('startTime')}', expected '{expected['startTime']}'")
                            return False
                    
                    if "endTime" in expected:
                        if entry.get("endTime") != expected["endTime"]:
                            print(f"❌ FAILED: Entry {expected['date']} has endTime '{entry.get('endTime')}', expected '{expected['endTime']}'")
                            return False
                    
                    # Verify notes if present
                    if "notes" in expected:
                        if entry.get("notes") != expected["notes"]:
                            print(f"❌ FAILED: Entry {expected['date']} has notes '{entry.get('notes')}', expected '{expected['notes']}'")
                            return False
                    
                    break
            
            if not found:
                print(f"❌ FAILED: Entry {expected['date']} with role '{expected['role']}' not found")
                return False
        
        # Verify config row NOT included
        for entry in data:
            if entry.get("chefName") == "__rota_config__":
                print("❌ FAILED: Config row should NOT be included in normal queries")
                return False
        
        print("✅ TEST 5 PASSED: All 3 entries verified with correct role/shiftSlot/times/notes")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_6_copy_week():
    """Test 6: POST /api/rota/copy-week → copy shift from week 1 to week 2"""
    print("\n" + "="*80)
    print("TEST 6: POST /api/rota/copy-week")
    print("="*80)
    
    try:
        # Step 1: Copy week (should copy only the regular shift, not overtime/leave)
        print("\nStep 1: Copying week 2027-03-01 to 2027-03-08...")
        copy_payload = {
            "fromStart": "2027-03-01",
            "toStart": "2027-03-08"
        }
        
        response = requests.post(f"{BASE_URL}/rota/copy-week", headers=HEADERS, json=copy_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify response structure
        if not data.get("ok"):
            print("❌ FAILED: Response 'ok' is not true")
            return False
        
        if data.get("copied") != 1:
            print(f"❌ FAILED: Expected copied=1 (only regular shift), got {data.get('copied')}")
            return False
        
        if data.get("skipped") != 0:
            print(f"❌ FAILED: Expected skipped=0, got {data.get('skipped')}")
            return False
        
        print(f"✅ Step 1 PASSED: Copied 1 shift, skipped 0 (overtime + leave correctly excluded)")
        
        # Step 2: Verify copied entry
        print("\nStep 2: Verifying copied entry in week 2027-03-08...")
        response = requests.get(f"{BASE_URL}/rota?from=2027-03-08&to=2027-03-14", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: GET returned {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if len(data) != 1:
            print(f"❌ FAILED: Expected 1 entry in week 2, got {len(data)}")
            return False
        
        entry = data[0]
        
        # Track ID for cleanup
        if "id" in entry:
            created_rota_ids.append(entry["id"])
        
        # Verify it's the Prep shift on 2027-03-08
        if entry.get("shiftDate") != "2027-03-08":
            print(f"❌ FAILED: Expected shiftDate='2027-03-08', got '{entry.get('shiftDate')}'")
            return False
        
        if entry.get("shiftSlot") != "Prep":
            print(f"❌ FAILED: Expected shiftSlot='Prep', got '{entry.get('shiftSlot')}'")
            return False
        
        if entry.get("role") != "shift":
            print(f"❌ FAILED: Expected role='shift', got '{entry.get('role')}'")
            return False
        
        print(f"✅ Step 2 PASSED: Verified copied entry (shiftDate=2027-03-08, shiftSlot=Prep)")
        
        print("✅ TEST 6 PASSED: Copy-week working correctly (only regular shifts copied)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_7_copy_week_idempotent():
    """Test 7: POST /api/rota/copy-week again → should be idempotent (copied=0, skipped=1)"""
    print("\n" + "="*80)
    print("TEST 7: POST /api/rota/copy-week (idempotent)")
    print("="*80)
    
    try:
        copy_payload = {
            "fromStart": "2027-03-01",
            "toStart": "2027-03-08"
        }
        
        response = requests.post(f"{BASE_URL}/rota/copy-week", headers=HEADERS, json=copy_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get("copied") != 0:
            print(f"❌ FAILED: Expected copied=0 (idempotent), got {data.get('copied')}")
            return False
        
        if data.get("skipped") != 1:
            print(f"❌ FAILED: Expected skipped=1, got {data.get('skipped')}")
            return False
        
        print("✅ TEST 7 PASSED: Copy-week is idempotent (copied=0, skipped=1)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_8_bulk_assign():
    """Test 8: POST /api/rota/bulk → assign shift to multiple staff × multiple days"""
    print("\n" + "="*80)
    print("TEST 8: POST /api/rota/bulk")
    print("="*80)
    
    try:
        bulk_payload = {
            "names": ["Xyz", "Dev"],
            "dates": ["2027-03-04", "2027-03-05"],
            "shiftName": "BulkTest",
            "startTime": "10:00",
            "endTime": "16:00"
        }
        
        response = requests.post(f"{BASE_URL}/rota/bulk", headers=HEADERS, json=bulk_payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 201:
            print(f"❌ FAILED: Expected 201, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Should create 4 rows (2 names × 2 dates)
        if data.get("created") != 4:
            print(f"❌ FAILED: Expected created=4, got {data.get('created')}")
            return False
        
        print(f"✅ Bulk created 4 entries")
        
        # Verify entries exist
        print("\nVerifying bulk entries...")
        response = requests.get(f"{BASE_URL}/rota?from=2027-03-04&to=2027-03-05", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: GET returned {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Filter to only BulkTest entries
        bulk_entries = [e for e in data if e.get("shiftSlot") == "BulkTest"]
        
        if len(bulk_entries) != 4:
            print(f"❌ FAILED: Expected 4 BulkTest entries, got {len(bulk_entries)}")
            return False
        
        # Track IDs for cleanup
        for entry in bulk_entries:
            if "id" in entry:
                created_rota_ids.append(entry["id"])
        
        # Verify all combinations exist
        expected_combos = [
            ("Xyz", "2027-03-04"),
            ("Xyz", "2027-03-05"),
            ("Dev", "2027-03-04"),
            ("Dev", "2027-03-05")
        ]
        
        for name, date in expected_combos:
            found = False
            for entry in bulk_entries:
                if entry.get("chefName") == name and entry.get("shiftDate") == date:
                    found = True
                    
                    # Verify times
                    if entry.get("startTime") != "10:00":
                        print(f"❌ FAILED: Entry {name}/{date} has startTime '{entry.get('startTime')}', expected '10:00'")
                        return False
                    
                    if entry.get("endTime") != "16:00":
                        print(f"❌ FAILED: Entry {name}/{date} has endTime '{entry.get('endTime')}', expected '16:00'")
                        return False
                    
                    break
            
            if not found:
                print(f"❌ FAILED: Entry {name}/{date} not found")
                return False
        
        print("✅ TEST 8 PASSED: Bulk assign created 4 entries correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_9_validation():
    """Test 9: Validation tests"""
    print("\n" + "="*80)
    print("TEST 9: Validation tests")
    print("="*80)
    
    try:
        # Test 9a: POST /api/rota/bulk with empty names → 400
        print("\nTest 9a: POST /api/rota/bulk with empty names...")
        response = requests.post(f"{BASE_URL}/rota/bulk", headers=HEADERS, json={
            "names": [],
            "dates": ["2027-03-04"],
            "shiftName": "Test"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        print("✅ Test 9a PASSED: Empty names → 400")
        
        # Test 9b: POST /api/rota/copy-week with bad date → 400
        print("\nTest 9b: POST /api/rota/copy-week with bad date...")
        response = requests.post(f"{BASE_URL}/rota/copy-week", headers=HEADERS, json={
            "fromStart": "invalid-date",
            "toStart": "2027-03-08"
        })
        print(f"Status: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        print("✅ Test 9b PASSED: Bad date → 400")
        
        # Test 9c: GET /api/rota/staff-names without auth → 401/403
        print("\nTest 9c: GET /api/rota/staff-names without auth...")
        response = requests.get(f"{BASE_URL}/rota/staff-names")
        print(f"Status: {response.status_code}")
        
        if response.status_code not in [401, 403]:
            print(f"❌ FAILED: Expected 401/403, got {response.status_code}")
            return False
        
        print("✅ Test 9c PASSED: No auth → 401/403")
        
        print("✅ TEST 9 PASSED: All validation tests passed")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def test_10_cleanup():
    """Test 10: CLEANUP - delete all created rows and purge from trash"""
    print("\n" + "="*80)
    print("TEST 10: CLEANUP (delete + purge from trash)")
    print("="*80)
    
    try:
        print(f"\nCreated {len(created_rota_ids)} rota entries to clean up")
        print(f"IDs: {created_rota_ids}")
        
        # Step 1: Delete all created entries (soft delete to trash)
        print("\nStep 1: Soft-deleting entries...")
        deleted_count = 0
        for rota_id in created_rota_ids:
            response = requests.delete(f"{BASE_URL}/rota/{rota_id}", headers=HEADERS)
            if response.status_code == 200:
                deleted_count += 1
                print(f"  ✓ Deleted {rota_id}")
            else:
                print(f"  ⚠️  Failed to delete {rota_id}: {response.status_code}")
        
        print(f"✅ Soft-deleted {deleted_count}/{len(created_rota_ids)} entries")
        
        # Step 2: Get trash to find our entries
        print("\nStep 2: Getting trash bin...")
        response = requests.get(f"{BASE_URL}/trash", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: GET /api/trash returned {response.status_code}")
            return False
        
        trash_data = response.json()
        trash_items = trash_data.get("items", [])
        print(f"Trash contains {len(trash_items)} items")
        
        # Find our rota entries in trash
        our_trash_ids = []
        for item in trash_items:
            if item.get("entityType") == "Rota shift":
                # Check if it's one of our test entries (2027 dates)
                label = item.get("label", "")
                if "2027-03" in label:
                    our_trash_ids.append(item["id"])
        
        print(f"Found {len(our_trash_ids)} of our entries in trash")
        
        # Step 3: Permanently delete from trash
        print("\nStep 3: Permanently deleting from trash...")
        purged_count = 0
        for trash_id in our_trash_ids:
            response = requests.delete(f"{BASE_URL}/trash/{trash_id}", headers=HEADERS)
            if response.status_code == 200:
                purged_count += 1
                print(f"  ✓ Purged {trash_id}")
            else:
                print(f"  ⚠️  Failed to purge {trash_id}: {response.status_code}")
        
        print(f"✅ Purged {purged_count}/{len(our_trash_ids)} entries from trash")
        
        # Step 4: Verify no entries remain in 2027 date range
        print("\nStep 4: Verifying cleanup...")
        response = requests.get(f"{BASE_URL}/rota?from=2027-03-01&to=2027-03-14", headers=HEADERS)
        if response.status_code != 200:
            print(f"❌ FAILED: Final GET returned {response.status_code}")
            return False
        
        data = response.json()
        if len(data) != 0:
            print(f"❌ FAILED: Expected 0 entries, got {len(data)}")
            print(f"Remaining entries: {json.dumps(data, indent=2)}")
            return False
        
        print("✅ Verified: No entries remain in 2027-03-01 to 2027-03-14 range")
        print("✅ TEST 10 PASSED: Cleanup complete")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception: {e}")
        return False


def main():
    """Run all tests"""
    print("="*80)
    print("ROTA V2 BACKEND TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Using production Supabase DB with STRICT CLEANUP protocol")
    print(f"Test dates: 2027-03-01 to 2027-03-14 (far future, won't touch real data)")
    print("="*80)
    
    results = []
    
    # Test 1: GET staff-names
    results.append(("Test 1: GET staff-names", test_1_staff_names()))
    
    # Test 2: GET config
    success, original_config = test_2_get_config()
    results.append(("Test 2: GET config", success))
    
    # Test 3: POST config (only if Test 2 passed)
    if success and original_config:
        results.append(("Test 3: POST config", test_3_post_config(original_config)))
    else:
        print("\n⚠️  Skipping Test 3 (Test 2 failed)")
        results.append(("Test 3: POST config", False))
    
    # Test 4: Create rota entries
    results.append(("Test 4: Create entries", test_4_create_rota_entries()))
    
    # Test 5: GET rota entries
    results.append(("Test 5: GET entries", test_5_get_rota_entries()))
    
    # Test 6: Copy week
    results.append(("Test 6: Copy week", test_6_copy_week()))
    
    # Test 7: Copy week idempotent
    results.append(("Test 7: Copy week idempotent", test_7_copy_week_idempotent()))
    
    # Test 8: Bulk assign
    results.append(("Test 8: Bulk assign", test_8_bulk_assign()))
    
    # Test 9: Validation
    results.append(("Test 9: Validation", test_9_validation()))
    
    # Test 10: CLEANUP (always run)
    results.append(("Test 10: CLEANUP", test_10_cleanup()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("="*80)
    print(f"Total: {passed} passed, {failed} failed")
    print("="*80)
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
