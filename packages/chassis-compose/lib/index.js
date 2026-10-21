'use strict'

/**
 * Meta Antora extension for chassis build-time extensions.
 *
 * Registers bundled members (today: soft-nav-context). Copy-only UI packages
 * (soft-nav.js, content-viewport, …) stay manual — require those packages or
 * copy assets into supplemental-ui.
 *
 * Playbook:
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/chassis-compose'
 *         # softNavContext: { ui: false }  # nested override (optional)
 */

const softNavContext = require('@antora-supplemental/soft-nav-context')

const PACKAGE = '@antora-supplemental/chassis-compose'
const SOFT_NAV_CONTEXT = '@antora-supplemental/soft-nav-context'

/**
 * @param {object} [config] extension config from playbook or compose pack
 * @returns {object|null} child config, or null when soft-nav-context is disabled
 */
function resolveSoftNavContextConfig (config = {}) {
  if (config.enabled === false) return null
  if (config.softNavContext === false) return null

  const nested = config.softNavContext
  if (nested && typeof nested === 'object') {
    if (nested.enabled === false) return null
    const { enabled: _enabled, ...child } = nested
    return child
  }

  const { enabled: _enabled, softNavContext: _nested, ...child } = config
  return child
}

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger(PACKAGE)
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
module.exports.resolveSoftNavContextConfig = resolveSoftNavContextConfig
