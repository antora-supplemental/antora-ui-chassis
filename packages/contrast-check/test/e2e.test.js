// Browser end-to-end runs over the pass/fail/warn fixtures. Skipped without Chrome.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bin = path.join(here, '..', 'bin', 'contrast-check.js')
const chrome = process.env.CONTRAST_CHECK_CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
let deps = true
try { await import('playwright-core'); await import('axe-core') } catch { deps = false }
const skip = !chrome ? 'no Chrome found (set CONTRAST_CHECK_CHROME)' : !deps ? 'playwright-core/axe-core not installed' : false

function check (name, ...args) {
  try {
    const out = execFileSync(process.execPath, [bin, path.join(here, 'fixtures', name), '--json', ...args], { env: { ...process.env, CONTRAST_CHECK_CHROME: chrome, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: '' }, encoding: 'utf8' })
    return { code: 0, ...JSON.parse(out) }
  } catch (e) { return { code: e.status, ...JSON.parse(e.stdout) } }
}
const rules = (r) => new Set(r.findings.map((f) => `${f.level}:${f.rule}`))

describe('fixtures (browser)', { skip }, () => {
  it('pass: no findings, exit 0', () => {
    const r = check('pass'); assert.equal(r.code, 0); assert.deepEqual(r.findings, [])
    assert.deepEqual(r.meta.schemes, ['light/light', 'dark/dark'])
  })
  it('fail: axe, token and focus errors, exit 1', () => {
    const r = check('fail'); const s = rules(r)
    assert.equal(r.code, 1)
    for (const k of ['error:color-contrast', 'error:token-pair', 'error:focus-not-visible']) assert.ok(s.has(k), k)
    const f = r.findings.find((x) => x.rule === 'color-contrast')
    assert.ok(f.fg && f.bg && f.ratio < 4.5 && f.suggestion && f.page === '/index.html')
  })
  it('state: hidden search results pass statically, fail in dark once typed', () => {
    const s = check('state', '--no-focus'); assert.equal(s.code, 0); assert.equal(s.counts.error, 0)
    const r = check('state', '--no-focus', '--state', 'search-results')
    assert.equal(r.code, 1); assert.deepEqual(r.meta.states, ['search-results'])
    const bad = r.findings.filter((f) => f.level === 'error' && f.state === 'search-results')
    assert.ok(bad.length && bad.every((f) => f.mode === 'dark'), JSON.stringify(r.findings))
    for (const st of ['fixtures', 'reveal-hidden']) {
      const x = check('state', '--no-focus', '--state', st)
      assert.equal(x.code, 1, st); assert.ok(x.findings.some((f) => f.state === st && f.mode === 'dark' && f.rule === 'color-contrast'), st)
    }
  })
  it('warn: warnings only, exit 0; --strict and --fail-on', () => {
    const r = check('warn'); const s = rules(r)
    assert.equal(r.code, 0); assert.equal(r.counts.error, 0)
    for (const k of ['warning:near-threshold', 'warning:link-not-distinct']) assert.ok(s.has(k), k)
    assert.equal(check('warn', '--strict').code, 1)
    assert.equal(check('fail', '--fail-on', 'none').code, 0)
  })
  it('--suppress: suppressed findings do not fail, stale and expired warn, --fail-on-stale', () => {
    const sup = path.join(here, 'fixtures', 'suppress.json')
    const r = check('fail', '--suppress', sup)
    assert.ok(r.suppressed.some((f) => f.rule === 'color-contrast' && f.selector === 'p' && f.suppressedBy === 'suppress.json#1'))
    assert.ok(!r.findings.some((f) => f.rule === 'color-contrast' && f.selector === 'p'))
    assert.equal(r.counts.suppressed, r.suppressed.length)
    assert.deepEqual(r.suppressionWarnings.map((w) => w.kind).sort(), ['expired', 'stale'])
    assert.ok(r.findings.some((f) => f.rule === 'token-pair'), 'expired entry is not applied')
    assert.equal(r.code, 1)
    assert.equal(check('fail', '--suppress', sup, '--fail-on', 'none').code, 0)
    assert.equal(check('fail', '--suppress', sup, '--fail-on', 'none', '--fail-on-stale').code, 1)
  })
  it('inline data-contrast-check-ignore suppresses only the named rules on that element', () => {
    const r = check('inline'); const s = rules(r)
    assert.ok(!r.findings.some((f) => f.selector === 'p')); assert.ok(!s.has('error:focus-not-visible'))
    assert.ok(r.findings.some((f) => f.rule === 'color-contrast' && f.selector === 'h1'), 'unmarked elements still report')
    assert.ok(s.has('error:token-pair'))
    assert.ok(r.suppressed.length >= 2 && r.suppressed.every((f) => f.suppressedBy === 'inline'))
  })
})
