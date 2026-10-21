'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/soft-nav-context'
const UI_ROOT = path.join(__dirname, '..')

/** Partials that may host SoftNav or late-loaded feature scripts. */
const SCRIPT_PARTIAL_STEMS = ['footer-scripts', 'footer-content']

function partialBody (uiCatalog, stem) {
  const partial = uiCatalog.findByType('partial').find((f) => f.stem === stem)
  if (!partial) return ''
  return Buffer.isBuffer(partial.contents)
    ? partial.contents.toString('utf8')
    : String(partial.contents || '')
}

function footerAlreadyReferences (uiCatalog, relPath) {
  const base = String(relPath).split('?')[0]
  return SCRIPT_PARTIAL_STEMS.some((stem) => partialBody(uiCatalog, stem).includes(base))
}

function walkFiles (dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base))
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'))
    }
  }
  return out
}

function addOrReplacePartial (uiCatalog, stem, relPath, contents) {
  const existing = uiCatalog.findByType('partial').find((f) => f.stem === stem)
  if (existing) {
    existing.contents = contents
    return
  }
  uiCatalog.addFile({
    contents,
    path: relPath,
    stem,
    type: 'partial',
  })
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
  if (footerAlreadyReferences(uiCatalog, src)) return true
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

function ensureArticlePartial (uiCatalog) {
  const article = uiCatalog.findByType('partial').find((f) => f.stem === 'article')
  if (!article) return
  const body = Buffer.isBuffer(article.contents)
    ? article.contents.toString('utf8')
    : String(article.contents || '')
  const marker = '{{> soft-nav-page-context}}'
  if (body.includes(marker)) return
  article.contents = Buffer.from(`${marker}\n${body}`)
}

module.exports.register = function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE_ID)

  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false || config.ui === false) return

    const uiOutputDir = playbook.ui?.outputDir || '_'

    for (const rel of walkFiles(UI_ROOT)) {
      if (rel.startsWith('lib/') || rel.endsWith('ui-component.json5') || rel.endsWith('package.json')) {
        continue
      }
      const full = path.join(UI_ROOT, rel)
      const contents = fs.readFileSync(full)
      if (rel.startsWith('partials/') && rel.endsWith('.hbs')) {
        const stem = path.basename(rel, '.hbs')
        addOrReplacePartial(uiCatalog, stem, rel, contents)
      } else if (rel.startsWith('js/')) {
        addOrReplaceAsset(uiCatalog, uiOutputDir, rel, contents)
      }
    }

    ensureArticlePartial(uiCatalog)
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav-context.js', ['soft-nav.js', 'js/soft-nav.js'])
    appendFooterScriptAfter(uiCatalog, 'js/bind-soft-nav-context.js', [
      'soft-nav-context.js',
      'js/soft-nav-context.js',
    ])

    logger.info('SoftNavContext: page context partial + runtime (after soft-nav.js when present)')
  })
}

module.exports.appendFooterScriptAfter = appendFooterScriptAfter
