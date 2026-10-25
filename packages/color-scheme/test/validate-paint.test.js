'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'validate-paint.mjs')).href)

test('default-paint passes the allowlist', async () => {
  const { validatePaint } = await load()
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'default-paint', 'css', 'default-paint.css'), 'utf8')
  assert.deepStrictEqual(validatePaint(css).errors, [])
})

test('layout classes, @import and external url() are rejected; --extra admits a prefix', async () => {
  const { validatePaint } = await load()
  const css = '@import "x.css"; :root { --cs-ink: #111; } .doc a { color: var(--cs-accent); } .my-layout-bar { color: var(--cs-ink); } .navbar { background: url(https://x/y.png); }'
  const { errors } = validatePaint(css)
  assert.ok(errors.some((e) => e.includes('@import')))
  assert.ok(errors.some((e) => e.includes('.my-layout-bar')))
  assert.ok(errors.some((e) => e.includes('external url')))
  assert.ok(!validatePaint(css, ['.my-layout-']).errors.some((e) => e.includes('.my-layout-bar')))
})

test('literal colors outside token blocks are warnings', async () => {
  const { validatePaint } = await load()
  const r = validatePaint(':root { --cs-ink: #111; } html.dark-theme { --cs-ink: #eee; } .doc { color: #333; box-shadow: 0 1px rgba(0,0,0,.2); }')
  assert.strictEqual(r.errors.length, 0)
  assert.strictEqual(r.warnings.length, 1)
})
