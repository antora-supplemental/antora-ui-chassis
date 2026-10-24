'use strict'

/**
 * @antora-supplemental/page-state - Antora extension.
 * Adds the per-page `page-state-context` partial to the article and injects
 * js/page-state.js after ui-bus.js (and after soft-nav.js when present).
 */

const fs = require('node:fs')
const path = require('node:path')

function loadUiBus () {
  try {
    return require('@antora-supplemental/ui-bus/lib')
  } catch (err) {
    return require('../../ui-bus/lib/index.js') // monorepo checkout
  }
}const { ensureUiBus, appendFooterScriptAfter, addOrReplaceAsset } = loadUiBus()

const PACKAGE_ID = '@antora-supplemental/page-state'
const ROOT = path.join(__dirname, '..')
const MARKER = '{{> page-state-context}}'

function ensureArticlePartial (uiCatalog) {
  const article = uiCatalog.findByType('partial').find((f) => f.stem === 'article')
  if (!article) return
  const body = Buffer.isBuffer(article.contents) ? article.contents.toString('utf8') : String(article.contents || '')
  if (!body.includes(MARKER)) article.contents = Buffer.from(`${MARKER}\n${body}`)
}

function addPartial (uiCatalog) {
  const contents = fs.readFileSync(path.join(ROOT, 'partials', 'page-state-context.hbs'))
  const existing = uiCatalog.findByType('partial').find((f) => f.stem === 'page-state-context')
  if (existing) existing.contents = contents
  else uiCatalog.addFile({ contents, path: 'partials/page-state-context.hbs', stem: 'page-state-context', type: 'partial' })
}

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false || config.ui === false) return
    const out = playbook.ui?.outputDir || '_'
    ensureUiBus(uiCatalog, out)
    addPartial(uiCatalog)
    ensureArticlePartial(uiCatalog)
    addOrReplaceAsset(uiCatalog, out, 'js/page-state.js', fs.readFileSync(path.join(ROOT, 'js', 'page-state.js')))
    appendFooterScriptAfter(uiCatalog, 'js/page-state.js', ['soft-nav.js', 'ui-bus.js'])
    logger.info('page-state: page.* values published on UiBus')
  })
}

module.exports = register
module.exports.register = register