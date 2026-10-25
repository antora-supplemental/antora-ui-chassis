'use strict'

/**
 * @antora-supplemental/default-paint - Antora extension (PAINT layer).
 *
 * Light and dark palette for the Antora Default UI. Adds css/default-paint.css
 * to the UI and links it at the end of head-styles (after site.css and the
 * chassis color-scheme.css), so its rules win over the bundle's. Colors only:
 * the light/dark mechanism (html.dark-theme, toggle, storage) is the chassis
 * extension @antora-supplemental/color-scheme, which you register as well.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/color-scheme'
 *       - require: '@antora-supplemental/default-paint'
 */

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/default-paint'
const ROOT = path.join(__dirname, '..')
const ASSET = 'css/default-paint.css'
const LINK = `<link rel="stylesheet" href="{{{uiRootPath}}}/${ASSET}">`

function bodyOf (file) {
  return Buffer.isBuffer(file.contents) ? file.contents.toString('utf8') : String(file.contents || '')
}

function addOrReplaceAsset (uiCatalog, uiOutputDir, relPath, contents) {
  const existing = uiCatalog.findByType('asset').find((f) => f.path === relPath)
  if (existing) {
    existing.contents = contents
    return
  }
  const dirname = path.posix.dirname(relPath)
  const basename = path.posix.basename(relPath)
  const outDir = `${uiOutputDir}/${dirname}`
  uiCatalog.addFile({ contents, type: 'asset', path: relPath, out: { dirname: outDir, path: `${outDir}/${basename}`, basename } })
}

/** Append the link to head-styles (else head-meta) once. */
function ensureDefaultPaint (uiCatalog, uiOutputDir) {
  addOrReplaceAsset(uiCatalog, uiOutputDir, ASSET, fs.readFileSync(path.join(ROOT, ASSET)))
  const partials = uiCatalog.findByType('partial')
  if (partials.some((f) => ['head-styles', 'head-meta'].includes(f.stem) && bodyOf(f).includes(ASSET))) return true
  const target = partials.find((f) => f.stem === 'head-styles') || partials.find((f) => f.stem === 'head-meta')
  if (!target) return false
  target.contents = Buffer.from(`${bodyOf(target).replace(/\s*$/, '')}\n${LINK}\n`)
  return true
}

// Destructured single param: Antora then binds `this` to the generator context.
function register ({ config }) {
  config = config || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    if (ensureDefaultPaint(uiCatalog, playbook.ui?.outputDir || '_')) logger.info(`default-paint: ${ASSET} linked`)
    else logger.warn('default-paint: UI has no head-styles/head-meta partial; nothing linked')
  })
}

module.exports = register
module.exports.register = register
module.exports.ensureDefaultPaint = ensureDefaultPaint
