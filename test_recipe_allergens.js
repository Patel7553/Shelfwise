#!/usr/bin/env node

/**
 * Focused test: Recipe ALLERGEN detection (prompt updated this session)
 * 
 * CONTEXT:
 * - Supabase NOT configured locally → DB 500s expected (irrelevant - unit tests)
 * - EMERGENT_LLM_KEY works locally
 * - scanRecipe system prompt now instructs gpt-4o to analyse EVERY ingredient
 *   and return all 14 UK/EU declarable allergens (inferred, e.g. flour → gluten)
 * 
 * TESTS (unit-test scanRecipe directly):
 * 1. Fish Batter Recipe → allergens MUST include: gluten, eggs, milk, fish
 * 2. Thai Prawn Stir Fry → allergens MUST include: crustaceans, soya, sesame, peanuts
 * 3. Fruit salad → allergens should be [] (empty)
 * 4. Regression: steps still extracted in test 1 (2 steps) and ingredients >= 5
 */

require('dotenv').config({ path: '/app/.env' })

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions'

// ============================================================================
// EXTRACTED scanRecipe function (from route.js lines 1373-1417)
// ============================================================================
async function scanRecipe({ image, images, text }) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  
  const imgs = (Array.isArray(images) && images.length > 0) ? images : (image ? [image] : [])
  const systemPrompt = `You are a recipe parser for a professional kitchen. Extract structured recipe data and return it as JSON.
The recipe may span MULTIPLE photos/pages — treat them as ONE single recipe: combine ALL ingredients (deduplicate) and keep steps in page order.
Return ONLY a JSON object of shape: {"title","servings","ingredients":[{"name","quantity","unit","notes"}],"steps":["step 1","step 2",...],"allergens":[]}.
"steps" = the cooking method / instructions EXACTLY as written in the recipe (one array item per step, strip any leading numbering). Do NOT invent steps — if the recipe truly shows no method, return "steps": [].
"allergens" = analyse EVERY ingredient and list ALL of the 14 UK/EU declarable allergens present, even when not explicitly labelled. The 14: celery, gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, nuts, peanuts, sesame, soya, sulphites.
Infer from ingredients — examples: flour/bread/pasta/beer → "gluten"; butter/cream/cheese/yoghurt → "milk"; mayonnaise/batter with egg → "eggs"; soy sauce → "soya" and "gluten"; prawns/crab → "crustaceans"; almonds/hazelnuts/walnuts → "nuts"; wine vinegar/dried fruit → "sulphites"; worcestershire sauce → "fish". Use lowercase names from the list above. If genuinely none, return [].
Output strictly valid JSON with no other text.`

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      imgs.length > 0
        ? { role: 'user', content: [
            { type: 'text', text: imgs.length > 1 ? `Extract ONE recipe from these ${imgs.length} pages (in order).` : 'Extract recipe.' },
            ...imgs.map(u => ({ type: 'image_url', image_url: { url: u } }))
          ] }
        : { role: 'user', content: `Extract recipe from: ${text}` }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }
  
  const res = await fetch(EMERGENT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  
  if (!res.ok) throw new Error(`Emergent LLM ${res.status}`)
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  let parsed
  try { parsed = JSON.parse(content) } catch { parsed = {} }
  
  return {
    title: parsed.title || 'Untitled',
    servings: parsed.servings || null,
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(s => String(s)).filter(Boolean) : [],
    allergens: Array.isArray(parsed.allergens) ? parsed.allergens : [],
  }
}

