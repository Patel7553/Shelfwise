#!/usr/bin/env python3
"""
READ-ONLY Backend Test: Dashboard Stats Endpoint (2x2 Stat Cards)
Tests GET /api/stats consistency with GET /api/products _status enrichment.

CRITICAL: This preview talks to REAL production Supabase database.
NO write operations (POST/PUT/PATCH/DELETE) allowed.
"""

import requests
import json
import subprocess
import sys

# Base URL from .env
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com"

def mint_chef_jwt():
    """Mint a chef JWT using kitchen_id and SHELFWISE_JWT_SECRET from .env"""
    cmd = """cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'a2573e6a-70f0-4a6d-97d0-ccf09b444643',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'12h'}));" """
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Failed to mint JWT: {result.stderr}")
        sys.exit(1)
    # Extract only the JWT token (last line, ignore dotenvx output)
    lines = result.stdout.strip().split('\n')
    token = lines[-1].strip()
    print(f"✅ Minted chef JWT (kitchen_id=a2573e6a-70f0-4a6d-97d0-ccf09b444643, person=Xyz)")
    return token

def test_stats_without_auth():
    """Test 1: GET /api/stats without Authorization header should return 401/403"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/stats without auth → should return 401/403")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/api/stats", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            print(f"✅ Test 1 PASSED: Auth enforced (status {response.status_code})")
            return True
        else:
            print(f"❌ Test 1 FAILED: Expected 401/403, got {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Test 1 FAILED with exception: {e}")
        return False

def test_stats_with_auth(token):
    """Test 2: GET /api/stats with auth should return 200 with correct fields"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/stats with auth → should return 200 with stat fields")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/api/stats", headers=headers, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Test 2 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False, None
        
        stats = response.json()
        print(f"Stats response: {json.dumps(stats, indent=2)}")
        
        # Check required fields
        required_fields = ['total', 'expired', 'expiring', 'critical', 'inDate', 'totalValue', 'belowReorder', 'expiryAlertDays']
        missing_fields = [f for f in required_fields if f not in stats]
        
        if missing_fields:
            print(f"❌ Test 2 FAILED: Missing fields: {missing_fields}")
            return False, None
        
        # Check all numeric fields are non-negative
        numeric_fields = ['total', 'expired', 'expiring', 'critical', 'inDate', 'totalValue', 'belowReorder', 'expiryAlertDays']
        for field in numeric_fields:
            value = stats.get(field)
            if not isinstance(value, (int, float)) or value < 0:
                print(f"❌ Test 2 FAILED: Field '{field}' is not a non-negative number: {value}")
                return False, None
        
        print(f"✅ Test 2 PASSED: All required fields present and valid")
        print(f"   - total: {stats['total']}")
        print(f"   - expired: {stats['expired']}")
        print(f"   - expiring: {stats['expiring']}")
        print(f"   - critical: {stats['critical']}")
        print(f"   - inDate: {stats['inDate']}")
        print(f"   - totalValue: {stats['totalValue']}")
        print(f"   - belowReorder: {stats['belowReorder']}")
        print(f"   - expiryAlertDays: {stats['expiryAlertDays']}")
        
        return True, stats
        
    except Exception as e:
        print(f"❌ Test 2 FAILED with exception: {e}")
        return False, None

