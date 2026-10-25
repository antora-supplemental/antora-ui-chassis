'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const register = require('../lib/index.js')
const { ensureDefaultPaint } = register

function catalog (partials) {
  const files = Object.entries(partials).map(([stem, body]) => ({ type: 'partial', stem, contents: Buffer.from(body) }))
  return { files, findByType: (t) => files.filter((f) => f.type === t), addFile: (f) => files.push(f), partial: (s) => files.find((f) => f.stem === s).contents.toString() }
}

describe('default-paint extension', () => {
  it('links the paint last in head-styles, once, and adds the asset', () => {
    const c = catalog({ 'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<link rel="stylesheet" href="{{{uiRootPath}}}/css/color-scheme.css">\n' })
    assert.ok(ensureDefaultPaint(c, '_'))
    assert.ok(ensureDefaultPaint(c, '_'))
    const lines = c.partial('head-styles').trim().split('\n')
    assert.match(lines.at(-1), /css\/default-paint\.css/)
    assert.equal(c.partial('head-styles').split('default-paint.css').length, 2)
    const assets = c.findByType('asset')
    assert.equal(assets.length, 1)
    assert.equal(assets[0].out.path, '_/css/default-paint.css')
  })
  it('falls back to head-meta and reports a UI with neither', () => {
    const c = catalog({ 'head-meta': '<meta x>' })
    assert.ok(ensureDefaultPaint(c, '_'))
    assert.match(c.partial('head-meta'), /default-paint\.css/)
    assert.equal(ensureDefaultPaint(catalog({ body: '' }), '_'), false)
  })
  it('register receives config with this bound (Antora generator context)', () => {
    assert.equal(register.length, 1)
    const handlers = {}
    const ctx = { getLogger: () => ({ info () {}, warn () {} }), on: (e, fn) => { handlers[e] = fn } }
    register.call(ctx, { config: { enabled: false } })
    const c = catalog({ 'head-styles': '' })
    handlers.uiLoaded({ playbook: { ui: {} }, uiCatalog: c })
    assert.equal(c.findByType('asset').length, 0)
  })
})

describe('palette', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'default-paint.css'), 'utf8')
  const block = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)))
  const tokens = (b) => new Set([...b.matchAll(/(--dp-[a-z-]+):/g)].map((m) => m[1]))
  it('defines every --dp-* token for both schemes', () => {
    const light = tokens(block(':root'))
    const dark = tokens(block('html.dark-theme'))
    assert.ok(light.size > 20)
    assert.deepEqual([...dark].sort(), [...light].sort())
  })
  it('defines the chassis token contract', () => {
    for (const t of ['canvas', 'elevated', 'ink', 'ink-muted', 'border', 'accent']) assert.match(block(':root'), new RegExp(`--valentus-${t}:`))
  })
  it('sets no layout properties (paint only)', () => {
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.theme-toggle[^{]*\{[^}]*\}/g, ''), /(^|[;{\s])(width|margin|position|top|left|display|grid|flex)\s*:/m)
  })
})

describe('coexistence with color-scheme live paint', () => {
  it('still links the stylesheet when another partial merely mentions css/default-paint.css', () => {
    const { ensureDefaultPaint } = require('../lib/index.js')
    const files = [{ type: 'partial', stem: 'head-styles', contents: Buffer.from('<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<script>window.__colorSchemeLivePaint = {"paints":{"default":"css/default-paint.css"}}</script>') }]
    const cat = { findByType: (t) => files.filter((f) => f.type === t), addFile: (f) => files.push(f) }
    assert.ok(ensureDefaultPaint(cat, '_'))
    assert.match(files[0].contents.toString(), /<link rel="stylesheet" href="\{\{\{uiRootPath\}\}\}\/css\/default-paint\.css">\n?$/)
  })
})
