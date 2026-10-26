// Suppressions: config `suppress` entries, --suppress files and the inline
// data-contrast-check-ignore attribute. Applied per page and scheme run,
// before findings are merged, so a page or scheme filter is exact.
import { parseColor, toHex } from './color.js'
import { globToRegExp } from './run.js'

/** Friendly names for rule ids (an entry or attribute may use either). */
export const RULE_ALIASES = Object.freeze({
  'color-contrast': ['color-contrast'],
  'link-distinguishable': ['link-not-distinct'],
  'near-identical': ['near-identical-colors'],
  'faint-border': ['control-boundary', 'token-boundary'],
  'hover-no-change': ['hover-unchanged'],
  'hardcoded-color': ['hard-coded-color'],
  'focus-not-visible': ['focus-not-visible'],
})

const list = (v) => v == null ? [] : Array.isArray(v) ? v : [v]
const normColor = (c) => { if (c == null) return null; try { const p = parseColor(String(c)); return p ? toHex(p).toLowerCase() : String(c).toLowerCase() } catch { return String(c).toLowerCase() } }

/** True when a rule pattern (id, alias, glob or `all`) matches a finding's rule. */
export function ruleMatches (pattern, rule) {
  if (pattern === 'all' || pattern === '*') return true
  if (RULE_ALIASES[pattern]?.includes(rule)) return true
  if (/[*?]/.test(pattern)) return globToRegExp(pattern).test(rule)
  return pattern === rule
}

function selectorMatches (pattern, sel) {
  if (sel == null) return false
  const m = /^\/(.+)\/([a-z]*)$/.exec(pattern)
  if (m) return new RegExp(m[1], m[2]).test(sel)
  return sel === pattern || sel.includes(pattern)
}

const today = () => new Date().toISOString().slice(0, 10)

/** Validate and normalize entries; `source` names where they came from. */
export function normalizeSuppressions (entries, source = 'config') {
  if (entries == null) return []
  if (!Array.isArray(entries)) throw new Error(`contrast-check: suppress in ${source} must be an array`)
  return entries.map((e, i) => {
    const id = `${source}#${i + 1}`
    if (!e || typeof e !== 'object') throw new Error(`contrast-check: suppression ${id} must be an object`)
    if (typeof e.reason !== 'string' || !e.reason.trim()) throw new Error(`contrast-check: suppression ${id} needs a reason`)
    const known = new Set(['rule', 'rules', 'selector', 'page', 'pages', 'scheme', 'schemes', 'colors', 'fg', 'bg', 'reason', 'expires', 'id'])
    for (const k of Object.keys(e)) if (!known.has(k)) throw new Error(`contrast-check: suppression ${id}: unknown key '${k}'`)
    if (e.expires != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.expires))) throw new Error(`contrast-check: suppression ${id}: expires must be YYYY-MM-DD`)
    const colors = { fg: e.colors?.fg ?? e.fg, bg: e.colors?.bg ?? e.bg }
    const n = {
      id: e.id || id,
      rules: [...list(e.rule), ...list(e.rules)],
      selectors: list(e.selector),
      pages: [...list(e.page), ...list(e.pages)].map((p) => String(p).replace(/^\//, '')),
      schemes: [...list(e.scheme), ...list(e.schemes)],
      fg: normColor(colors.fg),
      bg: normColor(colors.bg),
      reason: e.reason,
      expires: e.expires ? String(e.expires) : null,
    }
    if (!n.rules.length && !n.selectors.length && !n.pages.length && !n.schemes.length && !n.fg && !n.bg) throw new Error(`contrast-check: suppression ${id} matches everything; give at least one of rule, selector, page, scheme, colors`)
    return n
  })
}

/** Does entry `s` match one (unmerged) finding? */
export function matches (s, f) {
  if (s.rules.length && !s.rules.some((r) => ruleMatches(r, f.rule))) return false
  if (s.selectors.length && !s.selectors.some((p) => selectorMatches(p, f.selector))) return false
  if (s.pages.length) {
    const pg = (f.page || '').replace(/^\//, '').split('?')[0]
    if (!f.page || !s.pages.some((g) => globToRegExp(g).test(pg))) return false
  }
  if (s.schemes.length) {
    const run = f.scheme ? `${f.scheme}/${f.mode}` : null
    if (!f.scheme || !s.schemes.some((x) => x === f.scheme || x === run)) return false
  }
  if (s.fg && normColor(f.fg) !== s.fg) return false
  if (s.bg && normColor(f.bg) !== s.bg) return false
  return true
}

/**
 * Split findings into kept and suppressed. Expired entries are not applied.
 * Returns { kept, suppressed, used:Set<id>, expired:[entry] }.
 */
export function applySuppressions (findings, entries, now = today()) {
  const active = []; const expired = []
  for (const s of entries) (s.expires && s.expires < now ? expired : active).push(s)
  const kept = []; const suppressed = []; const used = new Set()
  for (const f of findings) {
    if (f.suppressedBy) { suppressed.push(f); continue }
    const s = active.find((x) => matches(x, f))
    if (s) { used.add(s.id); suppressed.push({ ...f, suppressedBy: s.id, suppressReason: s.reason }) } else kept.push(f)
  }
  return { kept, suppressed, used, expired }
}

/** Expired and unused (stale) entries, as report lines. */
export function suppressionWarnings (entries, used, expired) {
  const out = []
  for (const s of expired) out.push({ kind: 'expired', id: s.id, message: `suppression ${s.id} expired on ${s.expires} and is ignored (${s.reason})` })
  const exp = new Set(expired.map((s) => s.id))
  for (const s of entries) if (!exp.has(s.id) && !used.has(s.id)) out.push({ kind: 'stale', id: s.id, message: `suppression ${s.id} matched no finding; remove it (${s.reason})` })
  return out
}

/** Rules named by a data-contrast-check-ignore value apply to `rule`? Empty value = all rules. */
export function inlineIgnores (value, rule) {
  const v = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  return !v.length || v.some((p) => ruleMatches(p, rule))
}