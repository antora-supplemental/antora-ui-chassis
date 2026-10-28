import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseColor, contrast, suggest, deltaE, apca, toHex } from '../lib/color.js'
import { readManifest, schemeRuns, nearIdentical } from '../lib/paint.js'
import { mergeConfig, DEFAULTS } from '../lib/config.js'
import { analyze, analyzeFocus, analyzeHover } from '../lib/analyze.js'
import { annotations, markdownSummary, counts, sortFindings } from '../lib/report.js'
import { globToRegExp, dedupe } from '../lib/run.js'

const cfg = mergeConfig()
const ctx = { page: '/index.html', scheme: 'light', mode: 'light', axeSelectors: new Set() }

describe('color', () => {
  it('parses hex, rgb and hsl', () => {
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
    assert.equal(parseColor('rgb(0 0 0 / 50%)').a, 0.5)
    assert.equal(toHex(parseColor('hsl(0, 100%, 50%)')), '#ff0000')
    assert.equal(parseColor('nope'), null)
  })
  it('computes WCAG contrast and composites translucent foregrounds', () => {
    assert.equal(Math.round(contrast('#000', '#fff') * 100) / 100, 21)
    assert.ok(Math.abs(contrast('#777', '#fff') - 4.48) < 0.01)
    assert.ok(contrast('rgba(0,0,0,0.5)', '#fff') < contrast('#000', '#fff'))
  })
  it('suggests the nearest lightness that passes', () => {
    const s = suggest('#999999', '#ffffff', 4.5)
    assert.ok(s.ratio >= 4.5 && s.ratio < 4.8, s.hex)
    assert.ok(deltaE('#ffffff', '#fefefe') < 0.02)
    assert.ok(apca('#000', '#fff') > 100)
  })
})

describe('paint manifest', () => {
  it('reads @color-schemes and expands slots into runs', () => {
    const m = readManifest('/* @color-schemes {"light":{},"dark":{},"slate":{"slots":"both"},"neon":{"slots":"none","base":"dark"}} */')
    assert.deepEqual(schemeRuns(m).map((r) => `${r.id}/${r.mode}${r.query ? '?' : ''}`), ['light/light', 'dark/dark', 'slate/light?', 'slate/dark?', 'neon/dark?'])
  })
  it('flags near-identical literal tokens in one block', () => {
    const g = nearIdentical(':root{--a:#ffffff;--b:#fefefe;--c:#000000}')
    assert.equal(g.length, 1)
    assert.deepEqual(g[0].colors, ['#ffffff', '#fefefe'])
  })
})

describe('config', () => {
  it('merges layers and rejects unknown keys and bad thresholds', () => {
    const c = mergeConfig({ thresholds: { text: 7 } }, { maxPages: 3 })
    assert.equal(c.thresholds.text, 7); assert.equal(c.thresholds.large, DEFAULTS.thresholds.large); assert.equal(c.maxPages, 3)
    assert.throws(() => mergeConfig({ bogus: 1 }), /unknown config key/)
    assert.throws(() => mergeConfig({ thresholds: { text: 30 } }), /between 1 and 21/)
    assert.throws(() => mergeConfig({ ignore: { rules: 'x' } }), /must be an array/)
  })
})

