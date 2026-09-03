// ============================================================================
// SEED SCRIPT — Coffee kitchen demo data (Sept 2026, user request)
// Populates ONLY existing accounts (Coffee kitchen + PATEL FOOD supplier):
//   1. PATEL FOOD supplier catalogue (~120 coffee-shop items)  → supplier_products
//   2. Coffee working inventory (~52 items, subset of catalogue) → products
//   3. Coffee staff (6 people incl. 2 baristas)                → kitchens.staff_names
//   4. Rota config (templates + people profiles)               → rota_shifts (config row)
//   5. Rota shifts for 4 weeks (Mon 2026-08-31 → Sun 2026-09-27) → rota_shifts
//   6. Waste log entries (4)                                    → waste_log
//   7. Activity log entries (~14, audit trail demo)             → activity_logs
// GUARDS: refuses to touch any table that already has Coffee/PATEL FOOD rows.
// Creates NO new kitchens, suppliers, accounts or connections.
// ============================================================================
import 'dotenv/config'
import { randomUUID as uuid } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const KID = '78789af5-7416-4399-9a59-97762c6a76da'   // Coffee kitchen (existing)
const SID = '995016c0-249b-48e7-aa24-51de2ecde382'   // PATEL FOOD supplier (existing)

const get = async (path) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { ...H, Prefer: 'count=exact' } })
  const range = r.headers.get('content-range') || '*/0'
  return { count: Number(range.split('/')[1] || 0), data: await r.json().catch(() => []) }
}
const insert = async (table, rows) => {
  // chunk inserts to stay well under payload limits
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(chunk) })
    if (!r.ok) throw new Error(`${table} insert failed (${r.status}): ${(await r.text()).slice(0, 300)}`)
  }
  console.log(`  ✔ ${table}: inserted ${rows.length} rows`)
}
const patchKitchen = async (body) => {
  const r = await fetch(`${URL}/rest/v1/kitchens?id=eq.${KID}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`kitchens patch failed: ${(await r.text()).slice(0, 300)}`)
}

// ---------------------------------------------------------------------------
// 1. SUPPLIER CATALOGUE — ~120 realistic coffee-shop supply items
//    [name, category, unit, pack_size, price£]
// ---------------------------------------------------------------------------
const CAT = [
  // Coffee & Beans (COF)
  ['House Espresso Blend Beans', 'Coffee & Beans', 'kg', '6x1kg case', 14.50],
  ['Single Origin Colombia Beans', 'Coffee & Beans', 'kg', '6x1kg case', 17.80],
  ['Single Origin Ethiopia Yirgacheffe', 'Coffee & Beans', 'kg', '6x1kg case', 19.20],
  ['Decaf Espresso Beans (Swiss Water)', 'Coffee & Beans', 'kg', '6x1kg case', 16.90],
  ['Dark Roast Espresso Beans', 'Coffee & Beans', 'kg', '6x1kg case', 13.80],
  ['Filter Roast Ground Coffee', 'Coffee & Beans', 'kg', '10x500g', 12.40],
  ['Cold Brew Concentrate', 'Coffee & Beans', 'litre', '4x2L', 9.60],
  ['Instant Coffee Sticks', 'Coffee & Beans', 'box', '200 sticks', 8.20],
  ['Espresso Martini Coffee Liqueur Base', 'Coffee & Beans', 'bottle', '70cl', 11.50],
  // Tea & Infusions (TEA)
  ['English Breakfast Tea Bags', 'Tea & Infusions', 'box', '440 bags', 12.80],
  ['Earl Grey Tea Bags', 'Tea & Infusions', 'box', '250 bags', 9.40],
  ['Green Tea Sencha Bags', 'Tea & Infusions', 'box', '250 bags', 10.20],
  ['Peppermint Tea Bags', 'Tea & Infusions', 'box', '250 bags', 8.90],
  ['Chamomile Tea Bags', 'Tea & Infusions', 'box', '250 bags', 8.90],
  ['Chai Latte Powder', 'Tea & Infusions', 'tub', '2kg tub', 14.60],
  ['Matcha Powder (Ceremonial)', 'Tea & Infusions', 'tub', '500g tub', 22.00],
  ['Loose Leaf Assam', 'Tea & Infusions', 'kg', '1kg pouch', 15.30],
  // Dairy & Alternatives (DAI)
  ['Whole Milk', 'Dairy & Alternatives', 'litre', '12x1L case', 1.15],
  ['Semi-Skimmed Milk', 'Dairy & Alternatives', 'litre', '12x1L case', 1.10],
  ['Barista Oat Milk', 'Dairy & Alternatives', 'litre', '12x1L case', 1.85],
  ['Barista Almond Milk', 'Dairy & Alternatives', 'litre', '12x1L case', 1.95],
  ['Barista Soy Milk', 'Dairy & Alternatives', 'litre', '12x1L case', 1.70],
  ['Coconut Milk Drink', 'Dairy & Alternatives', 'litre', '12x1L case', 1.90],
  ['Double Cream', 'Dairy & Alternatives', 'litre', '2L bottle', 3.80],
  ['Whipping Cream Canister', 'Dairy & Alternatives', 'can', '12x500ml', 3.20],
  ['Salted Butter', 'Dairy & Alternatives', 'kg', '10x250g', 6.20],
  ['Unsalted Butter Sheets (Pastry)', 'Dairy & Alternatives', 'kg', '10x1kg', 7.10],
  ['Mature Cheddar', 'Dairy & Alternatives', 'kg', '5kg block', 7.50],
  ['Mozzarella Grated', 'Dairy & Alternatives', 'kg', '6x2kg', 6.80],
  ['Cream Cheese', 'Dairy & Alternatives', 'kg', '2x2kg tub', 5.90],
  ['Greek Yoghurt', 'Dairy & Alternatives', 'kg', '2x5kg tub', 4.30],
  ['Free-Range Eggs', 'Dairy & Alternatives', 'tray', '30 eggs', 4.90],
  ['Halloumi', 'Dairy & Alternatives', 'kg', '12x225g', 9.80],
  // Bakery & Pastry (BAK)
  ['Butter Croissants (Frozen RTB)', 'Bakery & Pastry', 'case', '60 pcs', 21.00],
  ['Pain au Chocolat (Frozen RTB)', 'Bakery & Pastry', 'case', '60 pcs', 24.50],
  ['Almond Croissants (Frozen RTB)', 'Bakery & Pastry', 'case', '48 pcs', 26.40],
  ['Sourdough Loaf', 'Bakery & Pastry', 'loaf', '8 loaves', 2.40],
  ['Malted Bloomer Sliced', 'Bakery & Pastry', 'loaf', '10 loaves', 1.85],
  ['Plain Bagels', 'Bakery & Pastry', 'pack', '6x6 pack', 2.10],
  ['Sesame Bagels', 'Bakery & Pastry', 'pack', '6x6 pack', 2.25],
  ['Ciabatta Rolls', 'Bakery & Pastry', 'case', '40 rolls', 12.80],
  ['Gluten-Free White Rolls', 'Bakery & Pastry', 'pack', '4x4 pack', 3.40],
  ['Blueberry Muffins (Thaw & Serve)', 'Bakery & Pastry', 'case', '24 pcs', 16.20],
  ['Triple Choc Muffins (Thaw & Serve)', 'Bakery & Pastry', 'case', '24 pcs', 16.20],
  ['Cinnamon Swirls (Frozen RTB)', 'Bakery & Pastry', 'case', '48 pcs', 22.30],
  ['Cookie Dough Pucks (Choc Chunk)', 'Bakery & Pastry', 'case', '90 pcs', 19.80],
  ['Waffles (Toast & Serve)', 'Bakery & Pastry', 'case', '36 pcs', 14.10],
  // Cakes & Desserts (CAK)
  ['Victoria Sponge (Pre-cut 14pt)', 'Cakes & Desserts', 'cake', '2 cakes', 11.90],
  ['Carrot Cake (Pre-cut 14pt)', 'Cakes & Desserts', 'cake', '2 cakes', 12.60],
  ['Lemon Drizzle Loaf', 'Cakes & Desserts', 'loaf', '4 loaves', 6.80],
  ['Chocolate Fudge Cake (Pre-cut)', 'Cakes & Desserts', 'cake', '2 cakes', 13.40],
  ['Vegan Banana Bread', 'Cakes & Desserts', 'loaf', '4 loaves', 7.20],
  ['GF Brownie Tray', 'Cakes & Desserts', 'tray', '24 pcs', 15.80],
  ['Millionaire Shortbread Tray', 'Cakes & Desserts', 'tray', '24 pcs', 14.90],
  ['Cheesecake Vanilla (Pre-cut)', 'Cakes & Desserts', 'cake', '2 cakes', 14.20],
  // Syrups & Sauces (SYR)
  ['Vanilla Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.40],
  ['Caramel Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.40],
  ['Hazelnut Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.60],
  ['Gingerbread Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.60],
  ['Pumpkin Spice Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.80],
  ['Sugar-Free Vanilla Syrup', 'Syrups & Sauces', 'bottle', '6x1L', 5.90],
  ['Chocolate Sauce (Mocha)', 'Syrups & Sauces', 'bottle', '6x1kg', 6.30],
  ['White Chocolate Sauce', 'Syrups & Sauces', 'bottle', '6x1kg', 6.50],
  ['Caramel Drizzle Sauce', 'Syrups & Sauces', 'bottle', '6x1kg', 6.30],
  ['Maple Syrup (Pure)', 'Syrups & Sauces', 'bottle', '4x1L', 12.80],
  // Cold Drinks (DRK)
  ['Orange Juice (NFC)', 'Cold Drinks', 'litre', '8x1L', 2.35],
  ['Apple Juice (Cloudy)', 'Cold Drinks', 'litre', '8x1L', 2.20],
  ['Still Mineral Water', 'Cold Drinks', 'case', '24x500ml', 7.20],
  ['Sparkling Mineral Water', 'Cold Drinks', 'case', '24x500ml', 7.60],
  ['Elderflower Presse', 'Cold Drinks', 'case', '12x330ml', 10.80],
  ['Cola (Glass Bottles)', 'Cold Drinks', 'case', '24x330ml', 13.20],
  ['Lemonade (Glass Bottles)', 'Cold Drinks', 'case', '24x330ml', 12.90],
  ['Kombucha Ginger', 'Cold Drinks', 'case', '12x330ml', 15.60],
  ['Smoothie Mix Berry (Frozen)', 'Cold Drinks', 'kg', '5x1kg', 4.80],
  ['Smoothie Mix Mango (Frozen)', 'Cold Drinks', 'kg', '5x1kg', 5.10],
  // Fruit & Veg (FRV)
  ['Bananas', 'Fruit & Veg', 'kg', '18kg box', 1.10],
  ['Lemons', 'Fruit & Veg', 'kg', '5kg box', 2.30],
  ['Limes', 'Fruit & Veg', 'kg', '4kg box', 2.80],
  ['Strawberries', 'Fruit & Veg', 'punnet', '12x400g', 2.60],
  ['Blueberries', 'Fruit & Veg', 'punnet', '12x125g', 1.90],
  ['Avocados (Ready to Eat)', 'Fruit & Veg', 'each', '48 pcs box', 0.85],
  ['Vine Tomatoes', 'Fruit & Veg', 'kg', '5kg box', 3.20],
  ['Cucumber', 'Fruit & Veg', 'each', '12 pcs', 0.75],
  ['Baby Spinach', 'Fruit & Veg', 'kg', '4x1kg bag', 6.40],
  ['Rocket', 'Fruit & Veg', 'kg', '4x1kg bag', 7.80],
  ['Mixed Salad Leaves', 'Fruit & Veg', 'kg', '4x1kg bag', 6.90],
  ['Red Onions', 'Fruit & Veg', 'kg', '10kg sack', 1.20],
  ['Portobello Mushrooms', 'Fruit & Veg', 'kg', '3kg tray', 5.60],
  ['Fresh Basil', 'Fruit & Veg', 'bunch', '10 bunches', 1.40],
  ['Fresh Mint', 'Fruit & Veg', 'bunch', '10 bunches', 1.30],
  // Meat & Deli (MEA)
  ['Smoked Streaky Bacon', 'Meat & Deli', 'kg', '2.27kg pack', 8.10],
  ['Pork Sausages (Cumberland)', 'Meat & Deli', 'kg', '4.54kg box', 5.60],
  ['Chicken Breast Fillets', 'Meat & Deli', 'kg', '5kg bag', 6.95],
  ['Roast Ham (Sliced)', 'Meat & Deli', 'kg', '2x1kg', 9.40],
  ['Salami Milano (Sliced)', 'Meat & Deli', 'kg', '1kg pack', 12.60],
  ['Chorizo (Sliced)', 'Meat & Deli', 'kg', '1kg pack', 11.80],
  ['Halal Turkey Rashers', 'Meat & Deli', 'kg', '2kg pack', 8.90],
  ['Vegan Sausage Patties', 'Meat & Deli', 'case', '48 pcs', 17.40],
  // Fish (FIS)
  ['Smoked Salmon (Sliced)', 'Fish', 'kg', '1kg pack', 19.50],
  ['Tuna Chunks in Brine', 'Fish', 'case', '12x400g tins', 16.80],
  // Dry Goods (DRY)
  ['White Granulated Sugar', 'Dry Goods', 'kg', '25kg sack', 0.85],
  ['Demerara Sugar Sticks', 'Dry Goods', 'box', '1000 sticks', 9.60],
  ['Sweetener Sticks', 'Dry Goods', 'box', '1000 sticks', 8.40],
  ['Plain Flour', 'Dry Goods', 'bag', '16kg sack', 11.50],
  ['Self-Raising Flour', 'Dry Goods', 'bag', '16kg sack', 12.10],
  ['Rolled Oats', 'Dry Goods', 'kg', '25kg sack', 1.30],
  ['Granola (Nut & Seed)', 'Dry Goods', 'kg', '4x2kg', 5.70],
  ['Hot Chocolate Powder', 'Dry Goods', 'tub', '2x5kg tub', 13.90],
  ['Marshmallows (Mini)', 'Dry Goods', 'bag', '1kg bag', 4.20],
  ['Chocolate Shavings (Dark)', 'Dry Goods', 'kg', '2.5kg tub', 9.80],
  ['Cinnamon Ground', 'Dry Goods', 'tub', '500g tub', 4.60],
  ['Basmati Rice', 'Dry Goods', 'bag', '20kg sack', 24.00],
  ['Penne Pasta', 'Dry Goods', 'case', '4x3kg', 13.20],
  ['Tortilla Wraps 12"', 'Dry Goods', 'case', '6x18 pcs', 11.40],
  ['Dried Apricots', 'Dry Goods', 'kg', '3kg bag', 7.90],
  // Condiments & Spreads (CON)
  ['Mayonnaise', 'Condiments & Spreads', 'tub', '10L tub', 16.90],
  ['Tomato Ketchup Sachets', 'Condiments & Spreads', 'box', '200 sachets', 7.30],
  ['Dijon Mustard', 'Condiments & Spreads', 'jar', '6x370g', 4.10],
  ['Sweet Chilli Jam', 'Condiments & Spreads', 'jar', '6x1kg', 8.70],
  ['Hummus', 'Condiments & Spreads', 'tub', '4x1kg', 5.30],
  ['Peanut Butter (Smooth)', 'Condiments & Spreads', 'tub', '2x5kg', 12.40],
  ['Strawberry Jam Portions', 'Condiments & Spreads', 'box', '100 portions', 6.80],
  ['Marmalade Portions', 'Condiments & Spreads', 'box', '100 portions', 6.80],
  ['Extra Virgin Olive Oil', 'Condiments & Spreads', 'tin', '5L tin', 28.50],
  ['Balsamic Glaze', 'Condiments & Spreads', 'bottle', '6x500ml', 5.90],
  ['Basil Pesto', 'Condiments & Spreads', 'jar', '6x500g', 6.40],
  // Packaging & Disposables (PKG)
  ['Takeaway Cups 8oz (Double Wall)', 'Packaging', 'case', '500 pcs', 28.00],
  ['Takeaway Cups 12oz (Double Wall)', 'Packaging', 'case', '500 pcs', 32.00],
  ['Sip Lids 8/12oz', 'Packaging', 'case', '1000 pcs', 18.50],
  ['Compostable Cold Cups 12oz', 'Packaging', 'case', '500 pcs', 26.40],
  ['Napkins (Recycled 2-ply)', 'Packaging', 'case', '4000 pcs', 15.20],
  ['Wooden Stirrers', 'Packaging', 'box', '1000 pcs', 4.80],
  ['Kraft Sandwich Boxes', 'Packaging', 'case', '250 pcs', 21.60],
  ['Paper Straws', 'Packaging', 'box', '500 pcs', 6.90],
  ['Cup Carriers (2/4 cup)', 'Packaging', 'case', '180 pcs', 12.30],
  // Cleaning & Hygiene (CLE)
  ['Espresso Machine Cleaner Powder', 'Cleaning', 'tub', '900g tub', 11.20],
  ['Milk Frother Cleaning Fluid', 'Cleaning', 'bottle', '6x1L', 8.60],
  ['Kitchen Degreaser', 'Cleaning', 'bottle', '5L jerry', 9.20],
  ['Sanitiser Spray (Food Safe)', 'Cleaning', 'bottle', '6x750ml', 7.80],
  ['Blue Roll', 'Cleaning', 'case', '6 rolls', 11.40],
  ['Nitrile Gloves (M)', 'Cleaning', 'box', '100 pcs', 5.80],
  ['Heavy Duty Bin Liners', 'Cleaning', 'roll', '10x25 sack', 13.70],
  ['Dishwasher Detergent', 'Cleaning', 'bottle', '10L drum', 18.90],
]
const SKU_PREFIX = {
  'Coffee & Beans': 'COF', 'Tea & Infusions': 'TEA', 'Dairy & Alternatives': 'DAI',
  'Bakery & Pastry': 'BAK', 'Cakes & Desserts': 'CAK', 'Syrups & Sauces': 'SYR',
  'Cold Drinks': 'DRK', 'Fruit & Veg': 'FRV', 'Meat & Deli': 'MEA', 'Fish': 'FIS',
  'Dry Goods': 'DRY', 'Condiments & Spreads': 'CON', 'Packaging': 'PKG', 'Cleaning': 'CLE',
}

// ---------------------------------------------------------------------------
// 2. WORKING INVENTORY — ~52 item subset. Today = 2026-09-03.
//    [name, category, qty, unit, storage, expiry, unitCost, reorderPoint, allergens, addedDaysAgo]
//    storage ∈ Fridge | Freezer | Dry | Ambient
// ---------------------------------------------------------------------------
const INV = [
  // --- expired (2) — feeds the "Expired £ cost" card
  ['Strawberries', 'Fruit & Veg', 3, 'punnet', 'Fridge', '2026-09-01', 2.60, null, [], 5],
  ['Smoked Salmon (Sliced)', 'Fish', 0.8, 'kg', 'Fridge', '2026-09-02', 19.50, null, ['fish'], 6],
  // --- expiring soon (8) — feeds "Use It or Lose It" + Expiring Soon card
  ['Whole Milk', 'Dairy & Alternatives', 14, 'litre', 'Fridge', '2026-09-05', 1.15, 12, ['milk'], 1],
  ['Semi-Skimmed Milk', 'Dairy & Alternatives', 8, 'litre', 'Fridge', '2026-09-05', 1.10, 8, ['milk'], 1],
  ['Double Cream', 'Dairy & Alternatives', 3, 'litre', 'Fridge', '2026-09-06', 3.80, 2, ['milk'], 2],
  ['Baby Spinach', 'Fruit & Veg', 1.5, 'kg', 'Fridge', '2026-09-05', 6.40, 1, [], 1],
  ['Avocados (Ready to Eat)', 'Fruit & Veg', 10, 'each', 'Ambient', '2026-09-06', 0.85, 8, [], 2],
  ['Sourdough Loaf', 'Bakery & Pastry', 4, 'loaf', 'Ambient', '2026-09-04', 2.40, 4, ['gluten'], 0],
  ['Blueberries', 'Fruit & Veg', 6, 'punnet', 'Fridge', '2026-09-07', 1.90, null, [], 2],
  ['Roast Ham (Sliced)', 'Meat & Deli', 1.2, 'kg', 'Fridge', '2026-09-07', 9.40, 1, [], 3],
  // --- short-dated (rest of September)
  ['Greek Yoghurt', 'Dairy & Alternatives', 4, 'kg', 'Fridge', '2026-09-12', 4.30, 3, ['milk'], 4],
  ['Cream Cheese', 'Dairy & Alternatives', 2, 'kg', 'Fridge', '2026-09-15', 5.90, 2, ['milk'], 4],
  ['Salted Butter', 'Dairy & Alternatives', 5, 'kg', 'Fridge', '2026-09-20', 6.20, 3, ['milk'], 7],
  ['Mature Cheddar', 'Dairy & Alternatives', 3.5, 'kg', 'Fridge', '2026-09-25', 7.50, 2, ['milk'], 7],
  ['Halloumi', 'Dairy & Alternatives', 1.8, 'kg', 'Fridge', '2026-09-22', 9.80, null, ['milk'], 8],
  ['Free-Range Eggs', 'Dairy & Alternatives', 6, 'tray', 'Fridge', '2026-09-18', 4.90, 4, ['eggs'], 3],
  ['Barista Oat Milk', 'Dairy & Alternatives', 18, 'litre', 'Ambient', '2026-09-28', 1.85, 12, [], 5],
  ['Barista Almond Milk', 'Dairy & Alternatives', 6, 'litre', 'Ambient', '2026-09-26', 1.95, 8, ['nuts'], 5],
  ['Barista Soy Milk', 'Dairy & Alternatives', 9, 'litre', 'Ambient', '2026-09-26', 1.70, 6, ['soybeans'], 5],
  ['Vine Tomatoes', 'Fruit & Veg', 4, 'kg', 'Fridge', '2026-09-09', 3.20, 3, [], 1],
  ['Mixed Salad Leaves', 'Fruit & Veg', 2, 'kg', 'Fridge', '2026-09-08', 6.90, 2, [], 1],
  ['Cucumber', 'Fruit & Veg', 8, 'each', 'Fridge', '2026-09-10', 0.75, 6, [], 2],
  ['Lemons', 'Fruit & Veg', 3, 'kg', 'Ambient', '2026-09-14', 2.30, 2, [], 6],
  ['Bananas', 'Fruit & Veg', 6, 'kg', 'Ambient', '2026-09-08', 1.10, 5, [], 1],
  ['Fresh Mint', 'Fruit & Veg', 4, 'bunch', 'Fridge', '2026-09-08', 1.30, null, [], 1],
  ['Smoked Streaky Bacon', 'Meat & Deli', 2.27, 'kg', 'Fridge', '2026-09-16', 8.10, 2, [], 4],
  ['Pork Sausages (Cumberland)', 'Meat & Deli', 4.5, 'kg', 'Fridge', '2026-09-13', 5.60, 3, ['sulphites'], 4],
  ['Salami Milano (Sliced)', 'Meat & Deli', 0.9, 'kg', 'Fridge', '2026-09-19', 12.60, null, [], 8],
  ['Hummus', 'Condiments & Spreads', 3, 'tub', 'Fridge', '2026-09-17', 5.30, 2, ['sesame'], 6],
  ['Orange Juice (NFC)', 'Cold Drinks', 12, 'litre', 'Fridge', '2026-09-21', 2.35, 8, [], 9],
  ['Apple Juice (Cloudy)', 'Cold Drinks', 7, 'litre', 'Fridge', '2026-09-21', 2.20, 6, [], 9],
  // --- freezer stock (longer dates)
  ['Butter Croissants (Frozen RTB)', 'Bakery & Pastry', 96, 'each', 'Freezer', '2026-12-15', 0.35, 60, ['gluten', 'milk'], 10],
  ['Pain au Chocolat (Frozen RTB)', 'Bakery & Pastry', 72, 'each', 'Freezer', '2026-12-15', 0.41, 48, ['gluten', 'milk', 'soybeans'], 10],
  ['Almond Croissants (Frozen RTB)', 'Bakery & Pastry', 30, 'each', 'Freezer', '2026-11-30', 0.55, 36, ['gluten', 'milk', 'nuts'], 10],
  ['Cinnamon Swirls (Frozen RTB)', 'Bakery & Pastry', 40, 'each', 'Freezer', '2027-01-10', 0.46, 24, ['gluten', 'milk'], 12],
  ['Cookie Dough Pucks (Choc Chunk)', 'Bakery & Pastry', 85, 'each', 'Freezer', '2027-02-20', 0.22, 45, ['gluten', 'milk', 'eggs', 'soybeans'], 12],
  ['Smoothie Mix Berry (Frozen)', 'Cold Drinks', 4, 'kg', 'Freezer', '2027-03-15', 4.80, 3, [], 14],
  ['Smoothie Mix Mango (Frozen)', 'Cold Drinks', 2, 'kg', 'Freezer', '2027-03-15', 5.10, 3, [], 14],
  ['Vegan Sausage Patties', 'Meat & Deli', 36, 'each', 'Freezer', '2027-01-25', 0.36, 24, ['soybeans', 'gluten'], 13],
  // --- dry store / ambient (long-dated)
  ['House Espresso Blend Beans', 'Coffee & Beans', 11, 'kg', 'Dry', '2027-02-28', 14.50, 8, [], 3],
  ['Decaf Espresso Beans (Swiss Water)', 'Coffee & Beans', 2, 'kg', 'Dry', '2027-01-31', 16.90, 3, [], 15],
  ['Single Origin Colombia Beans', 'Coffee & Beans', 5, 'kg', 'Dry', '2027-03-31', 17.80, 4, [], 8],
  ['Filter Roast Ground Coffee', 'Coffee & Beans', 3.5, 'kg', 'Dry', '2026-12-31', 12.40, 2, [], 8],
  ['English Breakfast Tea Bags', 'Tea & Infusions', 2, 'box', 'Dry', '2027-06-30', 12.80, 1, [], 16],
  ['Chai Latte Powder', 'Tea & Infusions', 1.5, 'tub', 'Dry', '2027-04-30', 14.60, 1, ['milk'], 16],
  ['Matcha Powder (Ceremonial)', 'Tea & Infusions', 0.4, 'tub', 'Dry', '2027-05-31', 22.00, 1, [], 16],
  ['Hot Chocolate Powder', 'Dry Goods', 4, 'tub', 'Dry', '2027-04-15', 13.90, 2, ['milk', 'soybeans'], 11],
  ['Vanilla Syrup', 'Syrups & Sauces', 5, 'bottle', 'Dry', '2027-08-31', 5.40, 3, [], 11],
  ['Caramel Syrup', 'Syrups & Sauces', 2, 'bottle', 'Dry', '2027-08-31', 5.40, 3, [], 11],
  ['Hazelnut Syrup', 'Syrups & Sauces', 4, 'bottle', 'Dry', '2027-08-31', 5.60, 2, ['nuts'], 11],
  ['Chocolate Sauce (Mocha)', 'Syrups & Sauces', 3, 'bottle', 'Dry', '2027-05-20', 6.30, 2, ['milk', 'soybeans'], 11],
  ['White Granulated Sugar', 'Dry Goods', 20, 'kg', 'Dry', '2028-01-01', 0.85, 10, [], 20],
  ['Demerara Sugar Sticks', 'Dry Goods', 2, 'box', 'Dry', '2028-01-01', 9.60, 1, [], 20],
  ['Granola (Nut & Seed)', 'Dry Goods', 3, 'kg', 'Dry', '2027-01-20', 5.70, 2, ['nuts', 'gluten', 'sesame'], 17],
  ['Rolled Oats', 'Dry Goods', 8, 'kg', 'Dry', '2027-06-30', 1.30, 5, ['gluten'], 17],
  ['Peanut Butter (Smooth)', 'Condiments & Spreads', 4, 'tub', 'Dry', '2027-07-31', 12.40, null, ['peanuts'], 18],
  ['Tomato Ketchup Sachets', 'Condiments & Spreads', 1, 'box', 'Dry', '2027-09-30', 7.30, 2, [], 18],
  ['Dijon Mustard', 'Condiments & Spreads', 3, 'jar', 'Dry', '2027-10-31', 4.10, null, ['mustard'], 18],
  ['Tuna Chunks in Brine', 'Fish', 8, 'tin', 'Dry', '2028-03-31', 1.40, 6, ['fish'], 19],
  ['Dried Apricots', 'Dry Goods', 2, 'kg', 'Dry', '2027-04-30', 7.90, null, ['sulphites'], 19],
]

// ---------------------------------------------------------------------------
// 3. STAFF — 6 people (mixed brigade + baristas). No owner entry created:
//    the app auto-creates the owner PIN row on first /api/staff access.
// ---------------------------------------------------------------------------
const STAFF = [
  { pin: '4821', name: 'Marco', role: 'manager', perms: [] },   // Head Chef
  { pin: '7358', name: 'Priya', role: 'staff', perms: [] },     // Sous Chef
  { pin: '2946', name: 'Jack', role: 'staff', perms: [] },      // Chef de Partie
  { pin: '6173', name: 'Tomasz', role: 'staff', perms: [] },    // Kitchen Porter
  { pin: '9482', name: 'Ella', role: 'staff', perms: [] },      // Barista
  { pin: '3517', name: 'Liam', role: 'staff', perms: [] },      // Barista
]

// Rota profiles: job role, weekly day(s) off (0=Sun..6=Sat), default break
const PEOPLE = [
  { name: 'Marco', role: 'Head Chef', offDays: [0], defaultBreakMins: 30, breakPaid: false },
  { name: 'Priya', role: 'Sous Chef', offDays: [1], defaultBreakMins: 30, breakPaid: false },
  { name: 'Jack', role: 'Chef de Partie', offDays: [3], defaultBreakMins: 30, breakPaid: false },
  { name: 'Tomasz', role: 'Kitchen Porter', offDays: [0], defaultBreakMins: 20, breakPaid: true },
  { name: 'Ella', role: 'Barista', offDays: [4], defaultBreakMins: 30, breakPaid: false },
  { name: 'Liam', role: 'Barista', offDays: [1], defaultBreakMins: 30, breakPaid: false },
]
const TEMPLATES = [
  { name: 'Opening', startTime: '06:30', endTime: '14:30' },
  { name: 'Mid', startTime: '09:00', endTime: '17:00' },
  { name: 'Close', startTime: '12:00', endTime: '20:00' },
  { name: 'Kitchen AM', startTime: '07:00', endTime: '15:00' },
  { name: 'Kitchen PM', startTime: '11:00', endTime: '19:00' },
]
const T = Object.fromEntries(TEMPLATES.map(t => [t.name, t]))

// Weekly pattern per person: dayOfWeek(0=Sun..6=Sat) -> template name.
// Overlapping shifts by design (Opening/Mid/Close overlap through the day).
const PATTERN = {
  Marco:  { 1: 'Kitchen AM', 2: 'Kitchen AM', 3: 'Kitchen AM', 4: 'Kitchen AM', 5: 'Kitchen AM', 6: 'Mid' },          // Sun off
  Priya:  { 0: 'Kitchen PM', 2: 'Kitchen PM', 3: 'Kitchen PM', 4: 'Kitchen PM', 5: 'Kitchen PM', 6: 'Kitchen AM' },  // Mon off
  Jack:   { 0: 'Kitchen AM', 1: 'Kitchen PM', 2: 'Kitchen AM', 4: 'Kitchen PM', 5: 'Kitchen AM', 6: 'Kitchen PM' },  // Wed off
  Tomasz: { 1: 'Close', 2: 'Close', 3: 'Close', 4: 'Close', 5: 'Close', 6: 'Close' },                                 // Sun off
  Ella:   { 0: 'Opening', 1: 'Opening', 2: 'Opening', 3: 'Mid', 5: 'Opening', 6: 'Opening' },                          // Thu off
  Liam:   { 0: 'Mid', 2: 'Close', 3: 'Mid', 4: 'Close', 5: 'Mid', 6: 'Close' },                                        // Mon off
}
// Extra realism: alternating full weekends off + a 2-day annual leave block
const EXTRA_OFF = {
  Priya: ['2026-09-06', '2026-09-20'],   // every other Sunday off
  Ella: ['2026-09-13', '2026-09-27'],    // every other Sunday off
  Marco: ['2026-09-12'],                 // one Saturday off
}
const LEAVE = [
  { name: 'Jack', dates: ['2026-09-17', '2026-09-18'], type: 'annual' },
  { name: 'Tomasz', dates: ['2026-09-08'], type: 'sick' },
]

const iso = (d) => d.toISOString().slice(0, 10)
const daysAgoISO = (n, hh = 10) => {
  const d = new Date('2026-09-03T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hh, Math.floor(Math.random() * 50), 0, 0)
  return d.toISOString()
}

async function main() {
  console.log('— Seeding Coffee kitchen demo data (existing accounts only) —')

  // ------------------------------------------------------------ guards
  const [cat, prods, shifts, kMeta] = await Promise.all([
    get(`supplier_products?supplier_id=eq.${SID}&select=id&limit=1`),
    get(`products?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`rota_shifts?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`kitchens?id=eq.${KID}&select=staff_names`),
  ])
  const staffExisting = kMeta.data?.[0]?.staff_names || []

  // ------------------------------------------------------------ 1. catalogue
  if (cat.count > 0) {
    console.log(`  ↷ supplier catalogue already has ${cat.count} items — skipping`)
  } else {
    const counters = {}
    const rows = CAT.map(([name, category, unit, pack_size, price]) => {
      const p = SKU_PREFIX[category] || 'GEN'
      counters[p] = (counters[p] || 0) + 1
      return { id: uuid(), supplier_id: SID, name, category, unit, pack_size, price, sku: `${p}-${String(counters[p]).padStart(3, '0')}`, available: true, notes: '' }
    })
    await insert('supplier_products', rows)
  }

  // ------------------------------------------------------------ 2. inventory
  const productIdByName = {}
  if (prods.count > 0) {
    console.log(`  ↷ Coffee inventory already has ${prods.count} items — skipping`)
  } else {
    const staffNames = PEOPLE.map(p => p.name)
    const rows = INV.map(([name, category, qty, unit, storage, expiry, cost, reorder, allergens, agedDays], i) => {
      const id = uuid()
      productIdByName[name] = id
      const addedBy = staffNames[i % staffNames.length]
      const createdAt = daysAgoISO(agedDays, 7 + (i % 10))
      const cf = { _addedBy: addedBy }
      if (cost != null) cf._priceHistory = [{ cost, prevCost: null, at: createdAt, by: addedBy }]
      return {
        id, kitchen_id: KID, name, category, quantity: qty, unit,
        expiry_date: expiry, location: '', image_url: '', status: 'good',
        storage_type: storage, shelf: null, prepared_by: '',
        custom_fields: cf, unit_cost: cost, reorder_point: reorder,
        allergens, supplier: 'PATEL FOOD', source: '', source_meta: null,
        created_at: createdAt.replace('Z', ''), updated_at: createdAt,
      }
    })
    await insert('products', rows)
  }

  // ------------------------------------------------------------ 3. staff
  if (staffExisting.length > 0) {
    console.log(`  ↷ staff_names already has ${staffExisting.length} entries — skipping`)
  } else {
    await patchKitchen({ staff_names: STAFF })
    console.log(`  ✔ kitchens.staff_names: added ${STAFF.length} staff`)
  }

  // ------------------------------------------------------------ 4+5. rota
  if (shifts.count > 0) {
    console.log(`  ↷ rota already has ${shifts.count} rows — skipping`)
  } else {
    const cfg = {
      mode: 'flex',
      templates: TEMPLATES.map(t => ({ id: uuid(), ...t })),
      people: PEOPLE.map(p => ({ id: uuid(), ...p })),
    }
    const rows = [{
      id: uuid(), kitchen_id: KID, shift_date: '1970-01-05', shift_slot: '__config__',
      chef_name: '__rota_config__', role: 'config', start_time: '', end_time: '',
      notes: JSON.stringify(cfg), updated_at: new Date().toISOString(),
    }]
    const leaveDates = Object.fromEntries(LEAVE.flatMap(l => l.dates.map(d => [`${l.name}|${d}`, l.type])))
    const start = new Date('2026-08-31T00:00:00Z') // Monday of current week
    for (let d = 0; d < 28; d++) {
      const day = new Date(start); day.setUTCDate(start.getUTCDate() + d)
      const dateStr = iso(day)
      const dow = day.getUTCDay()
      for (const p of PEOPLE) {
        const leaveType = leaveDates[`${p.name}|${dateStr}`]
        if (leaveType) {
          rows.push({
            id: uuid(), kitchen_id: KID, shift_date: dateStr,
            shift_slot: leaveType === 'annual' ? 'Annual leave' : 'Sick',
            chef_name: p.name, role: `leave:${leaveType}`, start_time: '', end_time: '',
            notes: '', updated_at: new Date().toISOString(),
          })
          continue
        }
        if (p.offDays.includes(dow)) continue
        if ((EXTRA_OFF[p.name] || []).includes(dateStr)) continue
        const tplName = PATTERN[p.name][dow]
        if (!tplName) continue
        const tpl = T[tplName]
        rows.push({
          id: uuid(), kitchen_id: KID, shift_date: dateStr, shift_slot: tplName,
          chef_name: p.name, role: 'shift', start_time: tpl.startTime, end_time: tpl.endTime,
          notes: JSON.stringify({ n: '', bm: p.defaultBreakMins, bp: p.breakPaid }),
          updated_at: new Date().toISOString(),
        })
      }
    }
    await insert('rota_shifts', rows)
    console.log(`    (1 config + ${rows.length - 1} shift/leave rows across 4 weeks)`)
  }

  // ------------------------------------------------------------ 6. waste log
  const waste = await get(`waste_log?kitchen_id=eq.${KID}&select=id&limit=1`)
  if (waste.count > 0) {
    console.log(`  ↷ waste_log already has ${waste.count} rows — skipping`)
  } else {
    const w = [
      ['Whole Milk', 'Dairy & Alternatives', 2, 'litre', 1.15, 'expired', 'Ella', 2],
      ['Butter Croissants (Frozen RTB)', 'Bakery & Pastry', 6, 'each', 0.35, 'other', 'Marco', 1],
      ['Mixed Salad Leaves', 'Fruit & Veg', 0.5, 'kg', 6.90, 'spoiled', 'Priya', 3],
      ['Blueberry Muffins (Thaw & Serve)', 'Cakes & Desserts', 4, 'each', 0.68, 'damaged', 'Liam', 5],
    ].map(([product_name, category, quantity, unit, unit_cost, reason, disposed_by, ago]) => ({
      id: uuid(), kitchen_id: KID, product_id: productIdByName[product_name] || uuid(),
      product_name, category, quantity, unit, unit_cost, reason,
      disposed_at: daysAgoISO(ago, 15), disposed_by, notes: '',
    }))
    await insert('waste_log', w)
  }

  // ------------------------------------------------------------ 7. activity log
  const act = await get(`activity_logs?kitchen_id=eq.${KID}&action=neq.supplier_connected&select=id&limit=1`)
  if (act.count > 0) {
    console.log(`  ↷ activity_logs already populated — skipping`)
  } else {
    const a = [
      ['Marco', 'item_added', 'House Espresso Blend Beans (11 kg)', 3],
      ['Ella', 'item_added', 'Whole Milk (14 litre)', 1],
      ['Ella', 'item_added', 'Barista Oat Milk (18 litre)', 5],
      ['Priya', 'item_added', 'Baby Spinach (1.5 kg)', 1],
      ['Jack', 'item_added', 'Smoked Streaky Bacon (2.27 kg)', 4],
      ['Liam', 'item_updated', 'Vanilla Syrup — quantity 6 → 5', 2],
      ['Marco', 'item_updated', 'Single Origin Colombia Beans — cost £17.20 → £17.80', 2],
      ['Ella', 'item_used', 'Double Cream (0.5 litre)', 1],
      ['Tomasz', 'item_used', 'Kitchen Degreaser (1 bottle)', 2],
      ['Priya', 'waste_logged', 'Mixed Salad Leaves (0.5 kg) — spoiled', 3],
      ['Ella', 'waste_logged', 'Whole Milk (2 litre) — expired', 2],
      ['Marco', 'item_deleted', 'Out-of-date pesto jar (moved to Trash)', 4],
      ['Liam', 'item_added', 'Caramel Syrup (2 bottle)', 6],
      ['Jack', 'item_updated', 'Free-Range Eggs — quantity 8 → 6', 1],
    ].map(([person, action, detail, ago], i) => ({
      id: uuid(), kitchen_id: KID, person, action, detail,
      created_at: daysAgoISO(ago, 8 + (i % 9)),
    }))
    await insert('activity_logs', a)
  }

  // ------------------------------------------------------------ summary
  const [c2, p2, s2, w2, a2] = await Promise.all([
    get(`supplier_products?supplier_id=eq.${SID}&select=id&limit=1`),
    get(`products?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`rota_shifts?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`waste_log?kitchen_id=eq.${KID}&select=id&limit=1`),
    get(`activity_logs?kitchen_id=eq.${KID}&select=id&limit=1`),
  ])
  console.log('\n— FINAL COUNTS —')
  console.log(`  PATEL FOOD catalogue: ${c2.count} | Coffee inventory: ${p2.count} | rota rows: ${s2.count} | waste: ${w2.count} | activity: ${a2.count}`)
  const kitchens = await get('kitchens?select=id')
  console.log(`  Total accounts in DB (must be unchanged = 7): ${kitchens.count}`)
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
