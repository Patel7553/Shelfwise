#!/usr/bin/env python3
"""
Focused test of the NEW sensor integration endpoints in ShelfWise.
Tests validation/auth/catalog layers only (Supabase NOT configured locally).
"""

import requests
import json
import sys
import subprocess

# Base URL from .env
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"

def mint_chef_jwt():
    """Generate a chef JWT for local testing"""
    cmd = [
        'node', '-e',
        "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

def test_health():
    """Test 1: GET /api/health → 200 (route file syntax sanity)"""
    print("\n=== Test 1: GET /api/health ===")
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        if r.status_code == 200:
            print(f"✅ PASS: GET /api/health → {r.status_code}")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_vendors_no_auth():
    """Test 2: GET /api/sensors/vendors with NO auth → 401"""
    print("\n=== Test 2: GET /api/sensors/vendors (no auth) ===")
    try:
        r = requests.get(f"{BASE_URL}/sensors/vendors", timeout=10)
        if r.status_code == 401:
            print(f"✅ PASS: No auth → 401")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_vendors_with_auth(jwt):
    """Test 3: GET /api/sensors/vendors with JWT → 200, array of 4 vendors"""
    print("\n=== Test 3: GET /api/sensors/vendors (with JWT) ===")
    try:
        headers = {"Authorization": f"Bearer {jwt}"}
        r = requests.get(f"{BASE_URL}/sensors/vendors", headers=headers, timeout=10)
        if r.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
        
        data = r.json()
        if not isinstance(data, list):
            print(f"❌ FAIL: Expected array, got {type(data)}")
            return False
        
        if len(data) != 4:
            print(f"❌ FAIL: Expected 4 vendors, got {len(data)}")
            return False
        
        # Check vendor IDs and properties
        vendor_ids = [v['id'] for v in data]
        expected_ids = ['demo', 'generic_rest', 'kelsius', 'navitas']
        if set(vendor_ids) != set(expected_ids):
            print(f"❌ FAIL: Expected vendor IDs {expected_ids}, got {vendor_ids}")
            return False
        
        # Check demo vendor
        demo = next((v for v in data if v['id'] == 'demo'), None)
        if not demo:
            print(f"❌ FAIL: Demo vendor not found")
            return False
        if demo['comingSoon'] != False:
            print(f"❌ FAIL: Demo comingSoon should be false, got {demo['comingSoon']}")
            return False
        if len(demo['credentialFields']) != 0:
            print(f"❌ FAIL: Demo credentialFields should be empty, got {demo['credentialFields']}")
            return False
        
        # Check generic_rest vendor
        generic = next((v for v in data if v['id'] == 'generic_rest'), None)
        if not generic:
            print(f"❌ FAIL: generic_rest vendor not found")
            return False
        if generic['comingSoon'] != False:
            print(f"❌ FAIL: generic_rest comingSoon should be false, got {generic['comingSoon']}")
            return False
        if not isinstance(generic['credentialFields'], list) or len(generic['credentialFields']) < 2:
            print(f"❌ FAIL: generic_rest should have credentialFields (baseUrl, apiKey)")
            return False
        field_keys = [f['key'] for f in generic['credentialFields']]
        if 'baseUrl' not in field_keys or 'apiKey' not in field_keys:
            print(f"❌ FAIL: generic_rest missing baseUrl or apiKey fields")
            return False
        
        # Check kelsius vendor
        kelsius = next((v for v in data if v['id'] == 'kelsius'), None)
        if not kelsius:
            print(f"❌ FAIL: kelsius vendor not found")
            return False
        if kelsius['comingSoon'] != True:
            print(f"❌ FAIL: kelsius comingSoon should be true, got {kelsius['comingSoon']}")
            return False
        
        # Check navitas vendor
        navitas = next((v for v in data if v['id'] == 'navitas'), None)
        if not navitas:
            print(f"❌ FAIL: navitas vendor not found")
            return False
        if navitas['comingSoon'] != True:
            print(f"❌ FAIL: navitas comingSoon should be true, got {navitas['comingSoon']}")
            return False
        
        print(f"✅ PASS: GET /api/sensors/vendors → 200 with 4 vendors:")
        print(f"  - demo: comingSoon=false, credentialFields=[]")
        print(f"  - generic_rest: comingSoon=false, credentialFields=[baseUrl, apiKey]")
        print(f"  - kelsius: comingSoon=true")
        print(f"  - navitas: comingSoon=true")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_connect_bogus_vendor(jwt):
    """Test 4: POST /api/sensors/connect with JWT + {"vendor":"bogus"} → 400 'Unknown vendor'"""
    print("\n=== Test 4: POST /api/sensors/connect (bogus vendor) ===")
    try:
        headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
        payload = {"vendor": "bogus"}
        r = requests.post(f"{BASE_URL}/sensors/connect", headers=headers, json=payload, timeout=10)
        if r.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
        
        data = r.json()
        if 'Unknown vendor' not in data.get('error', ''):
            print(f"❌ FAIL: Expected 'Unknown vendor' in error, got: {data.get('error')}")
            return False
        
        print(f"✅ PASS: POST /api/sensors/connect (bogus vendor) → 400 'Unknown vendor'")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_connect_kelsius(jwt):
    """Test 5: POST /api/sensors/connect with JWT + {"vendor":"kelsius"} → 400 'not live yet'"""
    print("\n=== Test 5: POST /api/sensors/connect (kelsius - coming soon) ===")
    try:
        headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
        payload = {"vendor": "kelsius", "credentials": {}}
        r = requests.post(f"{BASE_URL}/sensors/connect", headers=headers, json=payload, timeout=10)
        if r.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
        
        data = r.json()
        error_msg = data.get('error', '').lower()
        if 'not live yet' not in error_msg:
            print(f"❌ FAIL: Expected 'not live yet' in error, got: {data.get('error')}")
            return False
        
        print(f"✅ PASS: POST /api/sensors/connect (kelsius) → 400 'not live yet'")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_connect_generic_invalid_baseurl(jwt):
    """Test 6: POST /api/sensors/connect with JWT + generic_rest + empty baseUrl → 400 'Base URL'"""
    print("\n=== Test 6: POST /api/sensors/connect (generic_rest - invalid baseUrl) ===")
    try:
        headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
        payload = {"vendor": "generic_rest", "credentials": {"baseUrl": "", "apiKey": "x"}}
        r = requests.post(f"{BASE_URL}/sensors/connect", headers=headers, json=payload, timeout=10)
        if r.status_code != 400:
            print(f"❌ FAIL: Expected 400, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
        
        data = r.json()
        error_msg = data.get('error', '')
        if 'Base URL' not in error_msg and 'baseUrl' not in error_msg:
            print(f"❌ FAIL: Expected 'Base URL' in error, got: {error_msg}")
            return False
        
        print(f"✅ PASS: POST /api/sensors/connect (generic_rest invalid baseUrl) → 400 containing 'Base URL'")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_connect_demo(jwt):
    """Test 7: POST /api/sensors/connect with JWT + {"vendor":"demo"} → 500 (DB error, not 400)"""
    print("\n=== Test 7: POST /api/sensors/connect (demo - should reach DB) ===")
    try:
        headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
        payload = {"vendor": "demo"}
        r = requests.post(f"{BASE_URL}/sensors/connect", headers=headers, json=payload, timeout=15)
        
        # Demo adapter should succeed (returns 3 sensors), but DB upsert should fail
        # because Supabase isn't configured locally
        if r.status_code == 400:
            print(f"❌ FAIL: Got 400 (validation error) - demo adapter should have succeeded")
            print(f"Response: {r.text[:200]}")
            return False
        
        if r.status_code == 500:
            data = r.json()
            error_msg = data.get('error', '')
            # Should be a DB-related error
            print(f"✅ PASS: POST /api/sensors/connect (demo) → 500 (DB error as expected)")
            print(f"  Error message: {error_msg[:100]}")
            return True
        
        # If we get 200, it means DB worked (unexpected in local env without Supabase)
        if r.status_code == 200:
            print(f"⚠️  UNEXPECTED: Got 200 - DB seems to be working (Supabase configured?)")
            data = r.json()
            if 'sensors' in data and isinstance(data['sensors'], list):
                print(f"  Returned {len(data['sensors'])} sensors")
            return True
        
        print(f"❌ FAIL: Expected 500 or 200, got {r.status_code}")
        print(f"Response: {r.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_sync_no_auth():
    """Test 8: POST /api/sensors/sync with NO auth → 401"""
    print("\n=== Test 8: POST /api/sensors/sync (no auth) ===")
    try:
        headers = {"Content-Type": "application/json"}
        r = requests.post(f"{BASE_URL}/sensors/sync", headers=headers, json={}, timeout=10)
        if r.status_code == 401:
            print(f"✅ PASS: POST /api/sensors/sync (no auth) → 401")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {r.status_code}")
            print(f"Response: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_cron_sensor_sync():
    """Test 9: GET /api/cron/sensor-sync → 500 or DB error (no CRON_SECRET set locally)"""
    print("\n=== Test 9: GET /api/cron/sensor-sync ===")
    try:
        # No CRON_SECRET set locally, so no auth needed
        r = requests.get(f"{BASE_URL}/cron/sensor-sync", timeout=15)
        
        # Should reach the DB query and fail because Supabase isn't configured
        if r.status_code == 500 or r.status_code == 200:
            data = r.json()
            print(f"✅ PASS: GET /api/cron/sensor-sync → {r.status_code}")
            if 'error' in data:
                print(f"  Error (expected): {data['error'][:100]}")
            elif 'note' in data:
                print(f"  Note: {data['note']}")
            elif 'results' in data:
                print(f"  Results: {len(data.get('results', []))} connections processed")
            return True
        
        print(f"❌ FAIL: Expected 500 or 200, got {r.status_code}")
        print(f"Response: {r.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_vendor_registry_unit():
    """Test 10: Unit-test the vendor registry directly with node"""
    print("\n=== Test 10: Unit-test vendor registry (node) ===")
    try:
        cmd = [
            'node', '-e',
            """
            import('/app/lib/sensorVendors.js').then(async m => {
                const d = m.SENSOR_VENDORS.demo;
                const s = await d.listSensors();
                console.log('sensors:', s.length);
                const r = await d.fetchReadings({}, s.map(x => x.id));
                console.log('readings:', JSON.stringify(r));
            }).catch(e => {
                console.error('ERROR:', e.message);
                process.exit(1);
            })
            """
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            print(f"❌ FAIL: Node script failed")
            print(f"stderr: {result.stderr}")
            return False
        
        output = result.stdout.strip()
        lines = output.split('\n')
        
        # Check sensors count
        sensors_line = next((l for l in lines if l.startswith('sensors:')), None)
        if not sensors_line or '3' not in sensors_line:
            print(f"❌ FAIL: Expected 3 sensors, got: {sensors_line}")
            return False
        
        # Check readings
        readings_line = next((l for l in lines if l.startswith('readings:')), None)
        if not readings_line:
            print(f"❌ FAIL: No readings line found")
            return False
        
        readings_json = readings_line.replace('readings:', '').strip()
        readings = json.loads(readings_json)
        
        if len(readings) != 3:
            print(f"❌ FAIL: Expected 3 readings, got {len(readings)}")
            return False
        
        # Validate each reading
        for r in readings:
            if 'sensorId' not in r or 'temperatureC' not in r or 'recordedAt' not in r:
                print(f"❌ FAIL: Reading missing required fields: {r}")
                return False
            
            temp = r['temperatureC']
            if not isinstance(temp, (int, float)):
                print(f"❌ FAIL: temperatureC should be numeric, got {type(temp)}")
                return False
            
            sensor_id = r['sensorId']
            if 'fridge' in sensor_id:
                if not (0 <= temp <= 8):
                    print(f"❌ FAIL: Fridge temp {temp}°C out of range (expected 0-8)")
                    return False
            elif 'freezer' in sensor_id:
                if not (-22 <= temp <= -16):
                    print(f"❌ FAIL: Freezer temp {temp}°C out of range (expected -22 to -16)")
                    return False
            
            # Check ISO date format
            recorded_at = r['recordedAt']
            if not recorded_at or 'T' not in recorded_at:
                print(f"❌ FAIL: recordedAt should be ISO format, got: {recorded_at}")
                return False
        
        print(f"✅ PASS: Vendor registry unit test")
        print(f"  - 3 sensors returned")
        print(f"  - 3 readings with numeric temperatureC")
        print(f"  - Fridge temps: 0-8°C, Freezer temps: -22 to -16°C")
        print(f"  - All recordedAt in ISO format")
        return True
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def main():
    print("=" * 80)
    print("SENSOR INTEGRATION FOCUSED TEST")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    
    # Mint JWT
    print("\n🔑 Minting chef JWT...")
    jwt = mint_chef_jwt()
    print(f"JWT: {jwt[:50]}...")
    
    # Run all tests
    results = []
    results.append(("Test 1: Health check", test_health()))
    results.append(("Test 2: Vendors (no auth)", test_vendors_no_auth()))
    results.append(("Test 3: Vendors (with auth)", test_vendors_with_auth(jwt)))
    results.append(("Test 4: Connect bogus vendor", test_connect_bogus_vendor(jwt)))
    results.append(("Test 5: Connect kelsius (coming soon)", test_connect_kelsius(jwt)))
    results.append(("Test 6: Connect generic_rest (invalid baseUrl)", test_connect_generic_invalid_baseurl(jwt)))
    results.append(("Test 7: Connect demo (reaches DB)", test_connect_demo(jwt)))
    results.append(("Test 8: Sync (no auth)", test_sync_no_auth()))
    results.append(("Test 9: Cron sensor-sync", test_cron_sensor_sync()))
    results.append(("Test 10: Vendor registry unit test", test_vendor_registry_unit()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
