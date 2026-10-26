'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pickerConfig, ensureColorScheme, schemesListener, paintSchemes, parseManifest, schemesConfig, PICKER_PAGE } = require('../lib/index.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'scheme-demo-paint')
const TWO = '/* @color-schemes\n{ "light": { "label": "Light" }, "dark": { "label": "Dark" } }\n*/\n:root { --x: 1 }'
const FOUR = fs.readFileSync(path.join(FIXTURE, 'scheme-demo-paint.css'), 'utf8')

function catalog (partials, assets = {}) {
  const files = Object.entries(partials).map(([stem, body]) => ({ type: 'partial', stem, contents: Buffer.from(body) }))
  for (const [p, body] of Object.entries(assets)) files.push({ type: 'asset', path: p, contents: Buffer.from(body) })
  return {
    files,
    findByType: (t) => files.filter((f) => f.type === t),
    addFile: (f) => files.push(f),
    partial: (stem) => files.find((f) => f.type === 'partial' && f.stem === stem)?.contents.toString(),
    asset: (p) => files.find((f) => f.path === p)?.contents.toString(),
  }
}
/** A UI with a paint stylesheet linked after site.css, then the build steps up to contentClassified. */
function build (paintCss, config = {}, extra = {}) {
  const c = catalog({
    'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<link rel="stylesheet" href="{{{uiRootPath}}}/css/paint.css">',
    'footer-content': '<footer class="footer">\n<p>Footer</p>\n</footer>',
    'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>',
    ...extra,
  }, paintCss === null ? {} : { 'css/paint.css': paintCss })
  ensureColorScheme(c, '_', config)
  schemesListener(config)({ playbook: { ui: { outputDir: '_' }, site: { title: 'My Docs' } }, contentCatalog: { getSiteStartPage: () => ({ pub: { url: '/docs/1.0/index.html' } }) }, uiCatalog: c })
  return c
}
const pickerPage = (c) => c.files.find((f) => /color-schemes\.html$/.test(f.out?.path || f.path || ''))

describe('paint schemes', () => {
  it('reads the @color-schemes manifest of the linked paint', () => {
    assert.deepEqual(Object.keys(paintSchemes(build(FOUR)).schemes), ['light', 'dark', 'pink', 'midnight', 'neon'])
    const s = paintSchemes(build(FOUR)).schemes
    assert.deepEqual(s.pink, { label: 'Pink', slots: ['light'], base: 'light' })
    assert.deepEqual(s.midnight, { label: 'Midnight', slots: ['dark'], base: 'dark' })
    assert.deepEqual(s.dark, { label: 'Dark', slots: ['dark'], base: 'dark' })
    assert.deepEqual(s.neon, { label: 'Neon', slots: [], base: 'dark' }, 'slots: none')
  })
  it('a paint without a manifest has light and dark; the site can add, relabel or drop schemes', () => {
    assert.deepEqual(Object.keys(paintSchemes(build(null)).schemes), ['light', 'dark'])
    const s = paintSchemes(build(TWO), { schemes: { sepia: { label: 'Sepia', base: 'light' }, light: { label: 'Clair' } } }).schemes
    assert.equal(s.light.label, 'Clair')
    assert.deepEqual(s.sepia.slots, ['light'])
    assert.deepEqual(Object.keys(paintSchemes(build(FOUR), { schemes: { pink: false } }).schemes), ['light', 'dark', 'midnight', 'neon'])
  })
  it('rejects bad manifests and scheme ids', () => {
    assert.throws(() => parseManifest('/* @color-schemes { nope */'), /invalid @color-schemes/)
    assert.throws(() => paintSchemes(build(null), { schemes: { 'my-scheme': {} } }), /invalid scheme id/)
    assert.throws(() => paintSchemes(build(null), { schemes: { x: { slots: ['sepia'] } } }), /slots/)
    assert.deepEqual(paintSchemes(build(null), { schemes: { x: { slots: 'both' } } }).schemes.x.slots, ['light', 'dark'])
    assert.throws(() => paintSchemes(build(null), { schemes: { light: { slots: 'none' } } }), /must fit/)
    assert.throws(() => paintSchemes(build(null), { schemes: { dark: false } }), /must provide a 'dark'/)
  })
  it('slots pick from the paint schemes and must fit unless slot_policy is any', () => {
    const { schemes } = paintSchemes(build(FOUR))
    assert.deepEqual(schemesConfig(schemes, { slots: { light: 'pink' } }).slots, { light: 'pink', dark: 'dark' })
    assert.throws(() => schemesConfig(schemes, { slots: { light: 'midnight' } }), /does not declare the light slot/)
    assert.equal(schemesConfig(schemes, { slots: { light: 'midnight' }, slotPolicy: 'any' }).slots.light, 'midnight')
    assert.throws(() => schemesConfig(schemes, { slots: { dark: 'neon' }, slotPolicy: 'any' }), /slot none/)
    assert.throws(() => schemesConfig(schemes, { slots: { dark: 'valentus' } }), /not a scheme of the active paint/)
  })
})

