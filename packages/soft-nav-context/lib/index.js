'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/soft-nav-context'
const UI_ROOT = path.join(__dirname, '..')

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

function appendFooterScriptAfter (uiCatalog, src, afterSubstr) {
  const foot = uiCatalog.findByType('partial').find((f) => f.stem === 'footer-scripts')
  if (!foot) return
  let body = Buffer.isBuffer(foot.contents)
    ? foot.contents.toString('utf8')
    : String(foot.contents || '')
  const tag = `<script src="{{{uiRootPath}}}/${src}"></script>`
  if (body.includes(src) || body.includes(tag)) return
  if (afterSubstr && body.includes(afterSubstr)) {
    body = body.replace(afterSubstr, `${afterSubstr}\n${tag}`)
  } else {
    body = `${body.trim()}\n${tag}\n`
  }
  foot.contents = Buffer.from(body)
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
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav-context.js', 'soft-nav.js')
    appendFooterScriptAfter(uiCatalog, 'js/bind-soft-nav-context.js', 'soft-nav-context.js')

    logger.info('SoftNavContext: page context partial + runtime (load after soft-nav.js)')
  })
}
