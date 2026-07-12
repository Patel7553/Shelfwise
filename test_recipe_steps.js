#!/usr/bin/env node

/**
 * Focused test: Recipe STEPS extraction (changed this session)
 * 
 * CONTEXT:
 * - Supabase NOT configured locally → DB steps return 500 (EXPECTED)
 * - EMERGENT_LLM_KEY IS configured → gpt-4o calls work for real
 * - POST /api/recipe calls scanRecipe() FIRST, then queries Supabase
 * - To verify AI output, we test scanRecipe() directly
 * 
 * WHAT CHANGED:
 * - scanRecipe() system prompt now extracts "steps" (cooking method)
 * - Return object now includes steps array
 * 
 * TESTS:
 * 1. Unit test scanRecipe with TEXT mode: Pancakes with 3 steps
 * 2. Unit test scanRecipe with IMAGE: PNG with recipe + method
 * 3. Unit test scanRecipe with text NO method: Fruit salad
 * 4. Code inspection: POST /api/recipes fallback logic
 * 5. Regression: GET /api/health, POST /api/recipe auth/validation
 */

require('dotenv').config({ path: '/app/.env' })
const fs = require('fs')
const { createCanvas } = require('canvas')

const EMERGENT_URL = 'https://integrations.emergentagent.com/llm/v1/chat/completions'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const JWT_SECRET = process.env.SHELFWISE_JWT_SECRET || 'local-dev-secret-shelfwise-2026'

// Mint a chef JWT for testing
const jwt = require('jsonwebtoken')
const testToken = jwt.sign(
  { kitchen_id: 'test-kitchen-steps', role: 'chef' },
  JWT_SECRET,
  { expiresIn: '1h' }
)