// ============================================================================
// Test runner
// ============================================================================
async function runTests() {
  console.log('='.repeat(80))
  console.log('RECIPE ALLERGEN DETECTION TEST')
  console.log('='.repeat(80))
  console.log()
  
  let passed = 0
  let failed = 0
  
  // TEST 1: Fish Batter Recipe → gluten, eggs, milk, fish
  console.log('TEST 1: Fish Batter Recipe (Serves 6)')
  console.log('-'.repeat(80))
  try {
    const text = `Fish Batter Recipe (Serves 6). Ingredients: 2 cups plain flour, 1 cup cold beer, 2 eggs, 1/2 cup milk, pinch of salt, 500g cod fillets. Method: 1. Whisk everything into a smooth batter. 2. Dip cod and deep fry until golden.`
    
    const result = await scanRecipe({ text })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Servings: ${result.servings}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log(`✓ Allergens: [${result.allergens.join(', ')}]`)
    console.log()
    
    // Required allergens: gluten, eggs, milk, fish
    const required = ['gluten', 'eggs', 'milk', 'fish']
    const checks = []
    
    checks.push({ name: 'Allergens is an array', pass: Array.isArray(result.allergens) })
    checks.push({ name: 'Allergens NOT empty', pass: result.allergens.length > 0 })
    checks.push({ name: 'Contains "gluten" (from flour/beer)', pass: result.allergens.includes('gluten') })
    checks.push({ name: 'Contains "eggs"', pass: result.allergens.includes('eggs') })
    checks.push({ name: 'Contains "milk"', pass: result.allergens.includes('milk') })
    checks.push({ name: 'Contains "fish" (from cod)', pass: result.allergens.includes('fish') })
    
    // Regression: steps still extracted (2 steps)
    checks.push({ name: 'REGRESSION: Steps extracted (2 steps)', pass: result.steps.length === 2 })
    checks.push({ name: 'REGRESSION: Ingredients >= 5', pass: result.ingredients.length >= 5 })
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 1 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 1 FAILED\n')
      console.log(`Expected allergens: [${required.join(', ')}]`)
      console.log(`Actual allergens: [${result.allergens.join(', ')}]`)
      console.log()
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 1 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 2: Thai Prawn Stir Fry → crustaceans, soya, sesame, peanuts
  console.log('TEST 2: Thai Prawn Stir Fry')
  console.log('-'.repeat(80))
  try {
    const text = `Thai Prawn Stir Fry: 300g prawns, 2 tbsp soy sauce, 1 tbsp sesame oil, 100g peanuts, 1 red chilli. Method: stir fry everything.`
    
    const result = await scanRecipe({ text })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log(`✓ Allergens: [${result.allergens.join(', ')}]`)
    console.log()
    
    // Required allergens: crustaceans, soya, sesame, peanuts
    // Note: gluten also acceptable from soy sauce
    const required = ['crustaceans', 'soya', 'sesame', 'peanuts']
    const checks = []
    
    checks.push({ name: 'Allergens is an array', pass: Array.isArray(result.allergens) })
    checks.push({ name: 'Allergens NOT empty', pass: result.allergens.length > 0 })
    checks.push({ name: 'Contains "crustaceans" (from prawns)', pass: result.allergens.includes('crustaceans') })
    checks.push({ name: 'Contains "soya" (from soy sauce)', pass: result.allergens.includes('soya') })
    checks.push({ name: 'Contains "sesame" (from sesame oil)', pass: result.allergens.includes('sesame') })
    checks.push({ name: 'Contains "peanuts"', pass: result.allergens.includes('peanuts') })
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    // Note if gluten is also present (acceptable from soy sauce)
    if (result.allergens.includes('gluten')) {
      console.log('  ℹ "gluten" also present (acceptable from soy sauce)')
    }
    
    if (allPassed) {
      console.log('✅ TEST 2 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 2 FAILED\n')
      console.log(`Expected allergens: [${required.join(', ')}] (gluten also acceptable)`)
      console.log(`Actual allergens: [${result.allergens.join(', ')}]`)
      console.log()
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 2 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 3: Fruit salad → allergens should be [] (empty)
  console.log('TEST 3: Fruit salad (no allergens)')
  console.log('-'.repeat(80))
  try {
    const text = `Fruit salad: 1 apple, 1 banana, 5 strawberries. Method: chop and mix.`
    
    const result = await scanRecipe({ text })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log(`✓ Allergens: [${result.allergens.join(', ')}]`)
    console.log()
    
    const checks = []
    checks.push({ name: 'Allergens is an array', pass: Array.isArray(result.allergens) })
    checks.push({ name: 'Allergens is EMPTY (no allergens in fruit)', pass: result.allergens.length === 0 })
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 3 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 3 FAILED\n')
      console.log(`Expected allergens: [] (empty)`)
      console.log(`Actual allergens: [${result.allergens.join(', ')}]`)
      console.log()
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 3 FAILED: ${e.message}\n`)
    failed++
  }
  
  // Summary
  console.log('='.repeat(80))
  console.log('TEST SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total: ${passed + failed}`)
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  console.log()
  
  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED')
    console.log()
    console.log('KEY FINDINGS:')
    console.log('- Allergen detection working correctly for all test cases')
    console.log('- AI correctly infers allergens from ingredients (flour→gluten, prawns→crustaceans, etc.)')
    console.log('- Empty allergen array returned when no allergens present')
    console.log('- Regression: steps and ingredients still extracted correctly')
  } else {
    console.log('❌ SOME TESTS FAILED')
  }
  
  process.exit(failed > 0 ? 1 : 0)
}

// Run tests
runTests().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
