'use strict'

/**
 * @antora-supplemental/ui-bus - Antora extension.
 * Publishes js/ui-bus.js and injects it right after the UI's site.js, ahead of
 * every extension script. Other chassis packages call ensureUiBus() so the bus
 * is present even when they are registered alone.
 */

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/ui-bus'
const BUS_JS = path.join(__dirname, '..', 'js', 'ui-bus.js')
const SCRIPT_PARTIAL_STEMS = ['footer-scripts', 'footer-content']

function bodyOf (file) {
  return Buffer.isBuffer(file.contents) ? file.contents.toString('utf8') : String(file.contents || '')
}

function footerAlreadyReferences (uiCatalog, relPath) {
  const base = String(relPath).split('?')[0]
  return uiCatalog
    .findByType('partial')
    .some((f) => SCRIPT_PARTIAL_STEMS.includes(f.stem) && bodyOf(f).includes(base))
}

function addOrReplaceAsset (uiCatalog, uiOutputDir, relPath, contents) {
  const existing = uiCatalog.findByType('asset').find((f) => f.path === relPath)
  if (existing) {
    existing.contents = contents
    return
  }
  const dirname = path.posix.dirname(relPath)
  const basename = path.posix.basename(relPath)
  const outDir = dirname === '.' ? uiOutputDir : `${uiOutputDir}/${dirname}`
  uiCatalog.addFile({
    contents,
    type: 'asset',
    path: relPath,
    out: { dirname: outDir, path: `${outDir}/${basename}`, basename },
  })
}

/**
 * Insert a defer script tag after the first line containing one of the anchors
 * (in footer-content, then footer-scripts). Falls back to after site.js, then
 * to the end of footer-scripts. Never duplicates.
 */
function appendFooterScriptAfter (uiCatalog, src, anchorSubstrings) {
  if (footerAlreadyReferences(uiCatalog, src)) return true
  const anchors = [].concat(anchorSubstrings || [], 'site.js')
  const tag = `<script src="{{{uiRootPath}}}/${src}" defer></script>`
  const partials = uiCatalog.findByType('partial')
  for (const anchor of anchors) {
    for (const stem of SCRIPT_PARTIAL_STEMS) {
      const foot = partials.find((f) => f.stem === stem)
      if (!foot) continue
      const lines = bodyOf(foot).split('\n')
      let idx = -1
      lines.forEach((l, i) => { if (l.includes(anchor)) idx = i })
      if (idx < 0) continue
      lines.splice(idx + 1, 0, tag)
      foot.contents = Buffer.from(lines.join('\n'))
      return true
    }
  }
  const fallback = partials.find((f) => f.stem === 'footer-scripts')
  if (!fallback) return false
  fallback.contents = Buffer.from(`${bodyOf(fallback).trim()}\n${tag}\n`)
  return true
}

function ensureUiBus (uiCatalog, uiOutputDir) {
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/ui-bus.js', fs.readFileSync(BUS_JS))
  return appendFooterScriptAfter(uiCatalog, 'js/ui-bus.js', [])
}

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    ensureUiBus(uiCatalog, playbook.ui?.outputDir || '_')
    logger.info('UiBus: js/ui-bus.js injected after site.js')
  })
}

module.exports = register
module.exports.register = register
module.exports.ensureUiBus = ensureUiBus
module.exports.appendFooterScriptAfter = appendFooterScriptAfter
module.exports.addOrReplaceAsset = addOrReplaceAsset
module.exports.footerAlreadyReferences = footerAlreadyReferences