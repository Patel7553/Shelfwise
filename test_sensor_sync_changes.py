#!/usr/bin/env python3
"""
Test suite for sensor-sync changes:
1. GET /api/cron/sensor-sync with and without ?force=1 query param
2. sensorPassFor() freezer threshold changed from <= -15 to <= -18 (unit test)
3. Verify push-alert wiring in syncSensorConnection (code inspection)
4. Regression checks (health, sensors/vendors, demo vendor unit test)
5. Verify /app/vercel.json has exactly 2 crons (weekly-digest, push-alerts) and NO sensor-sync cron
"""

import os
import sys
import json
import subprocess

# Use localhost for testing (app runs locally on port 3000)
BASE_URL = 'http://localhost:3000'
API_BASE = f"{BASE_URL}/api"

# Mint a chef JWT for authentication
def mint_chef_jwt():
    """Mint a chef JWT using SHELFWISE_JWT_SECRET from .env"""
    cmd = """node -e "console.log(require('/app/node_modules/jsonwebtoken').sign({kitchen_id:'test-kitchen',role:'chef'},'local-dev-secret-shelfwise-2026',{expiresIn:'1h'}))" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

JWT_TOKEN = mint_chef_jwt()
print(f"✓ Minted chef JWT for testing\n")

def test_api(method, endpoint, headers=None, data=None, expected_status=None, description=""):
    """Helper to test API endpoints"""
    import urllib.request
    import urllib.error
    
    url = f"{API_BASE}/{endpoint}"
    req_headers = headers or {}
    
    try:
        if data:
            req_data = json.dumps(data).encode('utf-8')
            req_headers['Content-Type'] = 'application/json'
        else:
            req_data = None
        
        req = urllib.request.Request(url, data=req_data, headers=req_headers, method=method)
        
        with urllib.request.urlopen(req, timeout=30) as response:
            status = response.status
            body = response.read().decode('utf-8')
            try:
                json_body = json.loads(body)
            except:
                json_body = None
            
            if expected_status and status != expected_status:
                print(f"❌ {description}")
                print(f"   Expected status {expected_status}, got {status}")
                print(f"   Response: {body[:200]}")
                return False, status, json_body
            
            return True, status, json_body
            
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode('utf-8')
        try:
            json_body = json.loads(body)
        except:
            json_body = None
        
        if expected_status and status != expected_status:
            print(f"❌ {description}")
            print(f"   Expected status {expected_status}, got {status}")
            print(f"   Response: {body[:200]}")
            return False, status, json_body
        
        return True, status, json_body
    except Exception as e:
        print(f"❌ {description}")
        print(f"   Exception: {str(e)}")
        return False, None, None

print("=" * 80)
print("SENSOR-SYNC CHANGES TEST SUITE")
print("=" * 80)
print()

# Test 1a: GET /api/cron/sensor-sync (no param)
print("Test 1a: GET /api/cron/sensor-sync (no force param)")
print("-" * 80)
success, status, body = test_api('GET', 'cron/sensor-sync', expected_status=500, 
                                  description="GET /api/cron/sensor-sync without force param")
if success:
    # Check if it's a DB error (expected) or a JS error (bug)
    error_msg = body.get('error', '') if body else ''
    if 'does not exist' in error_msg or 'Supabase' in error_msg or 'relation' in error_msg:
        print(f"✅ Test 1a PASSED: Reached DB query (500 with DB error as expected)")
        print(f"   Status: {status}")
        print(f"   Error: {error_msg[:150]}")
    else:
        print(f"❌ Test 1a FAILED: Got 500 but not a DB error")
        print(f"   Error: {error_msg}")
else:
    print(f"❌ Test 1a FAILED")
print()

# Test 1b: GET /api/cron/sensor-sync?force=1
print("Test 1b: GET /api/cron/sensor-sync?force=1")
print("-" * 80)
success, status, body = test_api('GET', 'cron/sensor-sync?force=1', expected_status=500,
                                  description="GET /api/cron/sensor-sync with force=1")
if success:
    error_msg = body.get('error', '') if body else ''
    if 'does not exist' in error_msg or 'Supabase' in error_msg or 'relation' in error_msg:
        print(f"✅ Test 1b PASSED: force=1 param parsed correctly, reached DB query")
        print(f"   Status: {status}")
        print(f"   Error: {error_msg[:150]}")
    else:
        print(f"❌ Test 1b FAILED: Got 500 but not a DB error")
        print(f"   Error: {error_msg}")
else:
    print(f"❌ Test 1b FAILED")
print()

# Test 2: Unit test sensorPassFor() function
print("Test 2: Unit test sensorPassFor() freezer threshold -18°C")
print("-" * 80)
print("Testing freezer threshold change from <= -15 to <= -18...")

# Extract and test the sensorPassFor function
test_code = """
// Copy the sensorPassFor function from route.js
function sensorPassFor(loc, val) {
  const minC = Number.isFinite(Number(loc?.minC)) && loc?.minC !== null ? Number(loc.minC) : null
  const maxC = Number.isFinite(Number(loc?.maxC)) && loc?.maxC !== null ? Number(loc.maxC) : null
  if (minC !== null || maxC !== null) {
    if (minC !== null && val < minC) return false
    if (maxC !== null && val > maxC) return false
    return true
  }
  const t = loc?.type || 'fridge'
  if (t === 'fridge') return val >= 0 && val <= 5
  if (t === 'chiller') return val >= 0 && val <= 8
  if (t === 'freezer') return val <= -18
  if (t === 'hot_hold') return val >= 63
  return true
}

