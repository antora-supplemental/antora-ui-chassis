// Defaults and config-file loading (contrast-check.config.json or --config).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const DEFAULTS = Object.freeze({
  thresholds: { text: 4.5, large: 3, nonText: 3, link: 3 },
  nearMargin: 0.5, // warn when a ratio passes by less than this (4.5 → warn under 5)
  nearIdenticalDeltaE: 0.02, // OKLab ΔE under which two paint colors are "the same"
  similarState: 1.2, // focus/hover change under this ratio vs resting is "too similar"
  apca: false, // add an APCA Lc readout to text findings
  pages: [], // site-relative paths or globs; empty = every .html (up to maxPages)
  maxPages: 20,
  schemes: [], // scheme ids to run; empty = every scheme in the manifest
  paints: [], // paint stylesheets for static checks; empty = discover from the page
  maxText: 1500,
  maxFocus: 40,
  maxHover: 20,
  tokens: true, // --cs-* token-pair checks
  ignore: { selectors: [], rules: [], pages: [] },
  maxAnnotations: 50,
})

const KEYS = new Set(Object.keys(DEFAULTS))

export function mergeConfig (...layers) {
  const out = structuredClone(DEFAULTS)
  for (const l of layers) {
    if (!l) continue
    for (const [k, v] of Object.entries(l)) {
      if (v === undefined) continue
      if (!KEYS.has(k)) throw new Error(`contrast-check: unknown config key '${k}'`)
      if (k === 'thresholds' || k === 'ignore') out[k] = { ...out[k], ...v }
      else out[k] = v
    }
  }
  for (const k of ['selectors', 'rules', 'pages']) if (!Array.isArray(out.ignore[k])) throw new Error(`contrast-check: ignore.${k} must be an array`)
  for (const [k, v] of Object.entries(out.thresholds)) if (typeof v !== 'number' || v < 1 || v > 21) throw new Error(`contrast-check: thresholds.${k} must be a ratio between 1 and 21`)
  return out
}

export function loadConfig (file, cwd = process.cwd()) {
  const f = file ? path.resolve(cwd, file) : path.join(cwd, 'contrast-check.config.json')
  if (!existsSync(f)) {
    if (file) throw new Error(`contrast-check: config file not found: ${file}`)
    return { config: {}, file: null }
  }
  return { config: JSON.parse(readFileSync(f, 'utf8')), file: f }
}
