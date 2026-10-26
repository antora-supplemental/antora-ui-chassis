'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const register = require('../lib/index.js')
const { mapOptions } = register

function generator () {
  const listeners = {}
  const logs = []
  return {
    listeners,
    logs,
    on (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn) },
    getLogger: (name) => ({ info: (m) => logs.push(['info', name, m]), warn: (m) => logs.push(['warn', name, m]) }),
    fire (ev, arg) { (listeners[ev] || []).forEach((fn) => fn(arg)) },
  }
}
function catalog () {
  const files = [
    { type: 'partial', stem: 'head-styles', contents: Buffer.from('<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">') },
    { type: 'partial', stem: 'footer-scripts', contents: Buffer.from('<script src="{{{uiRootPath}}}/js/site.js"></script>') },
  ]
  return { files, findByType: (t) => files.filter((f) => f.type === t), addFile: (f) => files.push(f), partial: (s) => files.find((f) => f.stem === s).contents.toString() }
}

describe('antora-dark-mode 2.x (relabel of the chassis packages)', () => {
  it('maps options and the 1.x site key', () => {
    assert.deepEqual(mapOptions({}, { dark_mode_navbar: 'match' }), { navbar: 'match' })
    assert.deepEqual(mapOptions({ navbar: 'light', toggle_placement: 'x', togglePlacement: 'footer', followSystem: false }, { dark_mode_navbar: 'match' }), { navbar: 'light', togglePlacement: 'footer', followSystem: false })
    assert.deepEqual(mapOptions(), { navbar: 'dark' })
  })
  it('registers light-dark-mode (with color-scheme) and default-paint, and never warns', () => {
    const g = generator()
    register.call(g, { config: { togglePlacement: 'footer' } })
    const c = catalog()
    g.fire('uiLoaded', { playbook: { site: { keys: { dark_mode_navbar: 'light' } }, ui: { outputDir: '_' } }, uiCatalog: c })
    const head = c.partial('head-styles')
    assert.match(head, /css\/color-scheme\.css/)
    assert.match(head, /css\/light-dark-mode\.css/)
    assert.match(head, /<meta name="dm-navbar" content="light">/)
    assert.match(head, /css\/default-paint\.css/)
    assert.match(c.partial('footer-scripts'), /js\/light-dark-mode\.js" data-light-dark-mode-toggle="auto" data-light-dark-mode-placement="footer"/)
    assert.equal(g.logs.filter((l) => l[0] === 'warn').length, 0)
  })
  it('paint: false leaves the palette to you', () => {
    const g = generator()
    register.call(g, { config: { paint: false } })
    const c = catalog()
    g.fire('uiLoaded', { playbook: { site: {}, ui: {} }, uiCatalog: c })
    assert.doesNotMatch(c.partial('head-styles'), /default-paint/)
  })
  it('ships no CSS or JS of its own', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    assert.deepEqual(fs.readdirSync(path.join(__dirname, '..')).filter((f) => ['css', 'js'].includes(f)), [])
  })
})
