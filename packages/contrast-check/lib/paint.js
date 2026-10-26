// Static paint checks (no browser): the @color-schemes manifest, literal colors
// in token blocks that are near-identical (consolidate tokens), and hard-coded
// colors outside tokens (reuses color-scheme's validate-paint.mjs).
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseColor, toHex, deltaE, round } from './color.js'

/** Schemes from a paint's `/* @color-schemes {json} *\/` comment, or null. */
export function readManifest (css) {
  const m = css.match(/\/\*\s*@color-schemes\s*([\s\S]*?)\*\//)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

/**
 * Normalize a manifest into runs: [{id, mode: 'light'|'dark', query: bool}].
 * light/dark are the paint's base schemes (emulated prefers-color-scheme);
 * other ids are picked with ?scheme=<id> in each slot they declare, or in
 * their base mode for slot "none".
 */
export function schemeRuns (manifest) {
  const m = manifest || { light: {}, dark: {} }
  const runs = []
  for (const [id, def] of Object.entries(m)) {
    if (id === 'light' || id === 'dark') { runs.push({ id, mode: id, query: false }); continue }
    let slots = def?.slots
    if (slots === 'both') slots = ['light', 'dark']
    if (typeof slots === 'string') slots = slots === 'none' ? [] : [slots]
    if (!Array.isArray(slots) || !slots.length) runs.push({ id, mode: def?.base === 'dark' ? 'dark' : 'light', query: true })
    else for (const s of slots) runs.push({ id, mode: s === 'dark' ? 'dark' : 'light', query: true })
  }
  return runs
}

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g

/** Custom-property declarations with literal colors, grouped by selector block. */
export function tokenBlocks (css) {
  const blocks = []
  for (const m of strip(css).matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    if (selector.startsWith('@')) continue
    const tokens = []
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const name = decl.slice(0, i).trim()
      if (!name.startsWith('--')) continue
      const value = decl.slice(i + 1).trim()
      if (/^#[0-9a-fA-F]{3,8}$|^(rgba?|hsla?)\([^)]*\)$/.test(value)) {
        const c = parseColor(value)
        if (c && c.a === 1) tokens.push({ name, value, hex: toHex(c) })
      }
    }
    if (tokens.length) blocks.push({ selector, tokens })
  }
  return blocks
}

/** Groups of distinct literal colors within one block closer than `maxDelta` (OKLab ΔE). */
export function nearIdentical (css, maxDelta = 0.02) {
  const out = []
  for (const { selector, tokens } of tokenBlocks(css)) {
    const distinct = [...new Map(tokens.map((t) => [t.hex, t])).values()]
    const seen = new Set()
    for (let i = 0; i < distinct.length; i++) {
      if (seen.has(i)) continue
      const group = [distinct[i]]
      for (let j = i + 1; j < distinct.length; j++) {
        if (!seen.has(j) && deltaE(distinct[i].hex, distinct[j].hex) < maxDelta) { group.push(distinct[j]); seen.add(j) }
      }
      if (group.length > 1) {
        const colors = group.map((g) => g.hex)
        out.push({
          selector,
          colors,
          tokens: tokens.filter((t) => colors.includes(t.hex)).map((t) => `${t.name}: ${t.value}`),
          deltaE: round(Math.max(...group.slice(1).map((g) => deltaE(group[0].hex, g.hex))), 4),
        })
      }
    }
  }
  return out
}

let validatePaintFn
/** validate-paint.mjs from the sibling color-scheme package (monorepo) or the installed one. */
export async function loadValidatePaint () {
  if (validatePaintFn !== undefined) return validatePaintFn
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(here, '..', '..', 'color-scheme', 'scripts', 'validate-paint.mjs')]
  try {
    const main = createRequire(import.meta.url).resolve('@antora-supplemental/color-scheme')
    candidates.push(path.join(path.dirname(main), '..', 'scripts', 'validate-paint.mjs'))
  } catch {}
  validatePaintFn = null
  for (const c of candidates) {
    if (existsSync(c)) { validatePaintFn = (await import(pathToFileURL(c).href)).validatePaint; break }
  }
  return validatePaintFn
}

/** Static findings for one paint stylesheet. */
export async function checkPaint (css, file, config) {
  const findings = []
  for (const g of nearIdentical(css, config.nearIdenticalDeltaE)) {
    findings.push({
      level: 'warning', rule: 'near-identical-colors', file, selector: g.selector, colors: g.colors,
      message: `${g.colors.length} near-identical colors (ΔE ${g.deltaE}) in ${g.selector}: ${g.tokens.join(', ')}. Consider one token.`,
    })
  }
  const validate = await loadValidatePaint()
  if (validate) {
    for (const w of validate(css, config.paintExtraSelectors || []).warnings) {
      const sel = (w.match(/selector "([^"]*)"/) || [])[1]
      findings.push({ level: 'warning', rule: 'hard-coded-color', file, selector: sel, message: w })
    }
  }
  return findings
}
