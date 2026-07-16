#!/usr/bin/env python3
"""
FOCUSED TEST: GET /api/cron/push-alerts endpoint hardening
Review request: Test that the endpoint NEVER returns 500 — errors must appear inside a 200 JSON body.
"""

import requests
import json

BASE_URL = "http://localhost:3000"

def test_push_alerts_hardened():
    """
    Test the HARDENED GET /api/cron/push-alerts endpoint.
    Expected: HTTP 200 with ok:false in body (NOT 500) when Supabase fails.
    """
    print("\n" + "="*80)
    print("FOCUSED TEST: GET /api/cron/push-alerts Hardening")
    print("="*80)
    
    # Test Case 1: GET /api/cron/push-alerts → expect HTTP 200 with ok:false
    print("\n[Test 1] GET /api/cron/push-alerts → expect HTTP 200 (NOT 500), JSON body with ok:false")
    try:
        response = requests.get(f"{BASE_URL}/api/cron/push-alerts", timeout=30)
        print(f"  ✓ Status Code: {response.status_code}")
        
        # Check if it's 200 (NOT 500/404)
        if response.status_code == 200:
            print(f"  ✅ PASS: Got HTTP 200 (NOT 500)")
        elif response.status_code == 500:
            print(f"  ❌ FAIL: Got HTTP 500 (should be 200 with ok:false in body)")
        elif response.status_code == 404:
            print(f"  ❌ FAIL: Got HTTP 404 (endpoint not found)")
        else:
            print(f"  ⚠️  Unexpected status code: {response.status_code}")
        
        # Parse and display the exact body
        try:
            body = response.json()
            print(f"  ✓ Response Body (JSON):")
            print(f"    {json.dumps(body, indent=4)}")
            
            # Check for ok:false
            if "ok" in body:
                if body["ok"] is False:
                    print(f"  ✅ PASS: Body contains ok:false")
                else:
                    print(f"  ⚠️  Body contains ok:{body['ok']} (expected false)")
            else:
                print(f"  ⚠️  Body does NOT contain 'ok' field")
            
            # Check for error/note about Supabase failure
            if "error" in body or "note" in body or "message" in body:
                error_msg = body.get("error") or body.get("note") or body.get("message")
                print(f"  ✓ Error/Note present: {error_msg}")
            
            # Check for ReferenceError/TypeError in body
            body_str = json.dumps(body)
            if "ReferenceError" in body_str or "TypeError" in body_str:
                print(f"  ❌ FAIL: Found ReferenceError/TypeError in response body")
            else:
                print(f"  ✅ PASS: No ReferenceError/TypeError in response body")
                
        except json.JSONDecodeError:
            print(f"  ❌ FAIL: Response is NOT valid JSON")
            print(f"  Response Text: {response.text[:500]}")
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception occurred: {e}")
    
    # Test Case 2: Same call 3 times in a row → all 200
    print("\n[Test 2] GET /api/cron/push-alerts 3 times in a row → all should be HTTP 200")
    all_200 = True
    for i in range(1, 4):
        try:
            response = requests.get(f"{BASE_URL}/api/cron/push-alerts", timeout=30)
            print(f"  Call {i}: Status Code = {response.status_code}")
            if response.status_code != 200:
                all_200 = False
                print(f"    ❌ FAIL: Expected 200, got {response.status_code}")
            else:
                # Check for 5xx in body
                try:
                    body = response.json()
                    body_str = json.dumps(body)
                    if "ReferenceError" in body_str or "TypeError" in body_str:
                        print(f"    ❌ FAIL: Found ReferenceError/TypeError in response body")
                        all_200 = False
                except:
                    pass
        except Exception as e:
            print(f"  Call {i}: ❌ FAIL: Exception occurred: {e}")
            all_200 = False
    
    if all_200:
        print(f"  ✅ PASS: All 3 calls returned HTTP 200")
    else:
        print(f"  ❌ FAIL: Not all calls returned HTTP 200")
    
    # Test Case 3: GET /api/auth/me (no auth) → 401 (regression)
    print("\n[Test 3] GET /api/auth/me (no auth) → expect HTTP 401 (regression check)")
    try:
        response = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        print(f"  ✓ Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print(f"  ✅ PASS: Got HTTP 401 (expected)")
        else:
            print(f"  ❌ FAIL: Expected 401, got {response.status_code}")
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception occurred: {e}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)

if __name__ == "__main__":
    test_push_alerts_hardened()
