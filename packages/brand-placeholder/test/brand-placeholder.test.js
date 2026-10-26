'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyPlaceholder, siteSupplied, chassisFiles, checkTheme, RESERVED, UI_DIR } = require('../lib/index.js')

function catalog (files = []) {
  return {
    files,
    findByType: (t) => files.filter((f) => f.type === t),
    addFile: (f) => files.push(f),
    get: (rel) => files.find((f) => f.path === rel || (f.type === 'partial' && `partials/${f.stem}.hbs` === rel)),
  }
}

function tmp (files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-'))
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), body)
  }
  return dir
}

describe('files', () => {
  it('ships the placeholder set', () => {
    assert.deepEqual(RESERVED, [
      'img/apple-touch-icon.png', 'img/favicon.ico', 'img/favicon.svg', 'img/logo-dark.svg', 'img/logo-mono.svg', 'img/logo.svg',
      'partials/brand-logo.hbs', 'partials/brand-placeholder-logo.hbs', 'partials/head-icons.hbs',
    ])
  })
  it('SVGs and partials are UTF-8 without a BOM and labeled as a placeholder', () => {
    for (const f of chassisFiles().filter((x) => /\.(svg|hbs)$/.test(x.rel))) {
      assert.notEqual(f.contents[0], 0xef, `${f.rel} has a BOM`)
      if (f.rel.endsWith('.svg') || f.rel.endsWith('placeholder-logo.hbs')) assert.match(f.contents.toString(), /<title[^>]*>Placeholder logo - replace with your own<\/title>/, f.rel)
    }
  })
  it('the mono logo and the inline mark use currentColor', () => {
    assert.match(fs.readFileSync(path.join(UI_DIR, 'img/logo-mono.svg'), 'utf8'), /currentColor/)
    assert.match(fs.readFileSync(path.join(UI_DIR, 'partials/brand-placeholder-logo.hbs'), 'utf8'), /fill="currentColor"/)
  })
  it('favicon.ico and apple-touch-icon.png have the right signatures', () => {
    const ico = fs.readFileSync(path.join(UI_DIR, 'img/favicon.ico'))
    assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0])
    assert.ok(ico.readUInt16LE(4) >= 2, 'ico has 16 and 32 px images')
    assert.equal(fs.readFileSync(path.join(UI_DIR, 'img/apple-touch-icon.png')).subarray(1, 4).toString(), 'PNG')
  })
})

describe('applyPlaceholder (override order)', () => {
  it('adds every file to a UI that has none', () => {
    const c = catalog()
    const r = applyPlaceholder(c, '_')
    assert.equal(r.added.length, RESERVED.length)
    assert.equal(c.get('img/logo.svg').out.path, '_/img/logo.svg')
    assert.equal(c.findByType('partial').find((f) => f.stem === 'brand-logo').path, 'partials/brand-logo.hbs')
  })
  it('replaces a theme copy (theme cannot override), keeps a site copy', () => {
    const c = catalog([
      { type: 'asset', path: 'img/logo.svg', contents: Buffer.from('<svg>theme</svg>') },
      { type: 'asset', path: 'img/favicon.svg', contents: Buffer.from('<svg>site</svg>') },
      { type: 'partial', stem: 'head-icons', contents: Buffer.from('theme icons') },
    ])
    const r = applyPlaceholder(c, '_', new Set(['img/favicon.svg']))
    assert.deepEqual(r.replaced.sort(), ['img/logo.svg', 'partials/head-icons.hbs'])
    assert.deepEqual(r.kept, ['img/favicon.svg'])
    assert.match(c.get('img/logo.svg').contents.toString(), /Placeholder logo/)
    assert.equal(c.get('img/favicon.svg').contents.toString(), '<svg>site</svg>')
    assert.match(c.get('partials/head-icons.hbs').contents.toString(), /apple-touch-icon/)
  })
  it('is idempotent', () => {
    const c = catalog()
    applyPlaceholder(c, '_')
    const r = applyPlaceholder(c, '_')
    assert.deepEqual([r.added.length, r.replaced.length], [0, 0])
  })
})

describe('siteSupplied', () => {
  it('reads a supplemental directory relative to the playbook', () => {
    const dir = tmp({ 'sui/img/logo.svg': 'x', 'sui/partials/head-icons.hbs': 'y' })
    assert.deepEqual([...siteSupplied({ dir, ui: { supplementalFiles: './sui' } })].sort(), ['img/logo.svg', 'partials/head-icons.hbs'])
  })
  it('reads virtual entries', () => {
    assert.deepEqual([...siteSupplied({ ui: { supplementalFiles: [{ path: '/img/favicon.svg', contents: 'x' }, { path: 'css/a.css' }] } })], ['img/favicon.svg', 'css/a.css'])
  })
  it('is empty without supplemental files', () => {
    assert.equal(siteSupplied({ ui: {} }).size, 0)
  })
})

describe('checkTheme (validator)', () => {
  it('warns on own copies of reserved files and on logo-like images', () => {
    const dir = tmp({ 'img/logo.svg': '<svg>brand</svg>', 'img/acme-logo.png': 'x', 'img/brand/mark.svg': 'x', 'img/arrow.svg': 'x' })
    const w = checkTheme(dir)
    assert.equal(w.length, 3)
    assert.match(w.join('\n'), /img\/logo\.svg: theme ships its own copy/)
    assert.match(w.join('\n'), /img\/acme-logo\.png: looks like a brand/)
  })
  it('accepts baked chassis copies and allow-listed names', () => {
    const dir = tmp({ 'img/vcs/github-mark.svg': 'x' })
    fs.cpSync(UI_DIR, dir, { recursive: true })
    assert.deepEqual(checkTheme(dir, ['img/vcs/']), [])
  })
})
