'use strict'

/**
 * @antora-supplemental/soft-nav - Antora extension.
 * Publishes js/soft-nav.js and injects it right after ui-bus.js (which it
 * ensures is present). SoftNav publishes nav:before | nav:loaded | nav:failed
 * on UiBus.events.
 */

const fs = require('node:fs')
const path = require('node:path')

function loadUiBus () {
  try {
    return require('@antora-supplemental/ui-bus/lib')
  } catch (err) {
    return require('../../ui-bus/lib/index.js') // monorepo checkout
  }
}const { ensureUiBus, appendFooterScriptAfter, addOrReplaceAsset, footerAlreadyReferences } = loadUiBus()

const PACKAGE_ID = '@antora-supplemental/soft-nav'
const JS = path.join(__dirname, '..', 'js', 'soft-nav.js')

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false || config.ui === false) return
    const out = playbook.ui?.outputDir || '_'
    ensureUiBus(uiCatalog, out)
    addOrReplaceAsset(uiCatalog, out, 'js/soft-nav.js', fs.readFileSync(JS))
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav.js', ['ui-bus.js'])
    logger.info('SoftNav: runtime injected after ui-bus.js')
  })
}

module.exports = register
module.exports.register = register
module.exports.appendFooterScriptAfter = appendFooterScriptAfter
module.exports.footerAlreadyReferences = footerAlreadyReferences