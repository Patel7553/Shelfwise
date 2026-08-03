#!/bin/bash
# Test the CHANGED product attribution behavior in ShelfWise

set -e  # Exit on error

BASE_URL="https://kitchen-stock-39.preview.emergentagent.com"
KITCHEN_ID="a2573e6a-70f0-4a6d-97d0-ccf09b444643"

echo "================================================================================"
echo "PRODUCT ATTRIBUTION CHANGE TEST"
echo "================================================================================"
echo "Base URL: $BASE_URL"
echo "Kitchen ID: $KITCHEN_ID"
echo "Test persons: Dev, Parth, Xyz"
echo ""

# Mint JWT for Dev
echo "Step 1: Create product as person 'Dev'"
echo "--------------------------------------------------------------------------------"
DEV_TOKEN=$(cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'$KITCHEN_ID',role:'chef',person:'Dev'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'1h'}))" 2>/dev/null | tail -1)
echo "✓ Minted JWT for Dev"

# Create product
RESPONSE=$(curl -s -X POST "$BASE_URL/api/products" \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"TEST-ATTRIBUTION-ITEM","quantity":3,"unit":"ea","category":"Test","storageType":"Fridge"}')

echo "Response: $RESPONSE"

# Extract product ID
PRODUCT_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$PRODUCT_ID" ]; then
    echo "❌ FAILED: Could not extract product ID from response"
    exit 1
fi
echo "✓ Product created with ID: $PRODUCT_ID"

# Verify addedBy is 'Dev'
ADDED_BY=$(echo "$RESPONSE" | grep -o '"addedBy":"[^"]*"' | cut -d'"' -f4)
if [ "$ADDED_BY" != "Dev" ]; then
    echo "❌ FAILED: Expected addedBy='Dev', got '$ADDED_BY'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ addedBy = '$ADDED_BY' (correct)"
echo ""

# Mint JWT for Parth
echo "Step 2: Edit product as person 'Parth'"
echo "--------------------------------------------------------------------------------"
PARTH_TOKEN=$(cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'$KITCHEN_ID',role:'chef',person:'Parth'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'1h'}))" 2>/dev/null | tail -1)
echo "✓ Minted JWT for Parth"

# Edit product
RESPONSE=$(curl -s -X PUT "$BASE_URL/api/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $PARTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"TEST-ATTRIBUTION-ITEM","quantity":5,"unit":"ea","category":"Test","storageType":"Fridge"}')

echo "Response: $RESPONSE"

# Verify addedBy is now 'Parth' (REPLACED)
ADDED_BY=$(echo "$RESPONSE" | grep -o '"addedBy":"[^"]*"' | cut -d'"' -f4)
if [ "$ADDED_BY" != "Parth" ]; then
    echo "❌ FAILED: Expected addedBy='Parth' (REPLACED), got '$ADDED_BY'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ addedBy = '$ADDED_BY' (REPLACED from 'Dev' to 'Parth')"

# Verify editedBy is empty
EDITED_BY=$(echo "$RESPONSE" | grep -o '"editedBy":"[^"]*"' | cut -d'"' -f4)
if [ "$EDITED_BY" != "" ]; then
    echo "❌ FAILED: Expected editedBy='', got '$EDITED_BY'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ editedBy = '' (correct)"

# Verify editedAt is set
EDITED_AT=$(echo "$RESPONSE" | grep -o '"editedAt":"[^"]*"' | cut -d'"' -f4)
if [ -z "$EDITED_AT" ] || [ "$EDITED_AT" = "null" ]; then
    echo "❌ FAILED: Expected editedAt to be set, got '$EDITED_AT'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ editedAt = '$EDITED_AT' (set)"

# Verify quantity changed
QUANTITY=$(echo "$RESPONSE" | grep -o '"quantity":[0-9]*' | cut -d':' -f2)
if [ "$QUANTITY" != "5" ]; then
    echo "❌ FAILED: Expected quantity=5, got $QUANTITY"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ quantity = $QUANTITY (updated)"
echo ""

# Mint JWT for Xyz (owner)
echo "Step 3: Edit product as person 'Xyz' (owner)"
echo "--------------------------------------------------------------------------------"
XYZ_TOKEN=$(cd /app && node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({kitchen_id:'$KITCHEN_ID',role:'chef',person:'Xyz'},process.env.SHELFWISE_JWT_SECRET,{expiresIn:'1h'}))" 2>/dev/null | tail -1)
echo "✓ Minted JWT for Xyz"

# Edit product again
RESPONSE=$(curl -s -X PUT "$BASE_URL/api/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $XYZ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"TEST-ATTRIBUTION-ITEM","quantity":7,"unit":"ea","category":"Test","storageType":"Fridge"}')

echo "Response: $RESPONSE"

# Verify addedBy changed from 'Parth' to owner's name
NEW_ADDED_BY=$(echo "$RESPONSE" | grep -o '"addedBy":"[^"]*"' | cut -d'"' -f4)
if [ "$NEW_ADDED_BY" = "Parth" ]; then
    echo "❌ FAILED: Expected addedBy to change from 'Parth', but it's still 'Parth'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ addedBy = '$NEW_ADDED_BY' (REPLACED from 'Parth' to owner's name)"

# Verify editedBy is still empty
EDITED_BY=$(echo "$RESPONSE" | grep -o '"editedBy":"[^"]*"' | cut -d'"' -f4)
if [ "$EDITED_BY" != "" ]; then
    echo "❌ FAILED: Expected editedBy='', got '$EDITED_BY'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ editedBy = '' (still empty)"

# Verify editedAt is updated
NEW_EDITED_AT=$(echo "$RESPONSE" | grep -o '"editedAt":"[^"]*"' | cut -d'"' -f4)
if [ -z "$NEW_EDITED_AT" ] || [ "$NEW_EDITED_AT" = "null" ]; then
    echo "❌ FAILED: Expected editedAt to be set, got '$NEW_EDITED_AT'"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ editedAt = '$NEW_EDITED_AT' (updated)"

# Verify quantity changed
QUANTITY=$(echo "$RESPONSE" | grep -o '"quantity":[0-9]*' | cut -d':' -f2)
if [ "$QUANTITY" != "7" ]; then
    echo "❌ FAILED: Expected quantity=7, got $QUANTITY"
    curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" -H "Authorization: Bearer $DEV_TOKEN" > /dev/null
    exit 1
fi
echo "✓ quantity = $QUANTITY (updated)"
echo ""

# Cleanup - DELETE product
echo "Step 4: Cleanup - DELETE product"
echo "--------------------------------------------------------------------------------"
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/api/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $DEV_TOKEN")
echo "Response: $DELETE_RESPONSE"

# Verify deletion by trying to GET the product
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/api/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $DEV_TOKEN")

if echo "$GET_RESPONSE" | grep -q "\"id\":\"$PRODUCT_ID\""; then
    echo "❌ FAILED: Product still exists after deletion"
    exit 1
fi
echo "✓ Product deleted successfully (verified by GET)"
echo ""

echo "================================================================================"
echo "✅ ALL TESTS PASSED"
echo "================================================================================"
echo ""
echo "Summary:"
echo "- ✓ Product created as 'Dev' → addedBy='Dev'"
echo "- ✓ Product edited as 'Parth' → addedBy='Parth' (REPLACED), editedBy='', editedAt set"
echo "- ✓ Product edited as 'Xyz' → addedBy changed to owner's name, editedBy='', editedAt updated"
echo "- ✓ Product deleted successfully (cleanup complete)"
echo ""
echo "ATTRIBUTION REPLACEMENT BEHAVIOR VERIFIED ✓"
