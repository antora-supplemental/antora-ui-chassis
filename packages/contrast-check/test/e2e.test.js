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
  it('warn: warnings only, exit 0; --strict and --fail-on', () => {
    const r = check('warn'); const s = rules(r)
    assert.equal(r.code, 0); assert.equal(r.counts.error, 0)
    for (const k of ['warning:near-threshold', 'warning:link-not-distinct']) assert.ok(s.has(k), k)
    assert.equal(check('warn', '--strict').code, 1)
    assert.equal(check('fail', '--fail-on', 'none').code, 0)
  })
})