describe('analyze', () => {
  const m = (over) => ({ text: [], links: [], icons: [], controls: [], tokens: {}, ...over })
  it('warns on near-threshold text with a lightness-only suggestion', () => {
    const [f] = analyze(m({ text: [{ selector: 'p', fg: '#747474', bg: '#ffffff', large: false }] }), ctx, cfg)
    assert.equal(f.rule, 'near-threshold'); assert.equal(f.level, 'warning'); assert.ok(f.suggestion)
    assert.ok(contrast(f.suggestion, '#ffffff') >= 5)
  })
  it('warns on links under 3:1 against the surrounding text', () => {
    const [f] = analyze(m({ links: [{ selector: 'a', fg: '#333333', around: '#222222' }] }), ctx, cfg)
    assert.equal(f.rule, 'link-not-distinct')
  })
  it('errors on icons under 3:1 and warns on icons under 4.5:1', () => {
    const fs = analyze(m({ icons: [{ selector: 'i.a', fg: '#cccccc', bg: '#ffffff', host: 'button' }, { selector: 'i.b', fg: '#888888', bg: '#ffffff', host: 'button' }] }), ctx, cfg)
    assert.deepEqual(fs.map((f) => `${f.level}:${f.rule}`), ['error:icon-contrast', 'warning:icon-on-fill'])
  })
  it('composites a translucent surface token over the canvas', () => {
    const fs = analyze(m({ tokens: { '--cs-accent': '#0b5cad', '--cs-accent-soft': 'rgba(11,92,173,0.12)', '--cs-canvas': '#ffffff' } }), ctx, cfg)
    assert.equal(fs.filter((f) => f.selector === '--cs-accent on --cs-accent-soft' && f.level === 'error').length, 0)
  })
  it('errors on token pairs under the threshold', () => {
    const fs = analyze(m({ tokens: { '--cs-ink': '#999999', '--cs-canvas': '#ffffff' } }), ctx, cfg)
    assert.equal(fs[0].rule, 'token-pair')
  })
  it('focus: browser ring passes, no change errors, faint change warns', () => {
    const rest = { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderColor: 'x', borderWidth: 0, background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)', textDecoration: 'none', outerBg: '#ffffff' }
    assert.equal(analyzeFocus(rest, { ...rest, outlineStyle: 'auto', selector: 'a' }, ctx, cfg), null)
    assert.equal(analyzeFocus(rest, { ...rest, selector: 'a' }, ctx, cfg).rule, 'focus-not-visible')
    assert.equal(analyzeFocus(rest, { ...rest, background: 'rgb(250, 250, 250)', selector: 'a' }, ctx, cfg).rule, 'focus-too-similar')
    assert.equal(analyzeFocus(rest, { ...rest, outlineStyle: 'solid', outlineWidth: 2, outlineColor: '#eeeeee', selector: 'a' }, ctx, cfg).rule, 'focus-indicator')
    assert.equal(analyzeHover(rest, { ...rest, selector: 'a' }, ctx, cfg).rule, 'hover-unchanged')
  })
  it('focus: the strongest indicator wins (faint halo + solid border change passes)', () => {
    const rest = { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderColor: 'rgba(61, 155, 143, 0.35)', borderWidth: 1, background: 'rgb(26, 35, 48)', color: 'rgb(232, 228, 217)', textDecoration: 'none', outerBg: '#161c26' }
    const foc = { ...rest, borderColor: 'rgb(79, 179, 166)', boxShadow: 'rgba(232, 165, 75, 0.14) 0px 0px 0px 3px', selector: '#search-input' }
    assert.equal(analyzeFocus(rest, foc, ctx, cfg), null)
    // Faint halo alone still fails.
    assert.equal(analyzeFocus(rest, { ...foc, borderColor: rest.borderColor }, ctx, cfg).rule, 'focus-indicator')
  })
})

describe('report', () => {
  const fs = [
    { level: 'warning', rule: 'near-threshold', scheme: 'light', mode: 'light', selector: 'p', fg: '#747474', bg: '#ffffff', ratio: 4.6, required: 4.5, message: 'm', pages: ['/a.html'], file: 'site/a.html' },
    { level: 'error', rule: 'color-contrast', scheme: 'dark', mode: 'dark', selector: 'p,x', fg: '#555', bg: '#000', ratio: 2.1, required: 4.5, message: 'bad: 50%\nline', pages: ['/a.html'], file: 'site/a.html' },
  ]
  it('sorts errors first and counts by scheme', () => {
    assert.equal(sortFindings(fs)[0].level, 'error')
    assert.deepEqual(counts(fs).byScheme['dark/dark'], { error: 1, warning: 0 })
  })
  it('emits escaped GitHub annotations with file and title', () => {
    const [a] = annotations(fs)
    assert.match(a, /^::error file=site\/a\.html,title=contrast-check color-contrast \(dark\/dark\)::/)
    assert.match(a, /50%25%0Aline/)
  })
  it('writes a markdown summary', () => assert.match(markdownSummary(fs, { pages: ['a.html'], schemes: ['light/light', 'dark/dark'] }), /1 error\(s\), 1 warning\(s\)/))
})

describe('pages and dedupe', () => {
  it('matches globs', () => {
    assert.ok(globToRegExp('guide/**/*.html').test('guide/a/b/c.html'))
    assert.ok(globToRegExp('**/*.html').test('index.html'))
    assert.ok(!globToRegExp('*.html').test('a/b.html'))
  })
  it('merges pages, and hover findings across schemes', () => {
    const base = { level: 'warning', rule: 'hover-unchanged', selector: 'a' }
    const d = dedupe([{ ...base, scheme: 'light', mode: 'light', page: '/a' }, { ...base, scheme: 'dark', mode: 'dark', page: '/b' }])
    assert.equal(d.length, 1); assert.deepEqual(d[0].schemes, ['light/light', 'dark/dark']); assert.deepEqual(d[0].pages, ['/a', '/b'])
  })
})
