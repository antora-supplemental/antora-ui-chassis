// Turns probe measurements into findings with ratios and suggested colors.
import { parseColor, toHex, blend, contrast as rawContrast, apca, suggest, round } from './color.js'

// Unknown colors (null, unparsable) give ratio 21 so they never raise findings.
const contrast = (a, b) => (a && b && parseColor(a) && parseColor(b) ? rawContrast(a, b) : 21)

const hex = (s) => { const c = parseColor(s); return c ? toHex(c) : s }
const fix = (fg, bg, target) => {
  if (!fg || !bg || !parseColor(fg) || !parseColor(bg)) return null
  const s = suggest(fg, bg, target); return s ? s.hex : null }

/** Token pairs: [fg, bg, kind]. Missing tokens are skipped. */
export const TOKEN_PAIRS = [
  ['--cs-ink', '--cs-canvas', 'text'], ['--cs-ink', '--cs-elevated', 'text'],
  ['--cs-ink-muted', '--cs-canvas', 'text'], ['--cs-ink-muted', '--cs-elevated', 'text'],
  ['--cs-accent', '--cs-canvas', 'text'], ['--cs-accent', '--cs-elevated', 'text'],
  ['--cs-accent-hover', '--cs-canvas', 'text'], ['--cs-code-fg', '--cs-code-bg', 'text'],
  ['--cs-border', '--cs-canvas', 'boundary'], ['--cs-accent', '--cs-accent-soft', 'nonText'],
]
export const TOKENS = [...new Set(TOKEN_PAIRS.flat().filter((t) => t.startsWith('--')))]

