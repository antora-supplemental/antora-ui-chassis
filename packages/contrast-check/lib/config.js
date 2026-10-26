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
  suppress: [], // [{ rule, selector, page, scheme, colors: { fg, bg }, reason, expires }]
  failOnStale: false, // exit 1 when a suppression is stale or expired
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
  if (!Array.isArray(out.suppress)) throw new Error('contrast-check: suppress must be an array')
  for (const k of ['selectors', 'rules', 'pages']) if (!Array.isArray(out.ignore[k])) throw new Error(`contrast-check: ignore.${k} must be an array`)
  for (const [k, v] of Object.entries(out.thresholds)) if (typeof v !== 'number' || v < 1 || v > 21) throw new Error(`contrast-check: thresholds.${k} must be a ratio between 1 and 21`)
  return out
}

/** Parse a JSON, JSON5/JSONC or YAML file by extension (YAML and JSON5 need the optional yaml / json5 packages). */
export async function parseFile (f) {
  const text = readFileSync(f, 'utf8').replace(/^\uFEFF/, '')
  const ext = path.extname(f).toLowerCase()
  if (ext === '.yml' || ext === '.yaml') {
    let yaml; try { yaml = await import('yaml') } catch { throw new Error(`contrast-check: reading ${f} needs the 'yaml' package (npm i yaml)`) }
    return (yaml.parse || yaml.default.parse)(text) ?? {}
  }
  if (ext === '.json5' || ext === '.jsonc') {
    let j5; try { j5 = await import('json5') } catch { throw new Error(`contrast-check: reading ${f} needs the 'json5' package (npm i json5)`) }
    return (j5.parse || j5.default.parse)(text)
  }
  return JSON.parse(text)
}

const NAMES = ['contrast-check.config.json', 'contrast-check.config.json5', 'contrast-check.config.yaml', 'contrast-check.config.yml']

/** Load a --suppress file: an array, or an object with a `suppress` array. */
export async function loadSuppressFile (file, cwd = process.cwd()) {
  const f = path.resolve(cwd, file)
  if (!existsSync(f)) throw new Error(`contrast-check: suppress file not found: ${file}`)
  const d = await parseFile(f)
  const list = Array.isArray(d) ? d : d?.suppress
  if (!Array.isArray(list)) throw new Error(`contrast-check: ${file} must be an array of suppressions or { "suppress": [...] }`)
  // Default ids name the file, e.g. suppress.json#2, so stale warnings point at it.
  return list.map((e, i) => e && typeof e === 'object' && !e.id ? { id: `${path.basename(f)}#${i + 1}`, ...e } : e)
}

export async function loadConfig (file, cwd = process.cwd()) {
  const f = file ? path.resolve(cwd, file) : (NAMES.map((n) => path.join(cwd, n)).find(existsSync) || path.join(cwd, NAMES[0]))
  if (!existsSync(f)) {
    if (file) throw new Error(`contrast-check: config file not found: ${file}`)
    return { config: {}, file: null }
  }
  return { config: (await parseFile(f)) || {}, file: f }
}