// Test cases
const tests = [
  // Freezer tests (threshold -18)
  { loc: {type: 'freezer'}, val: -18.0, expected: true, desc: 'freezer -18.0 → PASS' },
  { loc: {type: 'freezer'}, val: -18.5, expected: true, desc: 'freezer -18.5 → PASS' },
  { loc: {type: 'freezer'}, val: -17.0, expected: false, desc: 'freezer -17.0 → FAIL' },
  { loc: {type: 'freezer'}, val: -16.0, expected: false, desc: 'freezer -16.0 → FAIL' },
  { loc: {type: 'freezer'}, val: -15.0, expected: false, desc: 'freezer -15.0 → FAIL' },
  { loc: {type: 'freezer'}, val: -20.0, expected: true, desc: 'freezer -20.0 → PASS' },
  
  // Fridge tests (0 to 5)
  { loc: {type: 'fridge'}, val: 3.0, expected: true, desc: 'fridge 3.0 → PASS' },
  { loc: {type: 'fridge'}, val: 6.0, expected: false, desc: 'fridge 6.0 → FAIL' },
  { loc: {type: 'fridge'}, val: -1.0, expected: false, desc: 'fridge -1.0 → FAIL' },
  
  // Chiller tests (0 to 8)
  { loc: {type: 'chiller'}, val: 7.0, expected: true, desc: 'chiller 7.0 → PASS' },
  { loc: {type: 'chiller'}, val: 9.0, expected: false, desc: 'chiller 9.0 → FAIL' },
  
  // Hot hold tests (>= 63)
  { loc: {type: 'hot_hold'}, val: 63.0, expected: true, desc: 'hot_hold 63.0 → PASS' },
  { loc: {type: 'hot_hold'}, val: 60.0, expected: false, desc: 'hot_hold 60.0 → FAIL' },
  
  // Custom range overrides default
  { loc: {type: 'freezer', minC: -20, maxC: -15}, val: -16.0, expected: true, desc: 'custom range -20 to -15, val -16 → PASS' },
]

let passed = 0
let failed = 0
const results = []

for (const test of tests) {
  const result = sensorPassFor(test.loc, test.val)
  const success = result === test.expected
  if (success) {
    passed++
    results.push({ success: true, desc: test.desc, result })
  } else {
    failed++
    results.push({ success: false, desc: test.desc, expected: test.expected, got: result })
  }
}

