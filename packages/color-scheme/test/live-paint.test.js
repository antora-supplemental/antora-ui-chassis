'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { ensureColorScheme, livePaintConfig } = require('../lib/index.js')

const PAINT_HEAD = fs.readFileSync(path.join(__dirname, '..', 'js', 'color-scheme-paint-head.js'), 'utf8')
const RUNTIME = fs.readFileSync(path.join(__dirname, '..', 'js', 'color-scheme.js'), 'utf8')

class El {
  constructor (name, attrs = {}) { this.nodeName = name.toUpperCase(); this.attrs = { ...attrs }; this.parentNode = null }
  getAttribute (k) { return k in this.attrs ? this.attrs[k] : null }
  setAttribute (k, v) { this.attrs[k] = String(v) }
  hasAttribute (k) { return k in this.attrs }
  removeAttribute (k) { delete this.attrs[k] }
  set rel (v) { this.attrs.rel = v }
}

function page ({ search = '', cookie = '', links = [], dark = false, extra = {} } = {}) {
  const jar = {}
  cookie.split(';').map((s) => s.trim()).filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); jar[k] = v })
  const writes = []
  const head = {
    children: [],
    appendChild (n) { n.parentNode = this; this.children.push(n) },
    insertBefore (n, ref) { n.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n) },
    removeChild (n) { this.children.splice(this.children.indexOf(n), 1); n.parentNode = null },
  }
  const script = new El('script')
  head.appendChild(script)
  links.forEach((h) => head.appendChild(new El('link', { rel: 'stylesheet', href: h })))
  const htmlAttrs = new El('html')
  const listeners = {}
  let observer
  const document = {
    head,
    currentScript: script,
    documentElement: Object.assign(htmlAttrs, { classList: { contains: (c) => c === 'dark-theme' && dark, toggle () {}, add () {}, remove () {} } }),
    get cookie () { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
    set cookie (v) {
      writes.push(v)
      const [kv] = v.split(';')
      const [k, val] = kv.split('=')
      if (/Max-Age=0/.test(v)) delete jar[k]
      else jar[k] = val
    },
    createElement: (n) => new El(n),
    querySelectorAll: () => head.children.filter((n) => n.nodeName === 'LINK'),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn) },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)) },
  }
  const win = {
    document,
    location: { search },
    URLSearchParams,
    MutationObserver: class { constructor (cb) { observer = cb } observe () {} disconnect () {} },
    __colorSchemeLivePaint: {
      param: 'paint', cookie: 'cs-paint', cookiePath: '/', root: '../_',
      paints: { default: 'css/default-paint.css', alt: 'css/alt-paint.css', ext: 'https://cdn.example.org/v/site-paint.css' },
      allowOrigins: ['https://registry.antora-supplemental.org'],
      ...extra,
    },
  }
  win.window = win
  const ctx = vm.createContext(win)
  vm.runInContext(PAINT_HEAD, ctx)
  const live = () => head.children.find((n) => n.hasAttribute && n.hasAttribute('data-color-scheme-paint'))
  const parse = (h) => { const l = new El('link', { rel: 'stylesheet', href: h }); head.appendChild(l); observer && observer([{ addedNodes: [l] }]); return l }
  return { win, ctx, jar, writes, head, live, parse, html: htmlAttrs, fire: (t) => (listeners[t] || []).forEach((fn) => fn()) }
}