export function analyze (m, ctx, cfg) {
  const T = cfg.thresholds
  const out = []
  const add = (f) => { if (!cfg.ignore.rules.includes(f.rule)) out.push({ page: ctx.page, scheme: ctx.scheme, mode: ctx.mode, ...f }) }
  const near = (r, req) => r >= req && r < req + cfg.nearMargin

  for (const t of m.text) {
    if (ctx.axeSelectors.has(t.selector)) continue // axe already reported it as an error
    const req = t.large ? T.large : T.text
    const r = contrast(t.fg, t.bg)
    if (!near(r, req)) continue
    const f = { level: 'warning', rule: 'near-threshold', selector: t.selector, fg: hex(t.fg), bg: hex(t.bg), ratio: round(r), required: req, suggestion: fix(t.fg, t.bg, req + cfg.nearMargin) }
    if (cfg.apca) f.apca = round(apca(t.fg, t.bg), 1)
    f.message = `${t.large ? 'Large text' : 'Text'} passes by a thin margin: ${f.ratio}:1 (needs ${req}:1, warn under ${req + cfg.nearMargin}:1)`
    add(f)
  }
  for (const l of m.links) {
    const r = contrast(l.fg, l.around)
    if (r >= T.link) continue
    add({ level: 'warning', rule: 'link-not-distinct', selector: l.selector, fg: hex(l.fg), bg: hex(l.around), ratio: round(r), required: T.link, suggestion: fix(l.fg, l.around, T.link), message: `Link without underline is ${round(r)}:1 against the text around it (needs ${T.link}:1 or an underline)` })
  }
  for (const i of m.icons) {
    const r = contrast(i.fg, i.bg)
    if (r < T.nonText) add({ level: 'error', rule: 'icon-contrast', selector: i.selector, fg: hex(i.fg), bg: hex(i.bg), ratio: round(r), required: T.nonText, suggestion: fix(i.fg, i.bg, T.nonText), message: `Icon on ${i.host} is ${round(r)}:1 against its fill (needs ${T.nonText}:1)` })
    else if (r < T.text) add({ level: 'warning', rule: 'icon-on-fill', selector: i.selector, fg: hex(i.fg), bg: hex(i.bg), ratio: round(r), required: T.text, suggestion: fix(i.fg, i.bg, T.text), message: `Icon on ${i.host} is ${round(r)}:1 against its fill; fine for non-text (${T.nonText}:1) but under ${T.text}:1` })
  }
  for (const c of m.controls) {
    if (contrast(c.fill, c.outer) >= T.nonText) continue
    const r = c.border ? contrast(c.border, c.outer) : 1
    if (r < T.nonText) add({ level: 'error', rule: 'control-boundary', selector: c.selector, fg: c.border ? hex(c.border) : null, bg: hex(c.outer), ratio: round(r), required: T.nonText, suggestion: c.border ? fix(c.border, c.outer, T.nonText) : null, message: c.border ? `Form control border is ${round(r)}:1 against the surface (needs ${T.nonText}:1)` : 'Form control has no border and its fill does not stand out from the surface' })
    else if (near(r, T.nonText)) add({ level: 'warning', rule: 'near-threshold', selector: c.selector, fg: hex(c.border), bg: hex(c.outer), ratio: round(r), required: T.nonText, suggestion: fix(c.border, c.outer, T.nonText + cfg.nearMargin), message: `Form control border passes by a thin margin: ${round(r)}:1` })
  }
  if (cfg.tokens) {
    for (const [a, b, kind] of TOKEN_PAIRS) {
      const fa = m.tokens[a]; let fb = m.tokens[b]
      if (!fa || !fb || !parseColor(fa) || !parseColor(fb)) continue
      // A translucent surface token (e.g. --cs-accent-soft) is painted over the canvas.
      const pb = parseColor(fb); const canvas = parseColor(m.tokens['--cs-canvas'] || '')
      if ((pb.a ?? 1) < 1) fb = toHex(blend(pb, canvas && (canvas.a ?? 1) === 1 ? canvas : { r: 255, g: 255, b: 255, a: 1 }))
      const sel = `${a} on ${b}`
      if (kind === 'boundary') {
        // Borders are often decorative; 3:1 is only required when the border is what identifies a control.
        const r = contrast(fa, fb)
        if (r < T.nonText) add({ level: 'warning', rule: 'token-boundary', selector: sel, fg: hex(fa), bg: hex(fb), ratio: round(r), required: T.nonText, suggestion: fix(fa, fb, T.nonText), message: `Token pair ${sel} is ${round(r)}:1; fine for decoration, but a control identified only by this border needs ${T.nonText}:1` })
        continue
      }
      const req = T[kind]; const r = contrast(fa, fb)
      if (r < req) add({ level: 'error', rule: 'token-pair', selector: sel, fg: hex(fa), bg: hex(fb), ratio: round(r), required: req, suggestion: fix(fa, fb, req), message: `Token pair ${sel} is ${round(r)}:1 (needs ${req}:1)` })
      else if (near(r, req)) add({ level: 'warning', rule: 'token-pair-near', selector: sel, fg: hex(fa), bg: hex(fb), ratio: round(r), required: req, suggestion: fix(fa, fb, req + cfg.nearMargin), message: `Token pair ${sel} passes by a thin margin: ${round(r)}:1` })
    }
  }
  return out
}

const shadowColor = (s) => { const m = /rgba?\([^)]+\)/.exec(s || ''); return m && s !== 'none' ? m[0] : null }

