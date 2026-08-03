#!/usr/bin/env python3
"""
Backend test for POST /api/receipts/line-items endpoint
Tests the NEW receipt line-items extraction feature using gpt-4o vision
"""

import requests
import json
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
import os
import time

# Configuration
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://kitchen-stock-39.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Chef JWT for approved kitchen (a2573e6a-70f0-4a6d-97d0-ccf09b444643, person='Xyz')
CHEF_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraXRjaGVuX2lkIjoiYTI1NzNlNmEtNzBmMC00YTZkLTk3ZDAtY2NmMDliNDQ0NjQzIiwicm9sZSI6ImNoZWYiLCJwZXJzb24iOiJYeXoiLCJpYXQiOjE3ODU3NDkyNDIsImV4cCI6MTc4NTc5MjQ0Mn0.tumnedsi2oOPKtDGUMGKYfvi-0z2fjDiglECtg0hzL0"

HEADERS_WITH_AUTH = {
    "Authorization": f"Bearer {CHEF_JWT}",
    "Content-Type": "application/json"
}

HEADERS_NO_AUTH = {
    "Content-Type": "application/json"
}

# Track created product IDs for cleanup
created_product_ids = []

def generate_receipt_image():
    """Generate a synthetic receipt image with realistic wholesale receipt lines"""
    # Create white background image
    width, height = 600, 800
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a monospace font, fallback to default
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 16)
        font_bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 18)
    except:
        font = ImageFont.load_default()
        font_bold = ImageFont.load_default()
    
    # Draw receipt content
    y = 30
    line_height = 25
    
    # Header
    draw.text((width//2 - 100, y), "BIDFOOD WHOLESALE", fill='black', font=font_bold)
    y += line_height * 2
    
    draw.text((50, y), "Invoice #INV-2026-0142", fill='black', font=font)
    y += line_height
    draw.text((50, y), "Date: 02/02/2026", fill='black', font=font)
    y += line_height * 2
    
    # Separator
    draw.text((50, y), "-" * 50, fill='black', font=font)
    y += line_height * 1.5
    
    # Product lines (realistic wholesale items)
    lines = [
        "CHKN BRST FIL 5KG      £24.00",
        "2 x WHOLE MILK 2L       £3.70",
        "TOM CHPD 400G x6        £5.40",
        "BUTTER UNSLTD 1KG       £4.20",
        "EGGS LARGE 30PK         £6.50",
        "ONIONS 10KG             £8.90",
    ]
    
    for line in lines:
        draw.text((50, y), line, fill='black', font=font)
        y += line_height
    
    y += line_height
    draw.text((50, y), "-" * 50, fill='black', font=font)
    y += line_height * 1.5
    
    # Totals
    draw.text((50, y), "SUBTOTAL               £52.70", fill='black', font=font)
    y += line_height
    draw.text((50, y), "VAT 20%                £10.54", fill='black', font=font)
    y += line_height * 1.5
    draw.text((50, y), "TOTAL                  £63.24", fill='black', font=font_bold)
    y += line_height * 2
    
    draw.text((50, y), "Thank you for your order!", fill='black', font=font)
    
    # Convert to base64 JPEG dataUrl
    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')
    data_url = f"data:image/jpeg;base64,{img_base64}"
    
    return data_url

def test_1_no_auth():
    """Test 1: POST /api/receipts/line-items WITHOUT Authorization header → expect 401"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/receipts/line-items without auth → expect 401")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_URL}/receipts/line-items",
            headers=HEADERS_NO_AUTH,
            json={"dataUrl": "data:image/jpeg;base64,fake"},
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 401:
            print("✅ TEST 1 PASSED: Correctly returned 401 without auth")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        return False

def test_2_empty_body():
    """Test 2: POST with auth but empty JSON body {} → expect 400"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/receipts/line-items with auth + empty body → expect 400")
    print("="*80)
    
    try:
        response = requests.post(
            f"{API_URL}/receipts/line-items",
            headers=HEADERS_WITH_AUTH,
            json={},
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
        
        if response.status_code == 400:
            data = response.json()
            if 'dataUrl' in data.get('error', '').lower() or 'url' in data.get('error', '').lower():
                print("✅ TEST 2 PASSED: Correctly returned 400 with dataUrl/url error")
                return True
            else:
                print(f"❌ TEST 2 FAILED: Got 400 but wrong error message: {data.get('error')}")
                return False
        else:
            print(f"❌ TEST 2 FAILED: Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        return False

def test_3_valid_receipt_extraction():
    """Test 3: POST with valid synthetic receipt image → expect 200 with items array"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/receipts/line-items with valid receipt image → expect 200")
    print("="*80)
    
    try:
        # Generate synthetic receipt
        print("Generating synthetic receipt image...")
        data_url = generate_receipt_image()
        print(f"Generated dataUrl (length: {len(data_url)} chars)")
        
        # Make request with generous timeout (LLM can take 10-30s)
        print("Sending request to API (this may take 10-30 seconds for LLM processing)...")
        start_time = time.time()
        
        response = requests.post(
            f"{API_URL}/receipts/line-items",
            headers=HEADERS_WITH_AUTH,
            json={"dataUrl": data_url},
            timeout=60  # Generous timeout for LLM
        )
        
        elapsed = time.time() - start_time
        print(f"⏱️  Response time: {elapsed:.1f} seconds")
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Response: {response.text[:500]}")
            print(f"❌ TEST 3 FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Verify response structure
        if 'items' not in data:
            print(f"❌ TEST 3 FAILED: Response missing 'items' key")
            return False
        
        items = data['items']
        print(f"Items returned: {len(items)}")
        
        if not isinstance(items, list):
            print(f"❌ TEST 3 FAILED: 'items' is not an array")
            return False
        
        if len(items) == 0:
            print(f"❌ TEST 3 FAILED: 'items' array is empty")
            return False
        
        print(f"\n✅ Got {len(items)} items from receipt")
        
        # Verify each item structure
        valid_units = ['ea', 'kg', 'g', 'L', 'mL', 'bunch', 'pack', 'box']
        all_valid = True
        
        for i, item in enumerate(items):
            print(f"\nItem {i+1}:")
            print(f"  name: {item.get('name')} (type: {type(item.get('name')).__name__})")
            print(f"  quantity: {item.get('quantity')} (type: {type(item.get('quantity')).__name__})")
            print(f"  unit: {item.get('unit')} (type: {type(item.get('unit')).__name__})")
            print(f"  unitPrice: {item.get('unitPrice')} (type: {type(item.get('unitPrice')).__name__})")
            print(f"  lineTotal: {item.get('lineTotal')} (type: {type(item.get('lineTotal')).__name__})")
            print(f"  category: {item.get('category')} (type: {type(item.get('category')).__name__})")
            
            # Validate structure
            if not isinstance(item.get('name'), str) or not item.get('name'):
                print(f"  ❌ Invalid name")
                all_valid = False
            
            if not isinstance(item.get('quantity'), (int, float)) or item.get('quantity') <= 0:
                print(f"  ❌ Invalid quantity")
                all_valid = False
            
            if item.get('unit') not in valid_units:
                print(f"  ❌ Invalid unit (must be one of {valid_units})")
                all_valid = False
            
            if item.get('unitPrice') is not None and not isinstance(item.get('unitPrice'), (int, float)):
                print(f"  ❌ Invalid unitPrice type")
                all_valid = False
            
            if item.get('lineTotal') is not None and not isinstance(item.get('lineTotal'), (int, float)):
                print(f"  ❌ Invalid lineTotal type")
                all_valid = False
            
            if not isinstance(item.get('category'), str):
                print(f"  ❌ Invalid category")
                all_valid = False
            
            # Check for abbreviation expansion
            name_lower = item.get('name', '').lower()
            if 'chicken' in name_lower or 'breast' in name_lower:
                print(f"  ✅ Abbreviation expanded (CHKN BRST → Chicken Breast)")
            
            if 'tomato' in name_lower or 'chopped' in name_lower:
                print(f"  ✅ Abbreviation expanded (TOM CHPD → Tomato/Chopped)")
        
        # Check that SUBTOTAL/VAT/TOTAL are NOT in items
        subtotal_found = any('subtotal' in item.get('name', '').lower() for item in items)
        vat_found = any('vat' in item.get('name', '').lower() for item in items)
        total_found = any('total' in item.get('name', '').lower() and 'subtotal' not in item.get('name', '').lower() for item in items)
        
        if subtotal_found or vat_found or total_found:
            print(f"\n❌ TEST 3 FAILED: SUBTOTAL/VAT/TOTAL lines should NOT be in items")
            all_valid = False
        else:
            print(f"\n✅ SUBTOTAL/VAT/TOTAL lines correctly excluded")
        
        if all_valid:
            print(f"\n✅ TEST 3 PASSED: All items have valid structure")
            return True
        else:
            print(f"\n❌ TEST 3 FAILED: Some items have invalid structure")
            return False
            
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_4_downstream_bulk_add():
    """Test 4: Verify downstream flow - POST /api/products/bulk with extracted items"""
    print("\n" + "="*80)
    print("TEST 4: Downstream flow - POST /api/products/bulk with extracted items")
    print("="*80)
    
    try:
        # First extract items from receipt
        print("Step 1: Extract items from receipt...")
        data_url = generate_receipt_image()
        
        response = requests.post(
            f"{API_URL}/receipts/line-items",
            headers=HEADERS_WITH_AUTH,
            json={"dataUrl": data_url},
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"❌ TEST 4 FAILED: Could not extract items (status {response.status_code})")
            return False
        
        extracted_items = response.json()['items']
        print(f"✅ Extracted {len(extracted_items)} items")
        
        # Map to products/bulk format
        print("\nStep 2: Map items to products/bulk format...")
        bulk_items = []
        for item in extracted_items:
            bulk_item = {
                "name": item['name'],
                "quantity": item['quantity'],
                "unit": item['unit'],
                "category": item['category'],
                "supplier": "TEST-LINEITEMS",
                "source": "receipt"
            }
            # Add unitCost if unitPrice is available
            if item.get('unitPrice') is not None:
                bulk_item['unitCost'] = item['unitPrice']
            
            bulk_items.append(bulk_item)
            print(f"  - {bulk_item['name']} ({bulk_item['quantity']} {bulk_item['unit']})")
        
        # POST to products/bulk
        print(f"\nStep 3: POST {len(bulk_items)} items to /api/products/bulk...")
        response = requests.post(
            f"{API_URL}/products/bulk",
            headers=HEADERS_WITH_AUTH,
            json={"items": bulk_items},
            timeout=30
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code != 201:
            print(f"Response: {response.text[:500]}")
            print(f"❌ TEST 4 FAILED: Expected 201, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        if 'inserted' not in data or 'items' not in data:
            print(f"❌ TEST 4 FAILED: Response missing 'inserted' or 'items' key")
            return False
        
        inserted_count = data['inserted']
        returned_items = data['items']
        
        print(f"✅ Inserted {inserted_count} items")
        print(f"✅ Returned {len(returned_items)} items with IDs")
        
        # Store IDs for cleanup
        global created_product_ids
        for item in returned_items:
            if 'id' in item:
                created_product_ids.append(item['id'])
                print(f"  - {item['name']} (ID: {item['id']})")
        
        if inserted_count == len(bulk_items) and len(returned_items) == len(bulk_items):
            print(f"\n✅ TEST 4 PASSED: Successfully added {inserted_count} items to inventory")
            return True
        else:
            print(f"\n❌ TEST 4 FAILED: Count mismatch (expected {len(bulk_items)}, inserted {inserted_count}, returned {len(returned_items)})")
            return False
            
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_5_cleanup():
    """Test 5: CLEANUP - Delete all created products"""
    print("\n" + "="*80)
    print("TEST 5: CLEANUP - Delete all created products")
    print("="*80)
    
    global created_product_ids
    
    if not created_product_ids:
        print("No products to clean up")
        return True
    
    print(f"Deleting {len(created_product_ids)} products...")
    
    all_deleted = True
    for product_id in created_product_ids:
        try:
            response = requests.delete(
                f"{API_URL}/products/{product_id}",
                headers=HEADERS_WITH_AUTH,
                timeout=10
            )
            
            if response.status_code == 200:
                print(f"  ✅ Deleted product {product_id}")
            else:
                print(f"  ❌ Failed to delete product {product_id} (status {response.status_code})")
                all_deleted = False
        except Exception as e:
            print(f"  ❌ Failed to delete product {product_id}: {e}")
            all_deleted = False
    
    if all_deleted:
        print(f"\n✅ TEST 5 PASSED: All {len(created_product_ids)} products deleted successfully")
        created_product_ids = []
        return True
    else:
        print(f"\n❌ TEST 5 FAILED: Some products could not be deleted")
        return False

def main():
    print("\n" + "="*80)
    print("BACKEND TEST: POST /api/receipts/line-items")
    print("Testing NEW receipt line-items extraction endpoint")
    print("="*80)
    print(f"API URL: {API_URL}")
    print(f"Chef JWT: {CHEF_JWT[:50]}...")
    
    results = []
    
    # Run tests
    results.append(("Test 1: No auth → 401", test_1_no_auth()))
    results.append(("Test 2: Empty body → 400", test_2_empty_body()))
    results.append(("Test 3: Valid receipt extraction", test_3_valid_receipt_extraction()))
    results.append(("Test 4: Downstream bulk add", test_4_downstream_bulk_add()))
    results.append(("Test 5: Cleanup", test_5_cleanup()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