describe('livePaint config (build time)', () => {
  it('is off unless enabled: true', () => {
    assert.equal(livePaintConfig({}), null)
    assert.equal(livePaintConfig({ livePaint: { paints: { a: 'css/a.css' } } }), null)
  })
  it('rejects bad ids, script/data URLs, quotes and malformed origins', () => {
    const lp = (o) => () => livePaintConfig({ livePaint: { enabled: true, paints: { a: 'css/a.css' }, ...o } })
    assert.throws(lp({ paints: { 'bad id': 'x.css' } }))
    assert.throws(lp({ paints: { reset: 'x.css' } }))
    assert.throws(lp({ paints: { 'my-paint': 'x.css' } }))
    assert.throws(lp({ paints: { a: 'javascript:alert(1)' } }))
    assert.throws(lp({ paints: { a: 'x.css" onload="y' } }))
    assert.throws(lp({ paints: {} }))
    assert.throws(lp({ allowOrigins: ['*'] }))
    assert.throws(lp({ allowOrigins: ['https://a.org/path'] }))
  })
  it('inlines the paint hook after the scheme hook only when enabled', () => {
    const cat = (cfg) => {
      const files = [{ type: 'partial', stem: 'head-styles', contents: Buffer.from('<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">') }, { type: 'partial', stem: 'footer-scripts', contents: Buffer.from('') }]
      ensureColorScheme({ findByType: (t) => files.filter((f) => f.type === t), addFile: (f) => files.push(f) }, '_', cfg)
      return files[0].contents.toString()
    }
    assert.doesNotMatch(cat({}), /data-color-scheme-live-paint/)
    const h = cat({ livePaint: { enabled: true, paints: { a: 'css/a.css' } } })
    assert.ok(h.indexOf('data-color-scheme-head') < h.indexOf('data-color-scheme-live-paint'))
    assert.match(h, /root: '\{\{\{uiRootPath\}\}\}'/)
  })
})

describe('live paint head hook', () => {
  it('only loads ids from the allowlist; a raw URL in the query is ignored', () => {
    const p = page({ search: '?paint=https://evil.example/x.css' })
    assert.equal(p.live(), undefined)
    assert.equal(p.win.ColorSchemePaint.get(), null)
    assert.equal(p.win.ColorSchemePaint.set('https://evil.example/x.css'), false)
    assert.equal(p.win.ColorSchemePaint.set('nope'), false)
    assert.equal(p.writes.length, 0)
  })
  it('query beats cookie; a scheme that fits the current slot is saved in that slot (SameSite=Lax, one year)', () => {
    const p = page({ search: '?paint=alt', cookie: 'cs-paint=ext' })
    assert.equal(p.win.ColorSchemePaint.get(), 'alt')
    assert.equal(p.live().getAttribute('href'), '../_/css/alt-paint.css')
    assert.ok(p.writes.some((w) => /^cs-paint-slots=alt\.-; Path=\/; SameSite=Lax; Max-Age=31536000$/.test(w)))
    assert.equal(p.win.ColorSchemePaint.offSlot(), null)
  })
  it('falls back to the cookie; an unknown cookie id is cleared', () => {
    const p = page({ cookie: 'cs-paint=ext' })
    assert.equal(p.live().getAttribute('href'), 'https://cdn.example.org/v/site-paint.css')
    const q = page({ cookie: 'cs-paint=gone' })
    assert.equal(q.live(), undefined)
    assert.match(q.writes[0], /Max-Age=0/)
  })
  it('?paint=reset clears the cookie and keeps the built-in paint', () => {
    const p = page({ search: '?paint=reset', cookie: 'cs-paint=alt', links: ['../_/css/default-paint.css'] })
    assert.equal(p.jar['cs-paint'], undefined)
    assert.equal(p.live(), undefined)
    assert.equal(p.head.children[1].getAttribute('media'), null)
  })
  it('no FOUC: the live link is inserted synchronously and a base paint parsed later is disabled', () => {
    const p = page({ search: '?paint=alt' })
    assert.equal(p.head.children[1], p.live(), 'live link sits right after the hook script')
    assert.equal(p.html.getAttribute('data-color-scheme-paint'), 'alt')
    const base = p.parse('../_/css/default-paint.css?v=1')
    assert.equal(base.getAttribute('media'), 'not all')
    p.win.ColorSchemePaint.set('reset')
    assert.equal(base.getAttribute('media'), null)
    assert.equal(p.live(), undefined)
  })
  it('choosing the base paint uses the base link instead of a second copy', () => {
    const p = page({ search: '?paint=default' })
    p.parse('../_/css/default-paint.css')
    p.fire('DOMContentLoaded')
    assert.equal(p.live(), undefined)
  })
})

