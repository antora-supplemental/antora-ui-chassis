'use strict'

/**
 * @antora-supplemental/brand-placeholder - Antora extension and UI files.
 *
 * The shared placeholder logo for every Antora theme. Themes never ship a
 * brand logo; they call the chassis partials and get this neutral mark until
 * the site sets its own.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/brand-placeholder'
 *
 * Files (ui/): img/logo.svg, logo-dark.svg, logo-mono.svg, favicon.svg,
 * favicon.ico, apple-touch-icon.png; partials brand-logo (header logo
 * resolution), brand-placeholder-logo (inline mark), head-icons (favicons).
 *
 * Override order, highest first:
 *   1. the site: site.keys.header_logo / header_logo_dark / favicon, and any of
 *      the files above that the playbook ships through ui.supplemental_files;
 *   2. the chassis placeholder (this package).
 * A theme bundle is NOT in that list: on uiLoaded this extension puts the
 * chassis copy back over any theme copy of these paths. Themes that bake the
 * UI at build time copy ui/ last (scripts/bake.mjs) for the same result.
 */

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/brand-placeholder'
const UI_DIR = path.join(__dirname, '..', 'ui')

function walk (dir, base = '') {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel]
  }).sort()
}

/** Every chassis file as { rel, type, stem, contents }. rel is posix, relative to the UI root. */
function chassisFiles () {
  return walk(UI_DIR).map((rel) => {
    const isPartial = rel.startsWith('partials/') && rel.endsWith('.hbs')
    return {
      rel,
      type: isPartial ? 'partial' : 'asset',
      stem: isPartial ? path.posix.basename(rel, '.hbs') : undefined,
      contents: fs.readFileSync(path.join(UI_DIR, rel)),
    }
  })
}

/** Reserved paths: themes must not ship these with their own contents. */
const RESERVED = chassisFiles().map((f) => f.rel)

/** Paths the site itself supplies through ui.supplemental_files (dir or virtual entries). */
function siteSupplied (playbook = {}) {
  const ui = playbook.ui || {}
  const spec = ui.supplementalFiles
  const out = new Set()
  if (!spec) return out
  if (typeof spec === 'string') {
    const dir = path.resolve(playbook.dir || process.cwd(), spec)
    for (const rel of walk(dir)) out.add(rel)
  } else if (Array.isArray(spec)) {
    for (const e of spec) if (e && e.path) out.add(String(e.path).replace(/\\/g, '/').replace(/^\/+/, ''))
  }
  return out
}

function findFile (uiCatalog, f) {
  if (f.type === 'partial') return uiCatalog.findByType('partial').find((x) => x.stem === f.stem)
  return uiCatalog.findByType('asset').find((x) => x.path === f.rel)
}

/**
 * Put the chassis files in the catalog. Files the site supplies are kept;
 * everything else (missing, or a theme copy) gets the chassis contents.
 * Returns { added, replaced, kept } lists of paths.
 */
function applyPlaceholder (uiCatalog, uiOutputDir = '_', keep = new Set()) {
  const report = { added: [], replaced: [], kept: [] }
  for (const f of chassisFiles()) {
    const existing = findFile(uiCatalog, f)
    if (keep.has(f.rel)) { report.kept.push(f.rel); continue }
    if (existing) {
      if (!Buffer.from(existing.contents || '').equals(f.contents)) report.replaced.push(f.rel)
      existing.contents = f.contents
      continue
    }
    if (f.type === 'partial') {
      uiCatalog.addFile({ type: 'partial', stem: f.stem, path: f.rel, contents: f.contents })
    } else {
      const dirname = path.posix.dirname(f.rel)
      const basename = path.posix.basename(f.rel)
      const outDir = dirname === '.' ? uiOutputDir : `${uiOutputDir}/${dirname}`
      uiCatalog.addFile({ type: 'asset', path: f.rel, contents: f.contents, out: { dirname: outDir, path: `${outDir}/${basename}`, basename } })
    }
    report.added.push(f.rel)
  }
  return report
}

const LOOKS_LIKE_BRAND = /(^|[\/_.-])(logo|favicon|apple-touch-icon|brand|mark)([\/_.-]|$)/i

/**
 * Brand-file warnings for an unpacked theme UI dir. A reserved path with
 * contents different from the chassis copy warns (identical baked copies are
 * fine), and so does any other img/ file named like a logo or icon, unless a
 * substring in allow matches it.
 */
function checkTheme (root, allow = []) {
  const warnings = []
  const chassis = new Map(chassisFiles().map((f) => [f.rel, f.contents]))
  for (const [rel, contents] of chassis) {
    const p = path.join(root, rel)
    if (fs.existsSync(p) && !fs.readFileSync(p).equals(contents)) {
      warnings.push(`${rel}: theme ships its own copy of a chassis brand file (remove it; sites override, themes do not)`)
    }
  }
  for (const rel of walk(path.join(root, 'img')).map((r) => `img/${r}`)) {
    if (chassis.has(rel) || allow.some((a) => rel.includes(a))) continue
    if (LOOKS_LIKE_BRAND.test(rel)) warnings.push(`${rel}: looks like a brand logo or icon; a theme bundle must not ship one (keep demo brands outside the bundle)`)
  }
  return warnings
}

function register ({ config } = {}) {
  config = config || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    const r = applyPlaceholder(uiCatalog, playbook.ui?.outputDir || '_', siteSupplied(playbook))
    for (const rel of r.replaced) {
      // Base UIs (Default UI) ship their own head-icons partial; replacing partials is routine, own images are not.
      if (rel.startsWith('img/')) logger.warn(`brand-placeholder: the UI bundle shipped its own ${rel}; themes must not ship brand files, using the chassis placeholder`)
      else logger.info(`brand-placeholder: ${rel} replaced by the chassis partial`)
    }
    if (r.kept.length) logger.info(`brand-placeholder: site files kept: ${r.kept.join(', ')}`)
  })
}

module.exports = register
module.exports.register = register
module.exports.applyPlaceholder = applyPlaceholder
module.exports.siteSupplied = siteSupplied
module.exports.chassisFiles = chassisFiles
module.exports.checkTheme = checkTheme
module.exports.RESERVED = RESERVED
module.exports.UI_DIR = UI_DIR
