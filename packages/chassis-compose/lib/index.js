'use strict'

/**
 * Meta Antora extension for chassis build-time extensions.
 *
 * Registers, in load order: ui-bus, soft-nav, page-state.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/chassis-compose'
 *         # softNav: false            # disable one member
 *         # pageState: { ui: false }  # nested override
 */

const { resolveChildConfig } = require('./resolve-config.js')

const MEMBERS = [
  ['uiBus', '@antora-supplemental/ui-bus'],
  ['softNav', '@antora-supplemental/soft-nav'],
  ['pageState', '@antora-supplemental/page-state'],
]

function register (context = {}) {
  const config = context.config || context || {}
  const logger = this.getLogger('@antora-supplemental/chassis-compose')
  for (const [key, id] of MEMBERS) {
    const child = resolveChildConfig(config, key)
    if (child === null) {
      logger.info('Bundle: %s disabled', id)
      continue
    }
    require(id).register.call(this, { config: child })
    logger.info('Bundle: %s enabled', id)
  }
}

module.exports = register
module.exports.register = register
module.exports.MEMBERS = MEMBERS
Object.assign(module.exports, require('./resolve-config.js'))