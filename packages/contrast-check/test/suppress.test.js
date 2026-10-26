// Suppression list and inline opt-out.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { normalizeSuppressions, applySuppressions, suppressionWarnings, inlineIgnores, ruleMatches, matches } from '../lib/suppress.js'
import { mergeConfig, loadConfig, loadSuppressFile } from '../lib/config.js'
import { consoleReport, markdownSummary, totals, suppressionAnnotations } from '../lib/report.js'
import { dedupe } from '../lib/run.js'

const F = (o) => ({ level: 'error', rule: 'color-contrast', selector: '.nav a', fg: '#777777', bg: '#ffffff', ratio: 4.48, scheme: 'light', mode: 'light', page: '/index.html', message: 'm', ...o })
const N = (...e) => normalizeSuppressions(e)

describe('suppress: entries', () => {
  it('requires a reason', () => assert.throws(() => N({ rule: 'token-pair' }), /needs a reason/))
  it('rejects an entry that matches everything', () => assert.throws(() => N({ reason: 'x' }), /matches everything/))
  it('rejects unknown keys and bad dates', () => {
    assert.throws(() => N({ rule: 'x', reason: 'r', selecter: 'a' }), /unknown key 'selecter'/)
    assert.throws(() => N({ rule: 'x', reason: 'r', expires: '1/2/2027' }), /YYYY-MM-DD/)
  })
  it('rejects a non-array', () => assert.throws(() => normalizeSuppressions({}), /must be an array/))
  it('gives ids by source and position, or keeps a given id', () => {
    const [a, b] = normalizeSuppressions([{ rule: 'x', reason: 'r' }, { id: 'mine', rule: 'y', reason: 'r' }], 'file.json')
    assert.equal(a.id, 'file.json#1'); assert.equal(b.id, 'mine')
  })
})

describe('suppress: matching', () => {
  it('rule ids, aliases, globs and all', () => {
    assert.ok(ruleMatches('hover-no-change', 'hover-unchanged'))
    assert.ok(ruleMatches('faint-border', 'control-boundary') && ruleMatches('faint-border', 'token-boundary'))
    assert.ok(ruleMatches('link-distinguishable', 'link-not-distinct'))
    assert.ok(ruleMatches('near-identical', 'near-identical-colors'))
    assert.ok(ruleMatches('hardcoded-color', 'hard-coded-color'))
    assert.ok(ruleMatches('focus-*', 'focus-too-similar'))
    assert.ok(ruleMatches('all', 'token-pair'))
    assert.ok(!ruleMatches('token-pair', 'token-pair-near'))
  })
  it('selector: exact, substring or /regex/', () => {
    const [s] = N({ selector: '.nav', reason: 'r' }); assert.ok(matches(s, F()))
    const [r] = N({ selector: '/^\\.nav a$/', reason: 'r' }); assert.ok(matches(r, F())); assert.ok(!matches(r, F({ selector: '.nav a span' })))
  })
  it('page globs, with or without a leading slash', () => {
    const [s] = N({ page: 'guide/**/*.html', reason: 'r' })
    assert.ok(matches(s, F({ page: '/guide/a/b.html' }))); assert.ok(!matches(s, F()))
    const [t] = N({ pages: ['/index.html'], reason: 'r' }); assert.ok(matches(t, F()))
  })
  it('scheme by id or id/mode; paint findings without a scheme never match a scheme filter', () => {
    const [s] = N({ scheme: ['dark'], reason: 'r' }); assert.ok(!matches(s, F())); assert.ok(matches(s, F({ scheme: 'dark', mode: 'dark' })))
    const [t] = N({ scheme: 'light/light', reason: 'r' }); assert.ok(matches(t, F())); assert.ok(!matches(t, F({ scheme: undefined })))
  })
  it('exact colors, normalized', () => {
    const [s] = N({ colors: { fg: '#777', bg: 'rgb(255, 255, 255)' }, reason: 'r' }); assert.ok(matches(s, F()))
    const [t] = N({ fg: '#767676', reason: 'r' }); assert.ok(!matches(t, F()))
  })
  it('every given field must match', () => {
    const [s] = N({ rule: 'color-contrast', selector: '.nav a', page: 'index.html', scheme: 'dark', reason: 'r' })
    assert.ok(!matches(s, F()))
  })
})

describe('suppress: apply', () => {
  const entries = normalizeSuppressions([
    { id: 'nav', rule: 'color-contrast', selector: '.nav a', reason: 'third-party widget' },
    { id: 'old', rule: 'token-pair', reason: 'tracked in #12', expires: '2020-01-01' },
    { id: 'unused', rule: 'icon-contrast', reason: 'gone' },
  ])
  const fs = [F(), F({ rule: 'token-pair', selector: '--a on --b' }), F({ selector: '.main p' })]
  const r = applySuppressions(fs, entries, '2026-10-26')
  it('splits kept and suppressed, tagging the entry and reason', () => {
    assert.equal(r.kept.length, 2); assert.equal(r.suppressed.length, 1)
    assert.equal(r.suppressed[0].suppressedBy, 'nav'); assert.equal(r.suppressed[0].suppressReason, 'third-party widget')
  })
  it('ignores expired entries and warns about them and stale ones', () => {
    assert.ok(r.kept.some((f) => f.rule === 'token-pair'))
    const w = suppressionWarnings(entries, r.used, r.expired)
    assert.deepEqual(w.map((x) => `${x.kind}:${x.id}`), ['expired:old', 'stale:unused'])
  })
  it('an entry expiring today still applies', () => {
    const [e] = N({ rule: 'token-pair', reason: 'r', expires: '2026-10-26' })
    assert.equal(applySuppressions([F({ rule: 'token-pair' })], [e], '2026-10-26').suppressed.length, 1)
  })
  it('inline-suppressed findings pass through as suppressed', () => {
    const x = applySuppressions([F({ suppressedBy: 'inline', suppressReason: 'attr' })], [], '2026-10-26')
    assert.equal(x.suppressed.length, 1); assert.equal(x.kept.length, 0)
  })
  it('per-page suppression then dedupe keeps the other pages', () => {
    const [e] = N({ page: 'a.html', reason: 'r' })
    const x = applySuppressions([F({ page: '/a.html' }), F({ page: '/b.html' })], [e], '2026-10-26')
    assert.deepEqual(dedupe(x.kept)[0].pages, ['/b.html']); assert.deepEqual(dedupe(x.suppressed)[0].pages, ['/a.html'])
  })
})

