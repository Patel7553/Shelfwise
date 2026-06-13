#!/usr/bin/env python3
"""
Comprehensive backend test suite for ShelfWise API
Tests all endpoints with real-looking data
"""
import requests
import json
import base64
from datetime import datetime, timedelta
import sys

# Base URL from environment
BASE_URL = "https://kitchen-stock-39.preview.emergentagent.com/api"

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  Details: {details}")
    return passed

def test_health():
    """Test health endpoint"""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        passed = resp.status_code == 200 and resp.json().get('ok') == True
        return log_test("Health check", passed, f"Status: {resp.status_code}")
    except Exception as e:
        return log_test("Health check", False, str(e))

def test_seed():
    """Test seed endpoint - loads 8 sample products"""
    try:
        resp = requests.post(f"{BASE_URL}/seed", json={}, timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and data.get('inserted') == 8
        return log_test("Seed sample data", passed, f"Inserted: {data.get('inserted')}")
    except Exception as e:
        return log_test("Seed sample data", False, str(e))

def test_get_products():
    """Test GET /api/products - should return all products with _status"""
    try:
        resp = requests.get(f"{BASE_URL}/products", timeout=10)
        data = resp.json()
        passed = resp.status_code == 200 and isinstance(data, list) and len(data) == 8
        # Check that all products have _status field
        all_have_status = all('_status' in p for p in data)
        passed = passed and all_have_status
        # Check that all products have id (UUID, not ObjectId)
        all_have_uuid = all('id' in p and isinstance(p['id'], str) and len(p['id']) == 36 for p in data)
        passed = passed and all_have_uuid
        return log_test("GET /api/products (all)", passed, f"Count: {len(data)}, All have _status: {all_have_status}, All have UUID: {all_have_uuid}")
    except Exception as e:
        return log_test("GET /api/products (all)", False, str(e))

def test_filter_by_status():
    """Test filtering by status"""
    results = []
    for status in ['Expired', 'Expiring', 'Critical', 'Ok']:
        try:
            resp = requests.get(f"{BASE_URL}/products?status={status}", timeout=10)
            data = resp.json()
            # All returned items should have the requested status
            all_match = all(p.get('_status') == status for p in data)
            passed = resp.status_code == 200 and all_match
            results.append(log_test(f"Filter by status={status}", passed, f"Count: {len(data)}, All match: {all_match}"))
        except Exception as e:
            results.append(log_test(f"Filter by status={status}", False, str(e)))
    return all(results)

def test_filter_by_category():
    """Test filtering by category"""
    try:
        # First get all products to find a category
        resp = requests.get(f"{BASE_URL}/products", timeout=10)
        products = resp.json()
        if not products:
            return log_test("Filter by category", False, "No products to test")
        
        # Test with Dairy category (from seed data)
        resp = requests.get(f"{BASE_URL}/products?category=Dairy", timeout=10)
        data = resp.json()
        all_match = all(p.get('category') == 'Dairy' for p in data)
        passed = resp.status_code == 200 and all_match and len(data) > 0
        return log_test("Filter by category=Dairy", passed, f"Count: {len(data)}, All match: {all_match}")
    except Exception as e:
        return log_test("Filter by category", False, str(e))

def test_filter_by_storage():
    """Test filtering by storage type"""
    try:
        resp = requests.get(f"{BASE_URL}/products?storage=Fridge", timeout=10)
        data = resp.json()
        all_match = all(p.get('storageType') == 'Fridge' for p in data)
        passed = resp.status_code == 200 and all_match and len(data) > 0
        return log_test("Filter by storage=Fridge", passed, f"Count: {len(data)}, All match: {all_match}")
    except Exception as e:
        return log_test("Filter by storage", False, str(e))

def test_search():
    """Test search by name (case-insensitive substring)"""
    try:
        resp = requests.get(f"{BASE_URL}/products?search=milk", timeout=10)
        data = resp.json()
        # Should find "Whole Milk" from seed data
        all_match = all('milk' in p.get('name', '').lower() for p in data)
        passed = resp.status_code == 200 and all_match and len(data) > 0
        return log_test("Search by name (milk)", passed, f"Count: {len(data)}, All match: {all_match}")
    except Exception as e:
        return log_test("Search by name", False, str(e))

def test_sort():
    """Test sorting by expiryDate"""
    results = []
    for sort_order in ['asc', 'desc']:
        try:
            resp = requests.get(f"{BASE_URL}/products?sort={sort_order}", timeout=10)
            data = resp.json()
            # Check if sorted correctly
            dates = [p.get('expiryDate') for p in data if p.get('expiryDate')]
            is_sorted = dates == sorted(dates) if sort_order == 'asc' else dates == sorted(dates, reverse=True)
            passed = resp.status_code == 200 and is_sorted
            results.append(log_test(f"Sort by expiryDate {sort_order}", passed, f"Count: {len(data)}, Sorted: {is_sorted}"))
        except Exception as e:
            results.append(log_test(f"Sort by expiryDate {sort_order}", False, str(e)))
    return all(results)

def test_stats():
    """Test GET /api/stats - counts must match products"""
    try:
        # Get all products
        resp_products = requests.get(f"{BASE_URL}/products", timeout=10)
        products = resp_products.json()
        
        # Get stats
        resp_stats = requests.get(f"{BASE_URL}/stats", timeout=10)
        stats = resp_stats.json()
        
        # Count manually
        expected_total = len(products)
        expected_expired = len([p for p in products if p.get('_status') == 'Expired'])
        expected_expiring = len([p for p in products if p.get('_status') == 'Expiring'])
        expected_critical = len([p for p in products if p.get('_status') == 'Critical'])
        
        passed = (
            resp_stats.status_code == 200 and
            stats.get('total') == expected_total and
            stats.get('expired') == expected_expired and
            stats.get('expiring') == expected_expiring and
            stats.get('critical') == expected_critical
        )
        
        details = f"Total: {stats.get('total')}/{expected_total}, Expired: {stats.get('expired')}/{expected_expired}, Expiring: {stats.get('expiring')}/{expected_expiring}, Critical: {stats.get('critical')}/{expected_critical}"
        return log_test("GET /api/stats", passed, details)
    except Exception as e:
        return log_test("GET /api/stats", False, str(e))

def test_facets():
    """Test GET /api/facets - distinct categories and storages"""
    try:
        resp = requests.get(f"{BASE_URL}/facets", timeout=10)
        data = resp.json()
        
        categories = data.get('categories', [])
        storages = data.get('storages', [])
        
        # Check that they are sorted
        categories_sorted = categories == sorted(categories)
        storages_sorted = storages == sorted(storages)
        
        passed = (
            resp.status_code == 200 and
            isinstance(categories, list) and
            isinstance(storages, list) and
            len(categories) > 0 and
            len(storages) > 0 and
            categories_sorted and
            storages_sorted
        )
        
        details = f"Categories: {len(categories)} (sorted: {categories_sorted}), Storages: {len(storages)} (sorted: {storages_sorted})"
        return log_test("GET /api/facets", passed, details)
    except Exception as e:
        return log_test("GET /api/facets", False, str(e))

def test_create_product():
    """Test POST /api/products with custom fields"""
    try:
        # Create a product with custom fields
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        product = {
            "name": "Organic Tomatoes",
            "quantity": 5,
            "unit": "kg",
            "expiryDate": tomorrow,
            "category": "Produce",
            "storageType": "Fridge",
            "location": "Shelf C1",
            "preparedBy": "Chef Maria",
            "imageUrl": "",
            "customFields": {
                "supplier": "Fresh Farms Co",
                "batch_number": "TOM-2024-001"
            }
        }
        
        resp = requests.post(f"{BASE_URL}/products", json=product, timeout=10)
        data = resp.json()
        
        # Check response
        passed = (
            resp.status_code == 201 and
            data.get('name') == product['name'] and
            data.get('quantity') == product['quantity'] and
            'id' in data and
            '_status' in data and
            'customFields' in data and
            data['customFields'].get('supplier') == 'Fresh Farms Co'
        )
        
        # Store ID for later tests
        global created_product_id
        created_product_id = data.get('id')
        
        details = f"Created product ID: {created_product_id}, Status: {data.get('_status')}, Custom fields preserved: {data.get('customFields')}"
        return log_test("POST /api/products (with custom fields)", passed, details)
    except Exception as e:
        return log_test("POST /api/products", False, str(e))

def test_update_product():
    """Test PUT /api/products/:id"""
    try:
        if not created_product_id:
            return log_test("PUT /api/products/:id", False, "No product ID from create test")
        
        # Update the product
        update = {
            "name": "Organic Cherry Tomatoes",
            "quantity": 3,
            "unit": "kg",
            "expiryDate": (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d'),
            "category": "Produce",
            "storageType": "Fridge",
            "location": "Shelf C2",
            "preparedBy": "Chef Maria",
            "imageUrl": "",
            "customFields": {
                "supplier": "Fresh Farms Co",
                "batch_number": "TOM-2024-002",
                "organic_certified": "yes"
            }
        }
        
        resp = requests.put(f"{BASE_URL}/products/{created_product_id}", json=update, timeout=10)
        data = resp.json()
        
        passed = (
            resp.status_code == 200 and
            data.get('name') == update['name'] and
            data.get('quantity') == update['quantity'] and
            data.get('id') == created_product_id and
            data['customFields'].get('organic_certified') == 'yes'
        )
        
        details = f"Updated product: {data.get('name')}, Quantity: {data.get('quantity')}, Custom fields: {data.get('customFields')}"
        return log_test("PUT /api/products/:id", passed, details)
    except Exception as e:
        return log_test("PUT /api/products/:id", False, str(e))

def test_bulk_create():
    """Test POST /api/products/bulk"""
    try:
        items = [
            {
                "name": "Fresh Mozzarella",
                "quantity": 2,
                "unit": "kg",
                "expiryDate": (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d'),
                "category": "Dairy",
                "storageType": "Fridge",
                "location": "Shelf A4",
                "preparedBy": "Chef Anna"
            },
            {
                "name": "Parmesan Cheese",
                "quantity": 1,
                "unit": "kg",
                "expiryDate": (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
                "category": "Dairy",
                "storageType": "Fridge",
                "location": "Shelf A5",
                "preparedBy": "Chef Anna"
            }
        ]
        
        resp = requests.post(f"{BASE_URL}/products/bulk", json={"items": items}, timeout=10)
        data = resp.json()
        
        passed = (
            resp.status_code == 201 and
            data.get('inserted') == 2 and
            isinstance(data.get('items'), list) and
            len(data['items']) == 2 and
            all('_status' in item for item in data['items'])
        )
        
        details = f"Inserted: {data.get('inserted')}, Items returned: {len(data.get('items', []))}"
        return log_test("POST /api/products/bulk", passed, details)
    except Exception as e:
        return log_test("POST /api/products/bulk", False, str(e))

def test_delete_product():
    """Test DELETE /api/products/:id"""
    try:
        if not created_product_id:
            return log_test("DELETE /api/products/:id", False, "No product ID from create test")
        
        resp = requests.delete(f"{BASE_URL}/products/{created_product_id}", timeout=10)
        data = resp.json()
        
        # Verify deletion
        verify_resp = requests.get(f"{BASE_URL}/products", timeout=10)
        products = verify_resp.json()
        deleted = not any(p.get('id') == created_product_id for p in products)
        
        passed = resp.status_code == 200 and data.get('ok') == True and deleted
        
        details = f"Response: {data}, Verified deletion: {deleted}"
        return log_test("DELETE /api/products/:id", passed, details)
    except Exception as e:
        return log_test("DELETE /api/products/:id", False, str(e))

def test_settings_get():
    """Test GET /api/settings - should return defaults initially"""
    try:
        resp = requests.get(f"{BASE_URL}/settings", timeout=10)
        data = resp.json()
        
        passed = (
            resp.status_code == 200 and
            'id' in data and
            'onboarded' in data and
            'kitchenName' in data and
            'kitchenType' in data and
            'customFields' in data
        )
        
        # Store initial state
        global initial_onboarded
        initial_onboarded = data.get('onboarded')
        
        details = f"Onboarded: {data.get('onboarded')}, Kitchen: {data.get('kitchenName')}"
        return log_test("GET /api/settings", passed, details)
    except Exception as e:
        return log_test("GET /api/settings", False, str(e))

def test_settings_put():
    """Test PUT /api/settings with custom fields"""
    try:
        settings = {
            "kitchenName": "The Golden Spoon Restaurant",
            "kitchenType": "restaurant",
            "onboarded": True,
            "customFields": [
                {"key": "supplier", "label": "Supplier Name", "type": "text"},
                {"key": "batch_number", "label": "Batch Number", "type": "text"},
                {"key": "cost_per_unit", "label": "Cost per Unit", "type": "number"},
                {"key": "received_date", "label": "Received Date", "type": "date"}
            ]
        }
        
        resp = requests.put(f"{BASE_URL}/settings", json=settings, timeout=10)
        data = resp.json()
        
        # Verify the response
        passed = (
            resp.status_code == 200 and
            data.get('kitchenName') == settings['kitchenName'] and
            data.get('kitchenType') == settings['kitchenType'] and
            data.get('onboarded') == True and
            len(data.get('customFields', [])) == 4
        )
        
        # Verify persistence by getting again
        verify_resp = requests.get(f"{BASE_URL}/settings", timeout=10)
        verify_data = verify_resp.json()
        persisted = (
            verify_data.get('kitchenName') == settings['kitchenName'] and
            verify_data.get('onboarded') == True
        )
        
        passed = passed and persisted
        
        details = f"Kitchen: {data.get('kitchenName')}, Onboarded: {data.get('onboarded')}, Custom fields: {len(data.get('customFields', []))}, Persisted: {persisted}"
        return log_test("PUT /api/settings", passed, details)
    except Exception as e:
        return log_test("PUT /api/settings", False, str(e))

def test_scan_invalid_payload():
    """Test POST /api/scan with invalid payload - should return 400"""
    try:
        # Test 1: Missing image
        resp1 = requests.post(f"{BASE_URL}/scan", json={}, timeout=10)
        test1_passed = resp1.status_code == 400
        
        # Test 2: Invalid image (not a data URL)
        resp2 = requests.post(f"{BASE_URL}/scan", json={"image": "not-a-data-url"}, timeout=10)
        test2_passed = resp2.status_code == 400
        
        passed = test1_passed and test2_passed
        details = f"Missing image: {resp1.status_code}, Invalid format: {resp2.status_code}"
        return log_test("POST /api/scan (invalid payloads)", passed, details)
    except Exception as e:
        return log_test("POST /api/scan (invalid)", False, str(e))

def test_scan_valid():
    """Test POST /api/scan with valid data URL"""
    try:
        # Create a minimal valid data URL (1x1 white PNG)
        # This is a real base64-encoded 1x1 white PNG image
        tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        data_url = f"data:image/png;base64,{tiny_png}"
        
        resp = requests.post(f"{BASE_URL}/scan", json={"image": data_url}, timeout=30)
        data = resp.json()
        
        # Should return 200 with items array (may be empty for a blank image)
        passed = resp.status_code == 200 and 'items' in data and isinstance(data['items'], list)
        
        details = f"Status: {resp.status_code}, Items returned: {len(data.get('items', []))}"
        return log_test("POST /api/scan (valid data URL)", passed, details)
    except Exception as e:
        return log_test("POST /api/scan (valid)", False, str(e))

def test_recipe_invalid():
    """Test POST /api/recipe with invalid payload - should return 400"""
    try:
        # Test: Neither image nor text
        resp = requests.post(f"{BASE_URL}/recipe", json={}, timeout=10)
        passed = resp.status_code == 400
        
        details = f"Status: {resp.status_code}"
        return log_test("POST /api/recipe (invalid - no image/text)", passed, details)
    except Exception as e:
        return log_test("POST /api/recipe (invalid)", False, str(e))

def test_recipe_with_text():
    """Test POST /api/recipe with text"""
    try:
        recipe_text = """
        Spaghetti Carbonara
        Serves 4
        
        Ingredients:
        - 400g spaghetti
        - 200g bacon
        - 4 eggs
        - 100g parmesan cheese
        - 2 cloves garlic
        - Salt and pepper to taste
        
        Instructions:
        1. Cook spaghetti according to package directions
        2. Fry bacon until crispy
        3. Beat eggs with parmesan
        4. Toss hot pasta with bacon and egg mixture
        5. Season with salt and pepper
        """
        
        resp = requests.post(f"{BASE_URL}/recipe", json={"text": recipe_text}, timeout=30)
        data = resp.json()
        
        # Should return 200 with recipe structure
        passed = (
            resp.status_code == 200 and
            'title' in data and
            'ingredients' in data and
            'allergens' in data and
            'matched' in data and
            'summary' in data and
            isinstance(data['ingredients'], list) and
            isinstance(data['allergens'], list) and
            isinstance(data['matched'], list) and
            'inStock' in data['summary'] and
            'low' in data['summary'] and
            'expired' in data['summary'] and
            'missing' in data['summary']
        )
        
        details = f"Title: {data.get('title')}, Ingredients: {len(data.get('ingredients', []))}, Allergens: {len(data.get('allergens', []))}, Matched: {len(data.get('matched', []))}"
        return log_test("POST /api/recipe (with text)", passed, details)
    except Exception as e:
        return log_test("POST /api/recipe (text)", False, str(e))

def test_recipe_with_image():
    """Test POST /api/recipe with image"""
    try:
        # Use the same minimal PNG as scan test
        tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        data_url = f"data:image/png;base64,{tiny_png}"
        
        resp = requests.post(f"{BASE_URL}/recipe", json={"image": data_url}, timeout=30)
        data = resp.json()
        
        # Should return 200 with recipe structure (may have empty/null fields for blank image)
        passed = (
            resp.status_code == 200 and
            'title' in data and
            'ingredients' in data and
            'allergens' in data and
            'matched' in data and
            'summary' in data
        )
        
        details = f"Status: {resp.status_code}, Has required fields: {passed}"
        return log_test("POST /api/recipe (with image)", passed, details)
    except Exception as e:
        return log_test("POST /api/recipe (image)", False, str(e))

def test_no_objectid_leakage():
    """Verify no MongoDB ObjectId leakage in responses"""
    try:
        # Get products
        resp = requests.get(f"{BASE_URL}/products", timeout=10)
        products = resp.json()
        
        # Check that no product has _id field (MongoDB ObjectId)
        no_objectid = all('_id' not in p for p in products)
        
        # Check that all have 'id' field with UUID format
        all_have_uuid = all('id' in p and isinstance(p['id'], str) and len(p['id']) == 36 for p in products)
        
        passed = no_objectid and all_have_uuid
        
        details = f"No _id field: {no_objectid}, All have UUID: {all_have_uuid}"
        return log_test("No MongoDB ObjectId leakage", passed, details)
    except Exception as e:
        return log_test("No ObjectId leakage", False, str(e))

# Global variable to store created product ID
created_product_id = None
initial_onboarded = None

def main():
    """Run all tests"""
    print("=" * 80)
    print("ShelfWise Backend Test Suite")
    print("=" * 80)
    print(f"Base URL: {BASE_URL}")
    print("=" * 80)
    
    results = []
    
    # Test in order suggested by main agent
    print("\n### PHASE 1: Setup & Basic CRUD ###")
    results.append(test_health())
    results.append(test_seed())
    results.append(test_get_products())
    
    print("\n### PHASE 2: Filtering & Search ###")
    results.append(test_filter_by_status())
    results.append(test_filter_by_category())
    results.append(test_filter_by_storage())
    results.append(test_search())
    results.append(test_sort())
    
    print("\n### PHASE 3: Stats & Facets ###")
    results.append(test_stats())
    results.append(test_facets())
    
    print("\n### PHASE 4: Product CRUD Operations ###")
    results.append(test_create_product())
    results.append(test_update_product())
    results.append(test_bulk_create())
    results.append(test_delete_product())
    
    print("\n### PHASE 5: Settings & Custom Fields ###")
    results.append(test_settings_get())
    results.append(test_settings_put())
    
    print("\n### PHASE 6: AI Endpoints ###")
    results.append(test_scan_invalid_payload())
    results.append(test_scan_valid())
    results.append(test_recipe_invalid())
    results.append(test_recipe_with_text())
    results.append(test_recipe_with_image())
    
    print("\n### PHASE 7: Data Integrity ###")
    results.append(test_no_objectid_leakage())
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {total - passed}/{total}")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