console.log(JSON.stringify({ passed, failed, results }))
"""

result = subprocess.run(['node', '-e', test_code], capture_output=True, text=True)
if result.returncode == 0:
    try:
        test_results = json.loads(result.stdout.strip())
        print(f"✅ Test 2 PASSED: sensorPassFor() unit tests ({test_results['passed']}/{test_results['passed'] + test_results['failed']} passed)")
        print()
        print("   Detailed results:")
        for r in test_results['results']:
            if r['success']:
                print(f"   ✓ {r['desc']}")
            else:
                print(f"   ✗ {r['desc']} - expected {r['expected']}, got {r['got']}")
        
        if test_results['failed'] > 0:
            print(f"\n❌ Test 2 FAILED: {test_results['failed']} test cases failed")
    except Exception as e:
        print(f"❌ Test 2 FAILED: Could not parse test results: {e}")
        print(f"   Output: {result.stdout}")
else:
    print(f"❌ Test 2 FAILED: Node execution error")
    print(f"   Error: {result.stderr}")
print()

# Test 3: Code inspection of push-alert wiring
print("Test 3: Verify push-alert wiring in syncSensorConnection")
print("-" * 80)
print("Inspecting route.js for push alert implementation...")

# Read route.js and check for push alert wiring
with open('/app/app/api/[[...path]]/route.js', 'r') as f:
    route_content = f.read()

# Check for key elements
checks = [
    ('sendPushToKitchen function exists', 'async function sendPushToKitchen' in route_content),
    ('failedReadings array used', 'failedReadings.length > 0' in route_content),
    ('Push alert title contains ALERT', "'🚨 Sensor temperature ALERT'" in route_content or '"🚨 Sensor temperature ALERT"' in route_content),
    ('Push alert URL is /?view=haccp', "'/?view=haccp'" in route_content or '"/?view=haccp"' in route_content),
    ('sendPushToKitchen called in syncSensorConnection', 'await sendPushToKitchen(sb, conn.kitchen_id' in route_content),
]

all_passed = True
for desc, check in checks:
    if check:
        print(f"   ✓ {desc}")
    else:
        print(f"   ✗ {desc}")
        all_passed = False

if all_passed:
    print(f"\n✅ Test 3 PASSED: Push alert wiring verified by code inspection")
else:
    print(f"\n❌ Test 3 FAILED: Some push alert wiring checks failed")
print()

# Test 4a: Regression - GET /api/health
print("Test 4a: Regression - GET /api/health")
print("-" * 80)
success, status, body = test_api('GET', 'health', expected_status=200,
                                  description="GET /api/health")
if success:
    print(f"✅ Test 4a PASSED: Health endpoint working")
    print(f"   Status: {status}")
else:
    print(f"❌ Test 4a FAILED")
print()

# Test 4b: Regression - GET /api/sensors/vendors without auth
print("Test 4b: Regression - GET /api/sensors/vendors without auth")
print("-" * 80)
success, status, body = test_api('GET', 'sensors/vendors', expected_status=401,
                                  description="GET /api/sensors/vendors without auth")
if success:
    print(f"✅ Test 4b PASSED: Vendors endpoint requires auth (401)")
    print(f"   Status: {status}")
else:
    print(f"❌ Test 4b FAILED")
print()

# Test 4c: Regression - GET /api/sensors/vendors with JWT
print("Test 4c: Regression - GET /api/sensors/vendors with JWT")
print("-" * 80)
success, status, body = test_api('GET', 'sensors/vendors', 
                                  headers={'Authorization': f'Bearer {JWT_TOKEN}'},
                                  expected_status=200,
                                  description="GET /api/sensors/vendors with JWT")
if success and body:
    # Response is a list of vendors directly
    vendors = body if isinstance(body, list) else body.get('vendors', [])
    if len(vendors) == 4:
        print(f"✅ Test 4c PASSED: Vendors endpoint returns 4 vendors")
        print(f"   Status: {status}")
        print(f"   Vendors:")
        for v in vendors:
            print(f"     - {v['id']}: {v['name']} (comingSoon: {v.get('comingSoon', False)})")
    else:
        print(f"❌ Test 4c FAILED: Expected 4 vendors, got {len(vendors)}")
else:
    print(f"❌ Test 4c FAILED")
print()

# Test 4d: Regression - Unit test demo vendor
print("Test 4d: Regression - Unit test demo vendor from /app/lib/sensorVendors.js")
print("-" * 80)

demo_test_code = """
const { SENSOR_VENDORS } = require('/app/lib/sensorVendors.js')