describe('runtime: setPaint, events and postMessage', () => {
  function boot (opts) {
    const p = page(opts)
    const w = p.win
    const events = []
    const msgListeners = []
    const posted = []
    const mq = { matches: false, addEventListener () {} }
    Object.assign(w, {
      localStorage: { getItem: () => null, setItem () {}, removeItem () {} },
      matchMedia: () => mq,
      setTimeout, clearTimeout,
      CustomEvent: class { constructor (type, init) { this.type = type; this.detail = init.detail } },
      addEventListener: (t, fn) => { if (t === 'message') msgListeners.push(fn) },
      UiBus: { state: { set: (k, v) => events.push(['bus', k, v]) } },
    })
    w.parent = w
    const d = w.document
    Object.assign(d, { readyState: 'complete', visibilityState: 'visible', getElementById: () => null, querySelector: () => null })
    d.documentElement.classList = { contains: () => false, toggle () {}, add () {}, remove () {} }
    d.addEventListener('color-scheme:paint', (e) => events.push(['dom', e.detail.paint]))
    vm.runInContext(RUNTIME, p.ctx)
    const send = (origin, data) => msgListeners.forEach((fn) => fn({ origin, data, source: { postMessage: (m, o) => posted.push([m, o]) } }))
    return { ...p, events, send, posted }
  }
  it('exposes setPaint/getPaint and announces on UiBus and as a DOM event', () => {
    const b = boot()
    b.events.length = 0
    assert.equal(b.win.ColorScheme.setPaint('alt'), true)
    assert.equal(b.win.ColorScheme.getPaint(), 'alt')
    assert.deepEqual(b.events.filter((e) => e[1] === 'color-scheme.paint' || e[0] === 'dom'), [['bus', 'color-scheme.paint', 'alt'], ['dom', 'alt']])
    assert.equal(b.win.ColorScheme.setPaint('<script>'), false)
  })
  it('accepts postMessage only from allowOrigins, and replies to that origin', () => {
    const b = boot()
    b.send('https://evil.example', { type: 'color-scheme:paint', id: 'alt' })
    assert.equal(b.win.ColorScheme.getPaint(), null)
    assert.equal(b.posted.length, 0)
    b.send('https://registry.antora-supplemental.org', { type: 'color-scheme:paint', id: 'alt' })
    assert.equal(b.win.ColorScheme.getPaint(), 'alt')
    assert.equal(b.posted[0][1], 'https://registry.antora-supplemental.org')
    assert.equal(b.posted[0][0].paint, 'alt')
    b.send('https://registry.antora-supplemental.org', { type: 'color-scheme:paint', id: 'https://evil.example/x.css' })
    assert.equal(b.win.ColorScheme.getPaint(), 'alt')
  })
  it('forwards color-scheme:mode to LightDarkMode when that layer is loaded', () => {
    const b = boot()
    const calls = []
    b.win.LightDarkMode = { set: (m, o) => calls.push([m, o.animate]), mode: () => 'dark' }
    b.send('https://registry.antora-supplemental.org', { type: 'color-scheme:mode', mode: 'dark' })
    assert.deepEqual(calls, [['dark', false]])
    assert.equal(b.posted[0][0].mode, 'dark')
  })
})