def test_products_with_auth(token):
    """Test 3: GET /api/products with auth should return array with _status enrichment"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/products with auth → should return array with _status")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/api/products", headers=headers, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Test 3 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False, None
        
        products = response.json()
        
        if not isinstance(products, list):
            print(f"❌ Test 3 FAILED: Expected array, got {type(products)}")
            return False, None
        
        print(f"Products count: {len(products)}")
        
        # Check that all products have _status field
        products_without_status = [p for p in products if '_status' not in p]
        if products_without_status:
            print(f"❌ Test 3 FAILED: {len(products_without_status)} products missing _status field")
            return False, None
        
        # Count products by status
        status_counts = {
            'Expired': 0,
            'Expiring': 0,
            'Critical': 0,
            'Ok': 0
        }
        
        for product in products:
            status = product.get('_status')
            if status in status_counts:
                status_counts[status] += 1
            else:
                print(f"⚠️  Warning: Unknown status '{status}' for product {product.get('name', 'unknown')}")
        
        print(f"✅ Test 3 PASSED: All products have _status field")
        print(f"   - Total products: {len(products)}")
        print(f"   - Expired: {status_counts['Expired']}")
        print(f"   - Expiring: {status_counts['Expiring']}")
        print(f"   - Critical: {status_counts['Critical']}")
        print(f"   - Ok: {status_counts['Ok']}")
        
        return True, (products, status_counts)
        
    except Exception as e:
        print(f"❌ Test 3 FAILED with exception: {e}")
        return False, None

def test_consistency(stats, products_data):
    """Test 4: Consistency check between stats and products"""
    print("\n" + "="*80)
    print("TEST 4: CONSISTENCY CHECK - stats vs products _status counts")
    print("="*80)
    
    products, status_counts = products_data
    
    # Check total
    print(f"\nChecking total count:")
    print(f"  stats.total: {stats['total']}")
    print(f"  products.length: {len(products)}")
    
    total_match = stats['total'] == len(products)
    if total_match:
        print(f"  ✅ MATCH: stats.total === products.length")
    else:
        print(f"  ⚠️  MISMATCH: stats.total ({stats['total']}) !== products.length ({len(products)})")
    
    # Check expired
    print(f"\nChecking expired count:")
    print(f"  stats.expired: {stats['expired']}")
    print(f"  products with _status==='Expired': {status_counts['Expired']}")
    
    expired_match = stats['expired'] == status_counts['Expired']
    if expired_match:
        print(f"  ✅ MATCH: stats.expired === count of Expired products")
    else:
        print(f"  ⚠️  MISMATCH: stats.expired ({stats['expired']}) !== Expired count ({status_counts['Expired']})")
        print(f"     NOTE: Server stats uses raw SQL with lt('expiry_date', todayISO)")
        print(f"           Client _status uses computeStatus with precedence Expired > Expiring > Critical")
    
    # Check expiring
    print(f"\nChecking expiring count:")
    print(f"  stats.expiring: {stats['expiring']}")
    print(f"  products with _status==='Expiring': {status_counts['Expiring']}")
    
    expiring_match = stats['expiring'] == status_counts['Expiring']
    if expiring_match:
        print(f"  ✅ MATCH: stats.expiring === count of Expiring products")
    else:
        print(f"  ⚠️  MISMATCH: stats.expiring ({stats['expiring']}) !== Expiring count ({status_counts['Expiring']})")
        print(f"     NOTE: Server stats uses raw SQL with gte/lte expiry_date window")
        print(f"           Client _status uses computeStatus with precedence Expired > Expiring > Critical")
    
    # Check critical
    print(f"\nChecking critical count:")
    print(f"  stats.critical: {stats['critical']}")
    print(f"  products with _status==='Critical': {status_counts['Critical']}")
    
    critical_match = stats['critical'] == status_counts['Critical']
    if critical_match:
        print(f"  ✅ MATCH: stats.critical === count of Critical products")
    else:
        print(f"  ⚠️  MISMATCH: stats.critical ({stats['critical']}) !== Critical count ({status_counts['Critical']})")
        print(f"     NOTE: Server stats uses raw SQL with quantity<=2 + expiry window")
        print(f"           Client _status uses computeStatus with precedence Expired > Expiring > Critical")
    
    # Summary
    print(f"\n" + "="*80)
    print("CONSISTENCY CHECK SUMMARY:")
    print("="*80)
    
    all_match = total_match and expired_match and expiring_match and critical_match
    
    if all_match:
        print(f"✅ Test 4 PASSED: ALL counts match perfectly")
        return True
    else:
        mismatches = []
        if not total_match:
            mismatches.append(f"total ({stats['total']} vs {len(products)})")
        if not expired_match:
            mismatches.append(f"expired ({stats['expired']} vs {status_counts['Expired']})")
        if not expiring_match:
            mismatches.append(f"expiring ({stats['expiring']} vs {status_counts['Expiring']})")
        if not critical_match:
            mismatches.append(f"critical ({stats['critical']} vs {status_counts['Critical']})")
        
        print(f"⚠️  Test 4 PARTIAL: Mismatches found in: {', '.join(mismatches)}")
        print(f"   This is expected if server SQL counts differ from client-side _status computation")
        print(f"   (e.g., precedence rules: Expired > Expiring > Critical)")
        return False

def main():
    print("="*80)
    print("READ-ONLY Backend Test: Dashboard Stats Endpoint (2x2 Stat Cards)")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Kitchen ID: a2573e6a-70f0-4a6d-97d0-ccf09b444643")
    print(f"Person: Xyz")
    print("="*80)
    
    # Mint JWT
    token = mint_chef_jwt()
    
    # Run tests
    results = []
    
    # Test 1: No auth
    results.append(test_stats_without_auth())
    
    # Test 2: Stats with auth
    test2_passed, stats = test_stats_with_auth(token)
    results.append(test2_passed)
    
    # Test 3: Products with auth
    test3_passed, products_data = test_products_with_auth(token)
    results.append(test3_passed)
    
    # Test 4: Consistency check (only if tests 2 and 3 passed)
    if test2_passed and test3_passed and stats and products_data:
        results.append(test_consistency(stats, products_data))
    else:
        print("\n⚠️  Skipping consistency check (prerequisite tests failed)")
        results.append(False)
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    passed = sum(results)
    total = len(results)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("✅ ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"⚠️  {total - passed} test(s) failed or had mismatches")
        sys.exit(1)

if __name__ == "__main__":
    main()