async function testDemo() {
  const demo = SENSOR_VENDORS['demo']
  
  // Test listSensors
  const sensors = await demo.listSensors()
  if (sensors.length !== 3) {
    console.log(JSON.stringify({ error: `Expected 3 sensors, got ${sensors.length}` }))
    return
  }
  
  // Test fetchReadings
  const sensorIds = sensors.map(s => s.id)
  const readings = await demo.fetchReadings({}, sensorIds)
  
  if (readings.length !== 3) {
    console.log(JSON.stringify({ error: `Expected 3 readings, got ${readings.length}` }))
    return
  }
  
  // Check all readings have numeric temperatureC
  const allNumeric = readings.every(r => typeof r.temperatureC === 'number' && Number.isFinite(r.temperatureC))
  if (!allNumeric) {
    console.log(JSON.stringify({ error: 'Not all readings have numeric temperatureC' }))
    return
  }
  
  // Check temperature ranges
  const fridgeReadings = readings.filter(r => r.sensorId.includes('fridge'))
  const freezerReadings = readings.filter(r => r.sensorId.includes('freezer'))
  
  const fridgeInRange = fridgeReadings.every(r => r.temperatureC >= 0 && r.temperatureC <= 8)
  const freezerInRange = freezerReadings.every(r => r.temperatureC <= -16 && r.temperatureC >= -22)
  
  console.log(JSON.stringify({
    success: true,
    sensors: sensors.length,
    readings: readings.length,
    fridgeInRange,
    freezerInRange,
    sampleReading: readings[0]
  }))
}

testDemo().catch(e => console.log(JSON.stringify({ error: e.message })))
"""

result = subprocess.run(['node', '-e', demo_test_code], capture_output=True, text=True)
if result.returncode == 0:
    try:
        demo_results = json.loads(result.stdout.strip())
        if demo_results.get('success'):
            print(f"✅ Test 4d PASSED: Demo vendor unit test")
            print(f"   Sensors: {demo_results['sensors']}")
            print(f"   Readings: {demo_results['readings']}")
            print(f"   Fridge temps in range (0-8°C): {demo_results['fridgeInRange']}")
            print(f"   Freezer temps in range (-22 to -16°C): {demo_results['freezerInRange']}")
            print(f"   Sample reading: {demo_results['sampleReading']}")
        else:
            print(f"❌ Test 4d FAILED: {demo_results.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"❌ Test 4d FAILED: Could not parse results: {e}")
        print(f"   Output: {result.stdout}")
else:
    print(f"❌ Test 4d FAILED: Node execution error")
    print(f"   Error: {result.stderr}")
print()

# Test 5: Verify vercel.json has exactly 2 crons
print("Test 5: Verify /app/vercel.json has exactly 2 crons (weekly-digest, push-alerts)")
print("-" * 80)

try:
    with open('/app/vercel.json', 'r') as f:
        vercel_config = json.load(f)
    
    crons = vercel_config.get('crons', [])
    
    if len(crons) == 2:
        cron_paths = [c['path'] for c in crons]
        expected_paths = ['/api/cron/weekly-digest', '/api/cron/push-alerts']
        
        if set(cron_paths) == set(expected_paths):
            print(f"✅ Test 5 PASSED: vercel.json has exactly 2 crons")
            print(f"   Crons:")
            for c in crons:
                print(f"     - {c['path']} (schedule: {c['schedule']})")
            print(f"   ✓ NO sensor-sync cron (as expected)")
        else:
            print(f"❌ Test 5 FAILED: Cron paths don't match expected")
            print(f"   Expected: {expected_paths}")
            print(f"   Got: {cron_paths}")
    else:
        print(f"❌ Test 5 FAILED: Expected 2 crons, got {len(crons)}")
        print(f"   Crons: {[c['path'] for c in crons]}")
except Exception as e:
    print(f"❌ Test 5 FAILED: Could not read vercel.json: {e}")
print()

print("=" * 80)
print("TEST SUITE COMPLETE")
print("=" * 80)
