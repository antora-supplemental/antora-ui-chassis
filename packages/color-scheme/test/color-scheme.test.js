'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
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
  it('injects the head hook after site.css and the runtime after ui-bus.js, once', () => {
    const c = catalog({
      'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<link href="x.css">',
      'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>\n<script src="{{{uiRootPath}}}/js/ui-bus.js" defer></script>\n<script src="late.js"></script>',
    })
    assert.ok(ensureColorScheme(c, '_', { navbar: 'light' }))
    assert.ok(ensureColorScheme(c, '_', {}))
    const head = c.partial('head-styles').split('\n')
    assert.match(head[0], /site\.css/)
    assert.match(head[1], /color-scheme\.css/)
    assert.match(head[2], /dm-navbar" content="light"/)
    assert.equal(c.partial('head-styles').split('data-color-scheme-head').length, 2)
    const foot = c.partial('footer-scripts').split('\n')
    assert.match(foot[2], /color-scheme\.js" data-color-scheme-toggle="auto" defer/)
    assert.equal(c.findByType('asset').length, 2)
  })
  it('falls back to head-meta and honours toggle: placed', () => {
    const c = catalog({ 'head-meta': '<meta x>', 'footer-scripts': '<script src="site.js"></script>' })
    assert.ok(ensureColorScheme(c, '_', { toggle: 'placed' }))
    assert.match(c.partial('head-meta'), /^<link rel="stylesheet"[^\n]*color-scheme\.css/)
    assert.match(c.partial('footer-scripts'), /data-color-scheme-toggle="placed"/)
  })
})

describe('CSS', () => {
  it('sets no color values (palettes belong to paint)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'color-scheme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|--[\w-]+\s*:/i)
  })
})

function sandbox ({ store = {}, systemDark = false } = {}) {
  const classes = new Set()
  const attrs = {}
  const html = {
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    setAttribute: (k, v) => { attrs[k] = v },
    getAttribute: (k) => attrs[k] ?? null,
    dataset: {},
    offsetWidth: 0,
  }
  const mqs = []
  const mq = (q) => {
    const m = { matches: q.includes('dark') ? systemDark : false, listeners: [], addEventListener: (_e, fn) => m.listeners.push(fn) }
    mqs.push(m)
    return m
  }
  const ctx = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    },
    document: {
      documentElement: html, readyState: 'complete', currentScript: null,
      querySelector: () => null, getElementById: () => null, addEventListener: () => {},
    },
    setTimeout: () => 0, clearTimeout: () => {},
  }
  ctx.window = ctx
  ctx.window.matchMedia = mq
  ctx.window.addEventListener = () => {}
  vm.createContext(ctx)
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), ctx)
  return { ctx, classes, attrs, store, run, mqs, setSystem: (d) => { mqs.forEach((m) => { if (m.listeners) m.matches = d }); mqs.forEach((m) => m.listeners.forEach((fn) => fn())) } }
}

describe('head hook', () => {
  it('follows the system when nothing is stored', () => {
    const s = sandbox({ systemDark: true })
    s.run('color-scheme-head.js')
    assert.ok(s.classes.has('dark-theme'))
    assert.equal(s.attrs['data-theme'], 'dark')
    assert.equal(s.attrs['data-color-scheme-mode'], 'system')
  })
  it('keeps a saved antora-dark-mode choice (antora-theme-mode and legacy antora-theme)', () => {
    const a = sandbox({ store: { 'antora-theme-mode': 'light' }, systemDark: true })
    a.run('color-scheme-head.js')
    assert.equal(a.attrs['data-theme'], 'light')
    const b = sandbox({ store: { 'antora-theme': 'dark' } })
    b.run('color-scheme-head.js')
    assert.equal(b.attrs['data-theme'], 'dark')
  })
})

describe('runtime', () => {
  it('set, toggle and subscribe', () => {
    const s = sandbox()
    s.run('color-scheme-head.js')
    s.run('color-scheme.js')
    const seen = []
    s.ctx.ColorScheme.subscribe((x) => seen.push(x.dark))
    s.ctx.ColorScheme.toggle()
    assert.equal(s.store['antora-theme-mode'], 'dark')
    assert.equal(s.store['antora-theme-system-snapshot'], 'light')
    assert.ok(s.classes.has('dark-theme'))
    s.ctx.ColorScheme.set('system')
    assert.equal(s.ctx.ColorScheme.mode(), 'system')
    assert.deepEqual(seen, [false, true, false])
    assert.throws(() => s.ctx.ColorScheme.set('blue'))
  })
  it('migrates the legacy antora-theme key', () => {
    const s = sandbox({ store: { 'antora-theme': 'dark' } })
    s.run('color-scheme.js')
    assert.equal(s.store['antora-theme-mode'], 'dark')
    assert.equal(s.store['antora-theme'], undefined)
    assert.ok(s.classes.has('dark-theme'))
  })
  it('an explicit choice expires when the OS preference changes', () => {
    const s = sandbox({ store: { 'antora-theme-mode': 'dark', 'antora-theme-system-snapshot': 'light' } })
    s.run('color-scheme.js')
    assert.ok(s.classes.has('dark-theme'))
    s.setSystem(true)
    assert.equal(s.ctx.ColorScheme.mode(), 'system')
    assert.ok(s.classes.has('dark-theme'))
    s.setSystem(false)
    assert.ok(!s.classes.has('dark-theme'))
  })
  it('publishes on UiBus when present', () => {
    const s = sandbox()
    const state = {}
    s.ctx.UiBus = { state: { set: (k, v) => { state[k] = v } } }
    s.run('color-scheme.js')
    s.ctx.ColorScheme.set('dark')
    assert.deepEqual(state, { 'color-scheme.mode': 'dark', 'color-scheme.dark': true })
  })
})
