'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { ensureLightDarkMode, labelsOf } = require('../lib/index.js')

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
  it('applies color-scheme first, then its own hook after the contract stylesheet and runtime after ui-bus.js, once', () => {
    const c = catalog({
      'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<link href="x.css">',
      'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>\n<script src="{{{uiRootPath}}}/js/ui-bus.js" defer></script>\n<script src="late.js"></script>',
    })
    assert.ok(ensureLightDarkMode(c, '_', { navbar: 'light' }))
    assert.ok(ensureLightDarkMode(c, '_', {}))
    const head = c.partial('head-styles').split('\n')
    assert.match(head[0], /site\.css/)
    assert.match(head[1], /color-scheme\.css/)
    assert.match(head[2], /light-dark-mode\.css/)
    assert.match(head[3], /dm-navbar" content="light"/)
    assert.match(head[4], /data-light-dark-mode-head/)
    assert.equal(c.partial('head-styles').split('data-light-dark-mode-head').length, 2)
    assert.doesNotMatch(c.partial('head-styles'), /<meta name="light-dark-mode-follow-system"/)
    const foot = c.partial('footer-scripts').split('\n')
    assert.match(foot[2], /light-dark-mode\.js" data-light-dark-mode-toggle="auto" data-light-dark-mode-placement="navbar" data-light-dark-mode-labels='[^']*' defer/)
    assert.deepEqual(c.findByType('asset').map((f) => f.path).sort(), ['css/color-scheme.css', 'css/light-dark-mode.css', 'js/light-dark-mode.js'])
  })
  it('falls back to head-meta, honours toggle: placed and follow_system: false', () => {
    const c = catalog({ 'head-meta': '<meta x>', 'footer-scripts': '<script src="site.js"></script>' })
    assert.ok(ensureLightDarkMode(c, '_', { toggle: 'placed', followSystem: false }))
    assert.match(c.partial('head-meta'), /color-scheme\.css[^\n]*\n<link[^\n]*light-dark-mode\.css/)
    assert.match(c.partial('head-meta'), /<meta name="light-dark-mode-follow-system" content="off">/)
    assert.match(c.partial('footer-scripts'), /data-light-dark-mode-toggle="placed"/)
  })
  it('labels option: defaults, per-key override, escaped into the script tag', () => {
    assert.deepEqual(labelsOf({}), { light: 'Light', dark: 'Dark', auto: 'Auto', group: 'Theme' })
    assert.deepEqual(labelsOf({ labels: { dark: 'Sombre', auto: '' } }), { light: 'Light', dark: 'Sombre', auto: 'Auto', group: 'Theme' })
    const c = catalog({ 'head-meta': '<meta x>', 'footer-scripts': '<script src="site.js"></script>' })
    assert.ok(ensureLightDarkMode(c, '_', { togglePlacement: 'footer', labels: { light: "Clair l'été", auto: 'Système <auto>' } }))
    const m = c.partial('footer-scripts').match(/data-light-dark-mode-labels='([^']*)'/)
    assert.ok(m, 'labels attribute present')
    const decoded = m[1].replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    assert.deepEqual(JSON.parse(decoded), { light: "Clair l'été", dark: 'Dark', auto: 'Système <auto>', group: 'Theme' })
  })
  it('passes color_scheme options through (live paint runtime loads before this one)', () => {
    const c = catalog({ 'head-styles': '<link href="css/site.css">', 'footer-scripts': '<script src="js/ui-bus.js"></script>' })
    assert.ok(ensureLightDarkMode(c, '_', { colorScheme: { livePaint: { enabled: true, paints: { a: 'css/a.css' } } } }))
    const foot = c.partial('footer-scripts')
    assert.ok(foot.indexOf('js/color-scheme.js') < foot.indexOf('js/light-dark-mode.js'))
  })
})

describe('CSS', () => {
  it('sets no color values', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'light-dark-mode.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|--[\w-]+\s*:/i)
  })
})

function sandbox ({ store = {}, systemDark = false, follow = true, button = null } = {}) {
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
      querySelector: (q) => (q.includes('follow-system') && !follow ? { content: 'off' } : null),
      getElementById: (id) => (id === 'theme-toggle' ? button : null), addEventListener: () => {},
      querySelectorAll: () => [],
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
    s.run('light-dark-mode-head.js')
    assert.ok(s.classes.has('dark-theme'))
    assert.equal(s.attrs['data-theme'], 'dark')
    assert.equal(s.attrs['data-light-dark-mode'], 'system')
  })
  it('keeps a saved antora-dark-mode choice (antora-theme-mode and legacy antora-theme)', () => {
    const a = sandbox({ store: { 'antora-theme-mode': 'light' }, systemDark: true })
    a.run('light-dark-mode-head.js')
    assert.equal(a.attrs['data-theme'], 'light')
    const b = sandbox({ store: { 'antora-theme': 'dark' } })
    b.run('light-dark-mode-head.js')
    assert.equal(b.attrs['data-theme'], 'dark')
  })
})

