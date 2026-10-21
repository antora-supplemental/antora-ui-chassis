'use strict'

/**
 * Meta Antora extension for chassis build-time extensions.
 *
 * Registers bundled members: soft-nav (runtime inject), soft-nav-context.
 * Copy-only UI packages (content-viewport, …) stay manual.
 *
 * Playbook:
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/chassis-compose'
 *         # softNav: { ui: false }           # nested override (optional)
 *         # softNavContext: { ui: false }
 */

const softNav = require('@antora-supplemental/soft-nav')
const softNavContext = require('@antora-supplemental/soft-nav-context')
const {
  resolveSoftNavConfig,
  resolveSoftNavContextConfig,
} = require('./resolve-config.js')

const PACKAGE = '@antora-supplemental/chassis-compose'
const SOFT_NAV = '@antora-supplemental/soft-nav'
const SOFT_NAV_CONTEXT = '@antora-supplemental/soft-nav-context'

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE)

  const softNavConfig = resolveSoftNavConfig(config)
  if (softNavConfig === null) {
    logger.info('Bundle: soft-nav disabled')
  } else {
    softNav.register.call(this, { config: softNavConfig })
    logger.info('Bundle: %s enabled', SOFT_NAV)
  }

  const childConfig = resolveSoftNavContextConfig(config)
  if (childConfig === null) {
    logger.info('Bundle: soft-nav-context disabled')
    return
  }

  softNavContext.register.call(this, { config: childConfig })
  logger.info('Bundle: %s enabled', SOFT_NAV_CONTEXT)
}

module.exports = register
module.exports.register = register
module.exports.resolveSoftNavConfig = resolveSoftNavConfig
module.exports.resolveSoftNavContextConfig = resolveSoftNavContextConfig
