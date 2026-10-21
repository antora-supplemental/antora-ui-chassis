'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/soft-nav'
const UI_ROOT = path.join(__dirname, '..')

/** Partials that may host SoftNav or late-loaded feature scripts. */
const SCRIPT_PARTIAL_STEMS = ['footer-scripts', 'footer-content']

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
    out: {
      dirname: outDir,
      path: `${outDir}/${basename}`,
      basename,
    },
  })
}

/**
 * Insert a defer script tag after the first matching anchor substring in footer partials.
 * @returns {boolean} true when a tag was inserted
 */
function appendFooterScriptAfter (uiCatalog, src, anchorSubstrings) {
  const anchors = Array.isArray(anchorSubstrings) ? anchorSubstrings : [anchorSubstrings]
  const tag = `<script src="{{{uiRootPath}}}/${src}" defer></script>`

  for (const stem of SCRIPT_PARTIAL_STEMS) {
    const foot = uiCatalog.findByType('partial').find((f) => f.stem === stem)
    if (!foot) continue
    let body = Buffer.isBuffer(foot.contents)
      ? foot.contents.toString('utf8')
      : String(foot.contents || '')
    if (body.includes(src) || body.includes(tag.replace(' defer', ''))) return true

    for (const anchor of anchors) {
      if (!anchor || !body.includes(anchor)) continue
      const lines = body.split('\n')
      let inserted = false
      const next = lines.map((line) => {
        if (inserted || !line.includes(anchor)) return line
        inserted = true
        return `${line}\n${tag}`
      })
      if (inserted) {
        foot.contents = Buffer.from(next.join('\n'))
        return true
      }
    }
  }

  const fallback = uiCatalog.findByType('partial').find((f) => f.stem === 'footer-scripts')
  if (!fallback) return false
  let body = Buffer.isBuffer(fallback.contents)
    ? fallback.contents.toString('utf8')
    : String(fallback.contents || '')
  if (body.includes(src)) return true
  const lines = body.split('\n')
  let inserted = false
  const next = lines.map((line) => {
    if (inserted || !line.includes('site.js')) return line
    inserted = true
    return `${line}\n${tag}`
  })
  fallback.contents = Buffer.from(
    inserted ? next.join('\n') : `${body.trim()}\n${tag}\n`
  )
  return true
}

module.exports.register = function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE_ID)

  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false || config.ui === false) return

    const uiOutputDir = playbook.ui?.outputDir || '_'
    const jsPath = path.join(UI_ROOT, 'js', 'soft-nav.js')
    if (!fs.existsSync(jsPath)) {
      logger.warn('SoftNav: missing js/soft-nav.js')
      return
    }

    addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/soft-nav.js', fs.readFileSync(jsPath))
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav.js', ['site.js', 'js/site.js'])

    logger.info('SoftNav: runtime injected before soft-nav-context (when present)')
  })
}

module.exports.appendFooterScriptAfter = appendFooterScriptAfter