/** One focus finding (or null) from resting and focused snapshots. */
export function analyzeFocus (rest, foc, ctx, cfg) {
  const T = cfg.thresholds
  const base = { page: ctx.page, scheme: ctx.scheme, mode: ctx.mode, selector: foc.selector }
  // outline-style auto is the browser's own two-tone focus ring: visible on any background.
  if (foc.outlineStyle === 'auto') return null
  // Judge the strongest indicator, not the first one found (0.3.1): a faint halo
  // shadow next to a solid border-colour change used to be reported as the only
  // indicator, so a clearly visible focus state failed.
  const cands = []
  if (foc.outlineStyle !== 'none' && foc.outlineWidth > 0) cands.push(foc.outlineColor)
  if (foc.boxShadow !== rest.boxShadow && shadowColor(foc.boxShadow)) cands.push(shadowColor(foc.boxShadow))
  if (foc.borderColor !== rest.borderColor && foc.borderWidth > 0) cands.push(foc.borderColor)
  let ind = null; let best = -1
  for (const cand of cands) {
    const c = parseColor(cand)
    if (!c || c.a === 0) continue
    const cr = contrast(cand, foc.outerBg)
    if (cr > best) { ind = cand; best = cr }
  }
  if (ind) {
    const r = best
    if (r < T.nonText) return { ...base, level: 'error', rule: 'focus-indicator', fg: hex(ind), bg: hex(foc.outerBg), ratio: round(r), required: T.nonText, suggestion: fix(ind, foc.outerBg, T.nonText), message: `Focus indicator is ${round(r)}:1 against the background (needs ${T.nonText}:1)` }
    if (r < T.nonText + cfg.nearMargin) return { ...base, level: 'warning', rule: 'near-threshold', fg: hex(ind), bg: hex(foc.outerBg), ratio: round(r), required: T.nonText, suggestion: fix(ind, foc.outerBg, T.nonText + cfg.nearMargin), message: `Focus indicator passes by a thin margin: ${round(r)}:1` }
    return null
  }
  const bgChanged = foc.background !== rest.background; const fgChanged = foc.color !== rest.color
  const decoChanged = foc.textDecoration !== rest.textDecoration
  if (!bgChanged && !fgChanged && !decoChanged) return { ...base, level: 'error', rule: 'focus-not-visible', fg: null, bg: hex(foc.outerBg), ratio: null, required: T.nonText, suggestion: null, message: 'Keyboard focus shows no visible change (no outline, shadow, border, color or underline change)' }
  if (decoChanged) return null
  const r = bgChanged ? contrast(foc.background, rest.background) : contrast(foc.color, rest.color)
  if (r < cfg.similarState) return { ...base, level: 'warning', rule: 'focus-too-similar', fg: hex(bgChanged ? foc.background : foc.color), bg: hex(bgChanged ? rest.background : rest.color), ratio: round(r), required: cfg.similarState, suggestion: null, message: `Focus state differs from rest only by a ${bgChanged ? 'background' : 'color'} change of ${round(r)}:1` }
  return null
}

export function analyzeHover (rest, hov, ctx, cfg) {
  const base = { page: ctx.page, scheme: ctx.scheme, mode: ctx.mode, selector: hov.selector }
  const same = ['background', 'color', 'textDecoration', 'boxShadow', 'borderColor', 'outlineStyle'].every((k) => rest[k] === hov[k])
  if (same) return { ...base, level: 'warning', rule: 'hover-unchanged', fg: hex(rest.color), bg: hex(rest.background), ratio: 1, required: cfg.similarState, suggestion: null, message: 'Hover state looks the same as rest' }
  if (rest.textDecoration !== hov.textDecoration || rest.boxShadow !== hov.boxShadow || rest.borderColor !== hov.borderColor) return null
  const r = Math.max(contrast(hov.color, rest.color), contrast(hov.background, rest.background))
  if (r < cfg.similarState) return { ...base, level: 'warning', rule: 'hover-too-similar', fg: hex(hov.color), bg: hex(rest.color), ratio: round(r), required: cfg.similarState, suggestion: null, message: `Hover state differs from rest by only ${round(r)}:1` }
  return null
}

export function axeFindings (violations, ctx, cfg) {
  const out = []
  for (const v of violations) {
    if (cfg.ignore.rules.includes(v.id)) continue
    for (const n of v.nodes) {
      const d = (n.any[0] || {}).data || {}
      const selector = n.target.join(' ')
      const fg = d.fgColor || null; const bg = d.bgColor || null
      const req = d.expectedContrastRatio ? parseFloat(d.expectedContrastRatio) : null
      out.push({ page: ctx.page, scheme: ctx.scheme, mode: ctx.mode, level: 'error', rule: v.id, selector, fg, bg, ratio: d.contrastRatio ?? null, required: req, suggestion: fg && bg && req ? fix(fg, bg, req) : null, message: (n.any[0] || {}).message || v.help })
    }
  }
  return out
}
