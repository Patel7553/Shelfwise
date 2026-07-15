#!/usr/bin/env python3
"""
Test email-OTP endpoints for ShelfWise Next.js app.

CRITICAL LOCAL CONSTRAINT: Supabase env vars are NOT configured locally.
Any request that passes input validation and reaches a Supabase DB call
WILL return a 500 with a supabase/fetch-related error — that is EXPECTED
and counts as SUCCESS for wiring (do NOT report as a bug).

These are PUBLIC endpoints (no auth header needed):
- POST /api/auth/verify-otp
- POST /api/auth/resend-otp
- POST /api/auth/signup (regression — was modified to send OTP)
"""

import requests
import json

BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com"

def test_verify_otp():
    """Test POST /api/auth/verify-otp endpoint"""
    print("\n" + "="*80)
    print("TEST GROUP A: POST /api/auth/verify-otp")
    print("="*80)
    
    # Test 1: Empty body
    print("\n[Test A1] POST /api/auth/verify-otp with empty body {}")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 400 and "Email and 6-digit code required" in r.text:
            print("  ✅ PASS: Returns 400 with correct error message")
        else:
            print(f"  ❌ FAIL: Expected 400 with 'Email and 6-digit code required', got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 2: 5-digit code (invalid)
    print("\n[Test A2] POST /api/auth/verify-otp with 5-digit code")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", 
                         json={"email": "a@b.com", "code": "12345"}, 
                         timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 400:
            print("  ✅ PASS: Returns 400 (5-digit code rejected)")
        else:
            print(f"  ❌ FAIL: Expected 400, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 3: Non-numeric code
    print("\n[Test A3] POST /api/auth/verify-otp with non-numeric code 'abcdef'")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", 
                         json={"email": "a@b.com", "code": "abcdef"}, 
                         timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 400:
            print("  ✅ PASS: Returns 400 (non-numeric code rejected)")
        else:
            print(f"  ❌ FAIL: Expected 400, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 4: Valid format, should reach DB and get 500
    print("\n[Test A4] POST /api/auth/verify-otp with valid format (6-digit code)")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/verify-otp", 
                         json={"email": "a@b.com", "code": "123456"}, 
                         timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:500]}")
        
        # Check for unexpected errors (ReferenceError, TypeError, syntax errors)
        response_lower = r.text.lower()
        if "referenceerror" in response_lower or "typeerror" in response_lower:
            print(f"  ❌ FAIL: Unexpected JavaScript error (ReferenceError/TypeError)")
        elif r.status_code == 404:
            print(f"  ❌ FAIL: Got 404 - endpoint not found (routing issue)")
        elif r.status_code == 500:
            # 500 is EXPECTED when Supabase is not configured
            if "supabase" in response_lower or "fetch" in response_lower or "database" in response_lower:
                print("  ✅ PASS: Returns 500 with Supabase/DB error (EXPECTED - proves handler reached DB lookup)")
            else:
                print(f"  ⚠️  WARNING: Got 500 but error message doesn't mention Supabase/DB")
        else:
            print(f"  ℹ️  INFO: Got status {r.status_code} (not 500, but validation passed)")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")


def test_resend_otp():
    """Test POST /api/auth/resend-otp endpoint"""
    print("\n" + "="*80)
    print("TEST GROUP B: POST /api/auth/resend-otp")
    print("="*80)
    
    # Test 5: Empty body
    print("\n[Test B5] POST /api/auth/resend-otp with empty body {}")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/resend-otp", json={}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 400 and "Email required" in r.text:
            print("  ✅ PASS: Returns 400 with 'Email required'")
        else:
            print(f"  ❌ FAIL: Expected 400 with 'Email required', got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 6: Valid email, should reach DB and get 500
    print("\n[Test B6] POST /api/auth/resend-otp with valid email")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/resend-otp", 
                         json={"email": "a@b.com"}, 
                         timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:500]}")
        
        # Check for unexpected errors
        response_lower = r.text.lower()
        if "referenceerror" in response_lower or "typeerror" in response_lower:
            print(f"  ❌ FAIL: Unexpected JavaScript error (ReferenceError/TypeError)")
        elif r.status_code == 404:
            print(f"  ❌ FAIL: Got 404 - endpoint not found (routing issue)")
        elif r.status_code == 500:
            # 500 is EXPECTED when Supabase is not configured
            if "supabase" in response_lower or "fetch" in response_lower or "database" in response_lower:
                print("  ✅ PASS: Returns 500 with Supabase/DB error (EXPECTED - proves handler reached DB lookup)")
            else:
                print(f"  ⚠️  WARNING: Got 500 but error message doesn't mention Supabase/DB")
        else:
            print(f"  ℹ️  INFO: Got status {r.status_code} (not 500, but validation passed)")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")