describe('picker options', () => {
  it('auto (default): on only when the active paint has more than two schemes', () => {
    assert.equal(pickerConfig({}, 2), null)
    assert.deepEqual(pickerConfig({}, 3), { placement: 'footer', label: 'Color schemes', previewPage: null })
  })
  it('can be forced on, turned off or moved', () => {
    assert.ok(pickerConfig({ picker: true }, 2))
    assert.equal(pickerConfig({ picker: false }, 4), null)
    assert.equal(pickerConfig({ picker: { enabled: false } }, 4), null)
    assert.equal(pickerConfig({ picker: { placement: 'none' } }, 4).placement, 'none')
    assert.throws(() => pickerConfig({ picker: { placement: 'navbar' } }, 4))
    assert.throws(() => pickerConfig({ picker: { enabled: 'yes' } }, 4))
  })
})

describe('build output', () => {
  it('a two-scheme paint (default-paint, Valentus Paint) gets no hook, runtime, link or page', () => {
    for (const css of [TWO, fs.readFileSync(path.join(__dirname, '..', '..', 'default-paint', 'css', 'default-paint.css'), 'utf8')]) {
      const c = build(css)
      assert.doesNotMatch(c.partial('head-styles'), /data-color-scheme-schemes/)
      assert.doesNotMatch(c.partial('footer-content'), /picker-link/)
      assert.equal(c.asset('js/color-scheme.js'), undefined)
      assert.equal(pickerPage(c), undefined)
    }
  })
  it('custom slots on a two-scheme paint add the hook but no picker', () => {
    const c = build(TWO, { schemes: { sepia: { base: 'light' } }, slots: { light: 'sepia' }, picker: false })
    assert.match(c.partial('head-styles'), /window\.__colorSchemes = \{.*"slots":\{"light":"sepia","dark":"dark"\}/)
    assert.equal(pickerPage(c), undefined)
  })
  it('more than two schemes: hook before the light/dark hook, runtime before light-dark-mode.js, footer link', () => {
    const c = build(FOUR, {}, {
      'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">\n<script data-light-dark-mode-head>x</script>\n<link rel="stylesheet" href="{{{uiRootPath}}}/css/paint.css">',
      'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>\n<script src="{{{uiRootPath}}}/js/light-dark-mode.js" defer></script>',
    })
    const head = c.partial('head-styles')
    assert.ok(head.indexOf('data-color-scheme-schemes') < head.indexOf('data-light-dark-mode-head'))
    assert.match(head, /"pink":\{"label":"Pink","slots":\["light"\],"base":"light"\}/)
    const foot = c.partial('footer-scripts')
    assert.ok(foot.indexOf('js/color-scheme.js') < foot.indexOf('js/light-dark-mode.js'))
    assert.match(c.partial('color-scheme-picker-link'), /class="color-scheme-picker-link" href="\{\{\{uiRootPath\}\}\}\/color-schemes\.html">Color schemes</)
    assert.match(c.partial('footer-content'), /\{\{> color-scheme-picker-link\}\}\n<\/footer>/)
  })
  it('runs once when both color-scheme and light-dark-mode register the listener', () => {
    const c = build(FOUR)
    schemesListener({})({ playbook: {}, contentCatalog: {}, uiCatalog: c })
    assert.equal(c.partial('head-styles').split('data-color-scheme-schemes').length, 2)
  })
  it('keeps a link partial the site or layout provides, and does not include it twice', () => {
    const c = build(FOUR, {}, { 'color-scheme-picker-link': '<a class="mine">Themes</a>', header: '{{> color-scheme-picker-link}}' })
    assert.equal(c.partial('color-scheme-picker-link'), '<a class="mine">Themes</a>')
    assert.doesNotMatch(c.partial('footer-content'), /picker-link/)
  })
  it('placement none: partial only, nothing in the footer', () => {
    const c = build(FOUR, { picker: { placement: 'none' } })
    assert.ok(c.partial('color-scheme-picker-link'))
    assert.doesNotMatch(c.partial('footer-content'), /picker-link/)
  })
  it('with a content catalog the picker is a site page in the default layout; only none schemes get a visit-only button', () => {
    const c = catalog({ 'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/paint.css">', 'footer-content': '<footer class="footer">\n</footer>', 'footer-scripts': '<script src="{{{uiRootPath}}}/js/light-dark-mode.js"></script>' }, { 'css/paint.css': FOUR })
    ensureColorScheme(c, '_', {})
    const added = []
    const start = { src: { component: 'docs', version: '1.0' }, pub: { url: '/docs/1.0/index.html' } }
    const cc = { getSiteStartPage: () => start, getById: () => undefined, addFile: (f) => { f.pub = { url: '/docs/1.0/' + f.src.relative.replace(/\.adoc$/, '.html') }; f.out = { path: f.pub.url.slice(1) }; added.push(f); return f } }
    schemesListener({})({ playbook: { ui: { outputDir: '_' } }, contentCatalog: cc, uiCatalog: c })
    assert.equal(added.length, 1)
    const page = added[0]
    assert.equal(page.mediaType, 'text/html')
    assert.equal(page.asciidoc.doctitle, 'Color schemes')
    const html = page.contents.toString()
    assert.match(html, /href="\.\.\/\.\.\/_\/css\/color-scheme-picker\.css"/)
    assert.match(html, /data-preview="index\.html"/)
    assert.doesNotMatch(html, /<html|<h1|data-light-dark-mode-switch/, 'the layout supplies the document, title and toggle')
    assert.match(c.partial('color-scheme-picker-link'), /href="\{\{\{siteRootPath\}\}\}\/docs\/1\.0\/color-schemes\.html"/)
    assert.equal(pickerPage(c), undefined, 'no standalone page')
    const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'color-scheme-picker.js'), 'utf8')
    assert.match(js, /if \(none\) btn\('Use for this visit/)
  })
  it('the picker page reuses the UI stylesheets and hooks with relative paths and previews the start page', () => {
    const html = pickerPage(build(FOUR)).contents.toString()
    assert.match(html, /<link rel="stylesheet" href="\.\/css\/site\.css">/)
    assert.match(html, /<link rel="stylesheet" href="\.\/css\/paint\.css">/)
    assert.match(html, /<script data-color-scheme-schemes>/)
    assert.match(html, /data-preview="\.\.\/docs\/1\.0\/index\.html"/)
    assert.match(html, /<title>Color schemes \| My Docs<\/title>/)
    assert.match(html, /js\/color-scheme\.js/)
    assert.match(html, /color schemes this site's paint provides/)
    assert.doesNotMatch(html, /\{\{/)
    assert.equal(PICKER_PAGE, 'color-schemes.html')
  })
  it('live paint stays separate: it adds no picker', () => {
    const c = build(TWO, { livePaint: { enabled: true, paints: { a: 'css/a.css', b: 'css/b.css', c: 'css/c.css' } } })
    assert.equal(pickerPage(c), undefined)
    assert.match(c.partial('head-styles'), /data-color-scheme-live-paint/)
  })
})
