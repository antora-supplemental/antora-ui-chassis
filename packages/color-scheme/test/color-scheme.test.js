'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { ensureColorScheme } = require('../lib/index.js')

function catalog (partials) {
  const files = Object.entries(partials).map(([stem, body]) => ({ type: 'partial', stem, contents: Buffer.from(body) }))
  return {
    files,
    findByType: (t) => files.filter((f) => f.type === t),
    addFile: (f) => files.push(f),
    partial: (stem) => files.find((f) => f.stem === stem).contents.toString(),
  }
}

describe('Antora extension', () => {
  it('links the contract stylesheet after site.css, once, and adds no runtime without live paint', () => {
    const c = catalog({
      'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<link href="x.css">',
      'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>',
    })
    assert.ok(ensureColorScheme(c, '_', {}))
    assert.ok(ensureColorScheme(c, '_', {}))
    const head = c.partial('head-styles').split('\n')
    assert.match(head[1], /color-scheme\.css" data-color-scheme-head/)
    assert.equal(c.partial('head-styles').split('data-color-scheme-head').length, 2)
    assert.doesNotMatch(c.partial('footer-scripts'), /color-scheme\.js/)
    assert.deepEqual(c.findByType('asset').map((f) => f.path), ['css/color-scheme.css'])
  })
  it('falls back to head-meta', () => {
    const c = catalog({ 'head-meta': '<meta x>', 'footer-scripts': '' })
    assert.ok(ensureColorScheme(c, '_', {}))
    assert.match(c.partial('head-meta'), /^<link rel="stylesheet"[^\n]*color-scheme\.css/)
  })
  it('rejects the 0.2 toggle and navbar options (moved to light-dark-mode)', () => {
    for (const cfg of [{ toggle: 'placed' }, { navbar: 'light' }]) {
      const c = catalog({ 'head-meta': '', 'footer-scripts': '' })
      assert.throws(() => ensureColorScheme(c, '_', cfg), /light-dark-mode/)
    }
  })
  it('sets no light/dark state itself', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'color-scheme.js'), 'utf8')
    assert.doesNotMatch(js, /localStorage|prefers-color-scheme|classList\.(add|toggle)/)
  })
})

describe('CSS', () => {
  it('sets no color values (palettes belong to paint)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'color-scheme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|--[\w-]+\s*:/i)
  })
})