def test_signup_regression():
    """Test POST /api/auth/signup (regression - was modified to send OTP)"""
    print("\n" + "="*80)
    print("TEST GROUP C: POST /api/auth/signup (REGRESSION)")
    print("="*80)
    
    # Test 7: Empty body - should get validation error, NOT crash about "otpSent"
    print("\n[Test C7] POST /api/auth/signup with empty body {}")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:500]}")
        
        response_lower = r.text.lower()
        
        # Check for crashes (ReferenceError/TypeError about otpSent or sendVerificationOtp)
        if "referenceerror" in response_lower or "typeerror" in response_lower:
            if "otpsent" in response_lower or "sendverificationotp" in response_lower:
                print(f"  ❌ FAIL: Crash about otpSent/sendVerificationOtp (handler not properly handling missing fields)")
            else:
                print(f"  ❌ FAIL: Unexpected JavaScript error (ReferenceError/TypeError)")
        elif r.status_code >= 400 and r.status_code < 500:
            # 400-level validation error is expected
            print(f"  ✅ PASS: Returns {r.status_code} validation error (NOT a crash)")
        elif r.status_code == 500:
            # Check if it's a Supabase error (after validation) or a crash
            if "supabase" in response_lower or "fetch" in response_lower:
                print(f"  ✅ PASS: Returns 500 with Supabase error (validation passed, reached DB)")
            else:
                print(f"  ⚠️  WARNING: Got 500 but error doesn't mention Supabase (might be a crash)")
        else:
            print(f"  ℹ️  INFO: Got status {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 7b: Missing password
    print("\n[Test C7b] POST /api/auth/signup with missing password")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/signup", 
                         json={"email": "test@example.com"}, 
                         timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:500]}")
        
        response_lower = r.text.lower()
        
        if "referenceerror" in response_lower or "typeerror" in response_lower:
            print(f"  ❌ FAIL: Unexpected JavaScript error (ReferenceError/TypeError)")
        elif r.status_code >= 400 and r.status_code < 500:
            print(f"  ✅ PASS: Returns {r.status_code} validation error")
        else:
            print(f"  ℹ️  INFO: Got status {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")


def test_routing_sanity():
    """Test routing sanity - ensure no regressions in other endpoints"""
    print("\n" + "="*80)
    print("TEST GROUP D: ROUTING SANITY (No Regressions)")
    print("="*80)
    
    # Test 8: POST /api/shelves with no auth should still return 401
    print("\n[Test D8] POST /api/shelves with no auth → should be 401")
    try:
        r = requests.post(f"{BASE_URL}/api/shelves", json={}, timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            print("  ✅ PASS: Returns 401 (no regression)")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
    
    # Test 9: GET /api/auth/me with no auth should still return 401
    print("\n[Test D9] GET /api/auth/me with no auth → should be 401")
    try:
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        print(f"  Status: {r.status_code}")
        print(f"  Response: {r.text[:200]}")
        if r.status_code == 401:
            print("  ✅ PASS: Returns 401 (no regression)")
        else:
            print(f"  ❌ FAIL: Expected 401, got {r.status_code}")
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")


def main():
    print("="*80)
    print("EMAIL-OTP ENDPOINTS TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("\nCRITICAL: Supabase env vars are NOT configured locally.")
    print("500 errors with Supabase/DB messages are EXPECTED and count as SUCCESS.")
    print("Only report: ReferenceError, TypeError, syntax errors, or 404s on new routes.")
    print("="*80)
    
    test_verify_otp()
    test_resend_otp()
    test_signup_regression()
    test_routing_sanity()
    
    print("\n" + "="*80)
    print("TEST SUITE COMPLETE")
    print("="*80)
    print("\nSUMMARY:")
    print("- All validation tests should return 400 with appropriate error messages")
    print("- All DB-reaching tests should return 500 with Supabase/DB errors (EXPECTED)")
    print("- No ReferenceError/TypeError/syntax errors should be present")
    print("- No 404s on the new email-OTP routes")
    print("- Existing endpoints (shelves, auth/me) should still return 401 without auth")


if __name__ == "__main__":
    main()