describe('suppress: inline attribute', () => {
  it('empty value ignores every rule; names and aliases select rules', () => {
    assert.ok(inlineIgnores('', 'token-pair'))
    assert.ok(inlineIgnores('focus-not-visible hover-no-change', 'hover-unchanged'))
    assert.ok(!inlineIgnores('color-contrast', 'focus-not-visible'))
  })
})

describe('suppress: config and files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cc-sup-'))
  it('config `suppress` must be an array; failOnStale is a key', () => {
    assert.throws(() => mergeConfig({ suppress: {} }), /suppress must be an array/)
    assert.equal(mergeConfig({ failOnStale: true }).failOnStale, true)
  })
  it('loads a JSON suppress file as an array or { suppress }', async () => {
    writeFileSync(path.join(dir, 'a.json'), JSON.stringify([{ rule: 'x', reason: 'r' }]))
    writeFileSync(path.join(dir, 'b.json'), '\uFEFF' + JSON.stringify({ suppress: [{ rule: 'y', reason: 'r' }] }))
    const a = await loadSuppressFile('a.json', dir); assert.equal(a[0].rule, 'x'); assert.equal(a[0].id, 'a.json#1')
    assert.equal((await loadSuppressFile('b.json', dir))[0].rule, 'y')
    writeFileSync(path.join(dir, 'c.json'), '{"nope":1}')
    await assert.rejects(loadSuppressFile('c.json', dir), /must be an array/)
    await assert.rejects(loadSuppressFile('missing.json', dir), /not found/)
  })
  it('loads YAML and JSON5 when those packages are present', async (t) => {
    let haveYaml = true; try { await import('yaml') } catch { haveYaml = false }
    let haveJ5 = true; try { await import('json5') } catch { haveJ5 = false }
    writeFileSync(path.join(dir, 's.yaml'), 'suppress:\n  - rule: token-pair\n    reason: r\n')
    writeFileSync(path.join(dir, 's.json5'), "// c\n[{ rule: 'token-pair', reason: 'r', },]")
    if (haveYaml) assert.equal((await loadSuppressFile('s.yaml', dir))[0].rule, 'token-pair')
    else await assert.rejects(loadSuppressFile('s.yaml', dir), /needs the 'yaml' package/)
    if (haveJ5) assert.equal((await loadSuppressFile('s.json5', dir))[0].rule, 'token-pair')
    else await assert.rejects(loadSuppressFile('s.json5', dir), /needs the 'json5' package/)
  })
  it('finds contrast-check.config.json in cwd', async () => {
    writeFileSync(path.join(dir, 'contrast-check.config.json'), JSON.stringify({ suppress: [{ rule: 'x', reason: 'r' }] }))
    const { config } = await loadConfig(undefined, dir); assert.equal(config.suppress.length, 1)
  })
})

describe('suppress: report', () => {
  const meta = { pages: ['index.html'], schemes: ['light/light'], paints: [] }
  const sup = [{ ...F(), pages: ['/index.html'], suppressedBy: 'nav', suppressReason: 'widget' }]
  const ws = [{ kind: 'stale', id: 'unused', message: 'suppression unused matched no finding; remove it (gone)' }]
  it('totals show N suppressed', () => {
    assert.equal(totals([], { suppressed: sup }), '0 error(s), 0 warning(s), 1 suppressed')
    assert.match(consoleReport([], meta, 200, { suppressed: sup }), /1 suppressed$/)
    assert.match(markdownSummary([], meta, 30, { suppressed: sup }), /1 suppressed/)
  })
  it('--show-suppressed lists them with the reason; stale warnings print', () => {
    const c = consoleReport([], meta, 200, { suppressed: sup, suppressionWarnings: ws, showSuppressed: true })
    assert.match(c, /suppressed by nav: widget/); assert.match(c, /suppression-stale/)
    assert.doesNotMatch(consoleReport([], meta, 200, { suppressed: sup }), /suppressed by/)
    const m = markdownSummary([], meta, 30, { suppressed: sup, suppressionWarnings: ws, showSuppressed: true })
    assert.match(m, /### 1 suppressed/); assert.match(m, /Suppression warnings/)
  })
  it('stale and expired become ::warning annotations', () => {
    assert.match(suppressionAnnotations(ws)[0], /^::warning title=contrast-check suppression-stale::/)
  })
})