describe('runtime', () => {
  it('set, toggle and subscribe', () => {
    const s = sandbox()
    s.run('light-dark-mode-head.js')
    s.run('light-dark-mode.js')
    const seen = []
    s.ctx.LightDarkMode.subscribe((x) => seen.push(x.dark))
    s.ctx.LightDarkMode.toggle()
    assert.equal(s.store['antora-theme-mode'], 'dark')
    assert.equal(s.store['antora-theme-system-snapshot'], 'light')
    assert.ok(s.classes.has('dark-theme'))
    s.ctx.LightDarkMode.set('system')
    assert.equal(s.ctx.LightDarkMode.mode(), 'system')
    assert.deepEqual(seen, [false, true, false])
    assert.throws(() => s.ctx.LightDarkMode.set('blue'))
  })
  it('migrates the legacy antora-theme key', () => {
    const s = sandbox({ store: { 'antora-theme': 'dark' } })
    s.run('light-dark-mode.js')
    assert.equal(s.store['antora-theme-mode'], 'dark')
    assert.equal(s.store['antora-theme'], undefined)
    assert.ok(s.classes.has('dark-theme'))
  })
  it('an explicit choice expires when the OS preference changes', () => {
    const s = sandbox({ store: { 'antora-theme-mode': 'dark', 'antora-theme-system-snapshot': 'light' } })
    s.run('light-dark-mode.js')
    assert.ok(s.classes.has('dark-theme'))
    s.setSystem(true)
    assert.equal(s.ctx.LightDarkMode.mode(), 'system')
    assert.ok(s.classes.has('dark-theme'))
    s.setSystem(false)
    assert.ok(!s.classes.has('dark-theme'))
  })
  it('publishes on UiBus when present', () => {
    const s = sandbox()
    const state = {}
    s.ctx.UiBus = { state: { set: (k, v) => { state[k] = v } } }
    s.run('light-dark-mode.js')
    s.ctx.LightDarkMode.set('dark')
    assert.deepEqual(state, { 'light-dark-mode.mode': 'dark', 'light-dark-mode.dark': true, 'light-dark-mode.auto': true })
  })
})

describe('follow_system off', () => {
  it('defaults to light and ignores the OS preference', () => {
    const s = sandbox({ systemDark: true, follow: false })
    s.run('light-dark-mode-head.js')
    assert.equal(s.attrs['data-theme'], 'light')
    s.run('light-dark-mode.js')
    assert.equal(s.ctx.LightDarkMode.followsSystem(), false)
    assert.ok(!s.classes.has('dark-theme'))
    assert.equal(s.mqs.some((m) => m.listeners.length), false)
  })
  it('a saved choice never expires', () => {
    const s = sandbox({ store: { 'antora-theme-mode': 'dark', 'antora-theme-system-snapshot': 'dark' }, follow: false })
    s.run('light-dark-mode.js')
    assert.equal(s.ctx.LightDarkMode.mode(), 'dark')
    assert.ok(s.classes.has('dark-theme'))
  })
})

function button (children = 0) {
  const attrs = {}
  return {
    tagName: 'BUTTON', dataset: {}, innerHTML: children ? '<svg class="mine"></svg>' : '',
    children: { length: children }, classList: { add () {} },
    setAttribute: (k, v) => { attrs[k] = v }, attrs, listeners: [],
    addEventListener (t, fn) { this.listeners.push(fn) },
  }
}

describe('toggle', () => {
  it('keeps a placed button\'s own icons and still tracks aria state', () => {
    const b = button(1)
    const s = sandbox({ button: b })
    s.run('light-dark-mode.js')
    assert.equal(b.innerHTML, '<svg class="mine"></svg>')
    assert.equal(b.dataset.lightDarkModeIcons, 'own')
    b.listeners[0]()
    assert.equal(b.innerHTML, '<svg class="mine"></svg>')
    assert.equal(b.attrs['aria-pressed'], 'true')
    assert.equal(b.attrs['aria-label'], 'Switch to light mode')
  })
  it('fills an empty placed button with the built-in icon', () => {
    const b = button(0)
    const s = sandbox({ button: b })
    s.run('light-dark-mode.js')
    assert.match(b.innerHTML, /theme-icon/)
    b.listeners[0]()
    assert.match(b.innerHTML, /<circle/)
  })
})
