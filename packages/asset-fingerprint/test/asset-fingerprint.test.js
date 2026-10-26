'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { cpSync, mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createHash } = require('node:crypto')
const { fingerprintSite, globToRegExp, register } = require('../lib/index.js')

const fixture = join(__dirname, 'fixture', 'site')
const copy = () => { const d = mkdtempSync(join(tmpdir(), 'af-')); cpSync(fixture, d, { recursive: true }); return d }
const h = (p, n = 10) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, n)

test('globToRegExp', () => {
  assert.ok(globToRegExp('_/css/**').test('_/css/a/b.css'))
  assert.ok(globToRegExp('**/search-index.js').test('search-index.js'))
  assert.ok(globToRegExp('**/search-index.js').test('a/search-index.js'))
  assert.ok(!globToRegExp('_/css/*').test('_/css/a/b.css'))
})

test('rewrites CSS/JS URLs with a content hash; leaves others alone', (t) => {
  const d = copy(); t.after(() => rmSync(d, { recursive: true, force: true }))
  const r = fingerprintSite(d, { basePath: '/docs' })
  const html = readFileSync(join(d, 'sub', 'page.html'), 'utf8')
  const css = h(join(d, '_/css/site.css')); const js = h(join(d, '_/js/site.js'))
  assert.match(html, new RegExp(`href="\\.\\./_/css/site\\.css\\?v=${css}"`))
  assert.match(html, new RegExp(`href="/docs/_/css/site\\.css\\?x=1&v=${css}"`))
  assert.match(html, new RegExp(`href="\\.\\./_/css/site\\.css\\?v=${css}#top"`))
  assert.match(html, new RegExp(`src="\\.\\./_/js/site\\.js\\?v=${js}"`))
  assert.match(html, /src="https:\/\/cdn\.example\.com\/x\.js"/)
  assert.match(html, /site\.js\?v=keep"/)
  assert.match(html, /href="\.\.\/_\/img\/none\.svg"/)
  assert.strictEqual(r.urls, 4)
  assert.strictEqual(r.assets, 2)
})

test('idempotent, hash length and exclude', (t) => {
  const d = copy(); t.after(() => rmSync(d, { recursive: true, force: true }))
  fingerprintSite(d, { hashLength: 6, exclude: ['_/js/**'] })
  const once = readFileSync(join(d, 'sub', 'page.html'), 'utf8')
  assert.match(once, new RegExp(`site\\.css\\?v=${h(join(d, '_/css/site.css'), 6)}"`))
  assert.match(once, /src="\.\.\/_\/js\/site\.js"/)
  fingerprintSite(d, { hashLength: 6, exclude: ['_/js/**'] })
  assert.strictEqual(readFileSync(join(d, 'sub', 'page.html'), 'utf8'), once)
})

test('Antora extension fingerprints on sitePublished', (t) => {
  const d = copy(); t.after(() => rmSync(d, { recursive: true, force: true }))
  const handlers = {}
  const ctx = { on: (e, fn) => { handlers[e] = fn }, getLogger: () => ({ info () {} }) }
  register.call(ctx, { config: {} })
  handlers.sitePublished({ playbook: { site: { url: 'https://x.github.io/docs' } }, publications: [{ resolvedPath: d }] })
  assert.match(readFileSync(join(d, 'sub', 'page.html'), 'utf8'), /\/docs\/_\/css\/site\.css\?x=1&v=[0-9a-f]{10}"/)
})