describe('slots', () => {
  const META = {
    meta: { default: { slots: ['light', 'dark'] }, alt: { slots: ['dark'], base: 'dark' }, ext: { label: 'Pink', slots: [], base: 'light' } },
    slots: { light: null, dark: 'alt' },
  }
  it('build time: validates declared slots, slot assignment and slot_policy', () => {
    const lp = (o) => livePaintConfig({ livePaint: { enabled: true, ...o } })
    const ok = lp({ paints: { a: { href: 'css/a.css', slots: ['dark'], base: 'dark' }, b: 'css/b.css' }, slots: { dark: 'a', light: 'b' } })
    assert.deepEqual(ok.slots, { light: 'b', dark: 'a' })
    assert.throws(() => lp({ paints: { a: { href: 'css/a.css', slots: ['dark'] } }, slots: { light: 'a' } }), /light/)
    assert.deepEqual(lp({ paints: { a: { href: 'css/a.css', slots: ['dark'] } }, slots: { light: 'a' }, slotPolicy: 'any' }).slots.light, 'a')
    assert.throws(() => lp({ paints: { a: { href: 'css/a.css', slots: ['sepia'] } } }))
    assert.throws(() => lp({ paints: { a: 'css/a.css' }, slotPolicy: 'some' }))
    assert.throws(() => lp({ paints: { a: 'css/a.css' }, slots: { dark: 'nope' } }))
    assert.throws(() => lp({ paints: { builtin: 'css/a.css' } }))
  })
  it('runtime: the active scheme follows the light/dark slot', () => {
    const p = page({ extra: META })
    assert.equal(p.win.ColorSchemePaint.get(), null)
    p.win.ColorSchemePaint.sync(true)
    assert.equal(p.win.ColorSchemePaint.get(), 'alt')
    p.win.ColorSchemePaint.sync(false)
    assert.equal(p.win.ColorSchemePaint.get(), null)
  })
  it('runtime: assign refuses a slot the scheme does not fit, unless slot_policy is any', () => {
    const p = page({ extra: META })
    assert.equal(p.win.ColorSchemePaint.assign('light', 'alt'), false)
    assert.equal(p.win.ColorSchemePaint.assign('dark', 'default'), true)
    const q = page({ extra: { ...META, slotPolicy: 'any' } })
    assert.equal(q.win.ColorSchemePaint.assign('light', 'alt'), true)
  })
  it('an off-slot pick pins the scheme for the session; a slot scheme or auto re-enables automation', () => {
    const p = page({ extra: META })
    const P = p.win.ColorSchemePaint
    assert.equal(P.set('ext'), true)
    assert.equal(JSON.stringify(P.offSlot()), JSON.stringify({ id: 'ext', base: 'light' }))
    assert.equal(p.jar['cs-paint'], 'ext')
    assert.ok(p.writes.some((w) => /^cs-paint=ext; Path=\/; SameSite=Lax$/.test(w)), 'session cookie, no Max-Age')
    assert.equal(p.html.getAttribute('data-color-scheme-off-slot'), 'ext')
    P.sync(true)
    assert.equal(P.get(), 'ext', 'still pinned when light/dark changes')
    assert.equal(P.set('auto'), true)
    assert.equal(P.offSlot(), null)
    assert.equal(P.get(), 'alt')
    assert.equal(p.html.getAttribute('data-color-scheme-off-slot'), null)
    P.set('ext')
    P.set('alt') // fits the dark slot: back to automation
    assert.equal(P.offSlot(), null)
  })
  it('the off-slot session survives a reload; slots come from the one-year cookie', () => {
    const p = page({ extra: META, cookie: 'cs-paint=ext; cs-paint-slots=default.alt' })
    assert.equal(p.win.ColorSchemePaint.offSlot().id, 'ext')
    assert.equal(JSON.stringify(p.win.ColorSchemePaint.slots()), JSON.stringify({ light: 'default', dark: 'alt' }))
    const q = page({ extra: META, cookie: 'cs-paint-slots=alt.alt' })
    assert.equal(q.win.ColorSchemePaint.slots().light, null, 'a saved slot the scheme does not fit is ignored')
  })
  it('?cs-preview shows a scheme without saving anything', () => {
    const p = page({ extra: META, search: '?cs-preview=ext&cs-preview-mode=dark' })
    assert.equal(p.win.ColorSchemePaint.get(), 'ext')
    assert.equal(p.win.ColorSchemePaint.preview(), 'dark')
    assert.equal(p.writes.length, 0)
  })
})
