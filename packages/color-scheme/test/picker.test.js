'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { pickerConfig, ensureColorScheme, addPickerPage, PICKER_PAGE } = require('../lib/index.js')

const three = { a: 'css/a.css', b: 'css/b.css', c: 'css/c.css' }
const cfg = (picker, paints = three) => ({ livePaint: { enabled: true, paints, ...(picker === undefined ? {} : { picker }) } })

function catalog (partials) {
  const files = Object.entries(partials).map(([stem, body]) => ({ type: 'partial', stem, contents: Buffer.from(body) }))
  return {
    files,
    findByType: (t) => files.filter((f) => f.type === t),
    addFile: (f) => files.push(f),
    partial: (stem) => files.find((f) => f.type === 'partial' && f.stem === stem)?.contents.toString(),
    asset: (p) => files.find((f) => f.path === p)?.contents.toString(),
  }
}
const ui = (extra = {}) => catalog({
  'head-styles': '<link rel="stylesheet" href="{{{uiRootPath}}}/css/site.css">',
  'footer-content': '<footer class="footer">\n<p>Footer</p>\n</footer>',
  'footer-scripts': '<script src="{{{uiRootPath}}}/js/site.js"></script>',
  ...extra,
})

describe('picker options', () => {
  it('auto (default): on only when the site ships more than two schemes', () => {
    assert.equal(pickerConfig(cfg(undefined, { a: 'css/a.css', b: 'css/b.css' })), null)
    assert.deepEqual(pickerConfig(cfg()), { placement: 'footer', label: 'Color schemes', previewPage: null })
    assert.equal(pickerConfig({}), null, 'needs live paint')
  })
  it('can be forced on, turned off or moved', () => {
    assert.ok(pickerConfig(cfg(true, { a: 'css/a.css' })))
    assert.equal(pickerConfig(cfg(false)), null)
    assert.equal(pickerConfig(cfg({ enabled: false })), null)
    assert.equal(pickerConfig(cfg({ placement: 'none' })).placement, 'none')
    assert.throws(() => pickerConfig(cfg({ placement: 'navbar' })))
    assert.throws(() => pickerConfig(cfg({ enabled: 'yes' })))
  })
})

describe('picker link (footer by default)', () => {
  it('adds the partial and includes it before </footer>', () => {
    const c = ui()
    ensureColorScheme(c, '_', cfg())
    assert.match(c.partial('color-scheme-picker-link'), /class="color-scheme-picker-link" href="\{\{\{uiRootPath\}\}\}\/color-schemes\.html">Color schemes</)
    assert.match(c.partial('footer-content'), /\{\{> color-scheme-picker-link\}\}\n<\/footer>/)
  })
  it('keeps a link partial the site or layout provides, and does not include it twice', () => {
    const c = ui({ 'color-scheme-picker-link': '<a class="mine">Themes</a>', header: '{{> color-scheme-picker-link}}' })
    ensureColorScheme(c, '_', cfg())
    assert.equal(c.partial('color-scheme-picker-link'), '<a class="mine">Themes</a>')
    assert.doesNotMatch(c.partial('footer-content'), /picker-link/)
  })
  it('placement none: partial only, nothing in the footer; off: nothing at all', () => {
    const c = ui()
    ensureColorScheme(c, '_', cfg({ placement: 'none' }))
    assert.ok(c.partial('color-scheme-picker-link'))
    assert.doesNotMatch(c.partial('footer-content'), /picker-link/)
    const d = ui()
    ensureColorScheme(d, '_', cfg(false))
    assert.equal(d.partial('color-scheme-picker-link'), undefined)
  })
})

describe('picker page', () => {
  it('reuses the UI stylesheets and hooks with relative paths and previews the start page', () => {
    const c = ui()
    ensureColorScheme(c, '_', cfg())
    addPickerPage(c, '_', pickerConfig(cfg()), '/docs/1.0/index.html', 'My Docs')
    const html = c.files.find((f) => /color-schemes\.html$/.test(f.out?.path || f.path || '')).contents.toString()
    assert.match(html, /<link rel="stylesheet" href="\.\/css\/site\.css">/)
    assert.match(html, /<script data-color-scheme-live-paint>/)
    assert.match(html, /root: '\.'/)
    assert.match(html, /data-preview="\.\.\/docs\/1\.0\/index\.html"/)
    assert.match(html, /<title>Color schemes \| My Docs<\/title>/)
    assert.match(html, /js\/color-scheme\.js/)
    assert.doesNotMatch(html, /\{\{/)
    assert.equal(PICKER_PAGE, 'color-schemes.html')
  })
})