// ============================================================================
// EXTRACTED scanRecipe function (from route.js lines 1373-1415)
// ============================================================================
async function scanRecipe({ image, images, text }) {
  const key = process.env.EMERGENT_LLM_KEY
  if (!key) throw new Error('EMERGENT_LLM_KEY not set')
  
  const imgs = (Array.isArray(images) && images.length > 0) ? images : (image ? [image] : [])
  const systemPrompt = `You are a recipe parser. Extract structured recipe data and return it as JSON.
The recipe may span MULTIPLE photos/pages — treat them as ONE single recipe: combine ALL ingredients (deduplicate) and keep steps in page order.
Return ONLY a JSON object of shape: {"title","servings","ingredients":[{"name","quantity","unit","notes"}],"steps":["step 1","step 2",...],"allergens":[]}.
"steps" = the cooking method / instructions EXACTLY as written in the recipe (one array item per step, strip any leading numbering). Do NOT invent steps — if the recipe truly shows no method, return "steps": [].
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
// Helper: Generate a test recipe image
// ============================================================================
function generateRecipeImage(title, ingredients, steps) {
  const canvas = createCanvas(800, 1000)
  const ctx = canvas.getContext('2d')
  
  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 800, 1000)
  
  // Title
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 36px Arial'
  ctx.fillText(title, 50, 60)
  
  // Ingredients section
  ctx.font = 'bold 24px Arial'
  ctx.fillText('Ingredients:', 50, 120)
  ctx.font = '20px Arial'
  let y = 160
  ingredients.forEach((ing, i) => {
    ctx.fillText(`• ${ing}`, 70, y)
    y += 35
  })
  
  // Method section
  y += 20
  ctx.font = 'bold 24px Arial'
  ctx.fillText('Method:', 50, y)
  y += 40
  ctx.font = '20px Arial'
  steps.forEach((step, i) => {
    const lines = wrapText(ctx, `${i + 1}. ${step}`, 680)
    lines.forEach(line => {
      ctx.fillText(line, 70, y)
      y += 30
    })
    y += 10
  })
  
  return canvas.toDataURL('image/png')
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let currentLine = words[0]
  
  for (let i = 1; i < words.length; i++) {
    const word = words[i]
    const width = ctx.measureText(currentLine + ' ' + word).width
    if (width < maxWidth) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }
  lines.push(currentLine)
  return lines
}

// ============================================================================
// Test runner
// ============================================================================
async function runTests() {
  console.log('='.repeat(80))
  console.log('RECIPE STEPS EXTRACTION TEST')
  console.log('='.repeat(80))
  console.log()
  
  let passed = 0
  let failed = 0
  
  // TEST 1: Text mode with 3 steps (Pancakes)
  console.log('TEST 1: scanRecipe() with TEXT mode (Pancakes with 3 steps)')
  console.log('-'.repeat(80))
  try {
    const text = `Pancakes (Serves 4)

Ingredients:
- 2 cups flour
- 2 eggs
- 1 cup milk

Method:
1. Whisk eggs and milk together in a large bowl.
2. Fold in flour until smooth and lump-free.
3. Fry ladlefuls in a hot buttered pan for 2 minutes per side.`
    
    const result = await scanRecipe({ text })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Servings: ${result.servings}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log(`✓ Allergens: ${result.allergens.join(', ')}`)
    console.log()
    
    // Validations
    const checks = []
    checks.push({ name: 'Title contains "Pancake"', pass: /pancake/i.test(result.title) })
    checks.push({ name: 'Ingredients length >= 3', pass: result.ingredients.length >= 3 })
    checks.push({ name: 'Steps is an array', pass: Array.isArray(result.steps) })
    checks.push({ name: 'Steps length === 3', pass: result.steps.length === 3 })
    checks.push({ name: 'Step 1 mentions whisk/eggs/milk', pass: /whisk|egg|milk/i.test(result.steps[0] || '') })
    checks.push({ name: 'Step 2 mentions fold/flour', pass: /fold|flour/i.test(result.steps[1] || '') })
    checks.push({ name: 'Step 3 mentions fry/pan', pass: /fry|pan/i.test(result.steps[2] || '') })
    // Allergens are nice-to-have but not critical for this test (focus is on steps)
    checks.push({ name: 'Allergens array exists (may be empty)', pass: Array.isArray(result.allergens) })
    
    console.log('Detailed steps extracted:')
    result.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`)
    })
    console.log()
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 1 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 1 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 1 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 2: Image mode with recipe + method
  console.log('TEST 2: scanRecipe() with IMAGE mode (PNG with recipe + method)')
  console.log('-'.repeat(80))
  try {
    const imageDataUrl = generateRecipeImage(
      'Simple Omelette',
      ['3 eggs', '50g cheese', '1 tbsp butter'],
      [
        'Beat eggs in a bowl with a fork.',
        'Melt butter in a non-stick pan over medium heat.',
        'Pour in eggs and cook for 2 minutes, then add cheese and fold.'
      ]
    )
    
    const result = await scanRecipe({ image: imageDataUrl })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log(`✓ Allergens: ${result.allergens.join(', ')}`)
    console.log()
    
    const checks = []
    checks.push({ name: 'Title contains "Omelette"', pass: /omelette/i.test(result.title) })
    checks.push({ name: 'Ingredients length >= 2', pass: result.ingredients.length >= 2 })
    checks.push({ name: 'Steps is an array', pass: Array.isArray(result.steps) })
    checks.push({ name: 'Steps length >= 2', pass: result.steps.length >= 2 })
    checks.push({ name: 'Steps NOT empty (not invented generic text)', pass: result.steps.length > 0 && result.steps.some(s => s.length > 10) })
    checks.push({ name: 'At least one step mentions eggs/butter/cheese/pan', pass: 
      result.steps.some(s => /egg|butter|cheese|pan|beat|melt|cook|fold/i.test(s))
    })
    
    console.log('Detailed steps extracted:')
    result.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`)
    })
    console.log()
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 2 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 2 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 2 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 3: Text mode with NO method (Fruit salad)
  console.log('TEST 3: scanRecipe() with text that has NO method (Fruit salad)')
  console.log('-'.repeat(80))
  try {
    const text = 'Fruit salad: 1 apple, 1 banana, 5 strawberries'
    
    const result = await scanRecipe({ text })
    
    console.log(`✓ Title: ${result.title}`)
    console.log(`✓ Ingredients: ${result.ingredients.length} items`)
    console.log(`✓ Steps: ${result.steps.length} items`)
    console.log()
    
    const checks = []
    checks.push({ name: 'Title contains "Fruit" or "salad"', pass: /fruit|salad/i.test(result.title) })
    checks.push({ name: 'Ingredients length >= 2', pass: result.ingredients.length >= 2 })
    checks.push({ name: 'Steps is an array', pass: Array.isArray(result.steps) })
    checks.push({ name: 'Steps is empty or trivially short (must NOT invent long method)', pass: 
      result.steps.length === 0 || 
      (result.steps.length <= 2 && result.steps.every(s => s.length < 50))
    })
    
    console.log('Steps extracted (should be empty or trivial):')
    if (result.steps.length === 0) {
      console.log('  (empty array - correct!)')
    } else {
      result.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`)
      })
    }
    console.log()
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 3 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 3 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 3 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 4: Code inspection - POST /api/recipes fallback logic
  console.log('TEST 4: Code inspection - POST /api/recipes fallback logic')
  console.log('-'.repeat(80))
  try {
    const routeFile = fs.readFileSync('/app/app/api/[[...path]]/route.js', 'utf8')
    
    // Check for the fallback logic at line ~2872-2874
    const checks = []
    checks.push({ 
      name: 'POST /api/recipes handler exists', 
      pass: routeFile.includes("if (path === 'recipes')") && routeFile.includes('await request.json()')
    })
    checks.push({ 
      name: 'Fallback checks body.steps length', 
      pass: routeFile.includes('body.steps') && routeFile.includes('body.steps.length')
    })
    checks.push({ 
      name: 'Fallback uses body.instructions when steps empty', 
      pass: routeFile.includes('body.instructions') && /body\.steps.*body\.instructions/s.test(routeFile)
    })
    checks.push({ 
      name: 'Steps assignment uses ternary with length check', 
      pass: /steps:.*body\.steps.*length.*body\.instructions/s.test(routeFile)
    })
    
    const allPassed = checks.every(c => c.pass)
    checks.forEach(c => {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    })
    
    if (allPassed) {
      console.log('✅ TEST 4 PASSED\n')
      passed++
    } else {
      console.log('❌ TEST 4 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 4 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 5: Regression - GET /api/health
  console.log('TEST 5: Regression - GET /api/health')
  console.log('-'.repeat(80))
  try {
    const res = await fetch(`${BASE_URL}/api/health`)
    const data = await res.json()
    
    if (res.status === 200 && data.ok) {
      console.log('  ✓ Status: 200')
      console.log('  ✓ Response: ok=true')
      console.log('✅ TEST 5 PASSED\n')
      passed++
    } else {
      console.log(`  ✗ Status: ${res.status}`)
      console.log(`  ✗ Response: ${JSON.stringify(data)}`)
      console.log('❌ TEST 5 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 5 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 6: Regression - POST /api/recipe without auth
  console.log('TEST 6: Regression - POST /api/recipe without auth')
  console.log('-'.repeat(80))
  try {
    const res = await fetch(`${BASE_URL}/api/recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' })
    })
    const data = await res.json()
    
    if (res.status === 401 && data.error) {
      console.log('  ✓ Status: 401')
      console.log(`  ✓ Error: ${data.error}`)
      console.log('✅ TEST 6 PASSED\n')
      passed++
    } else {
      console.log(`  ✗ Status: ${res.status} (expected 401)`)
      console.log(`  ✗ Response: ${JSON.stringify(data)}`)
      console.log('❌ TEST 6 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 6 FAILED: ${e.message}\n`)
    failed++
  }
  
  // TEST 7: Regression - POST /api/recipe with auth but empty body
  console.log('TEST 7: Regression - POST /api/recipe with auth but empty body')
  console.log('-'.repeat(80))
  try {
    const res = await fetch(`${BASE_URL}/api/recipe`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify({})
    })
    const data = await res.json()
    
    if (res.status === 400 && data.error) {
      console.log('  ✓ Status: 400')
      console.log(`  ✓ Error: ${data.error}`)
      console.log('✅ TEST 7 PASSED\n')
      passed++
    } else {
      console.log(`  ✗ Status: ${res.status} (expected 400)`)
      console.log(`  ✗ Response: ${JSON.stringify(data)}`)
      console.log('❌ TEST 7 FAILED\n')
      failed++
    }
  } catch (e) {
    console.log(`❌ TEST 7 FAILED: ${e.message}\n`)
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
