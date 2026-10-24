'use strict'

const MEMBER_KEYS = ['uiBus', 'softNav', 'pageState']

function resolveChildConfig (config = {}, key) {
  if (config.enabled === false) return null
  if (config[key] === false) return null
  const nested = config[key]
  if (nested && typeof nested === 'object') {
    if (nested.enabled === false) return null
    const { enabled: _enabled, ...child } = nested
    return child
  }
  const { enabled: _enabled, ...rest } = config
  for (const k of MEMBER_KEYS) delete rest[k]
  return rest
}

module.exports = {
  MEMBER_KEYS,
  resolveChildConfig,
  resolveUiBusConfig: (c) => resolveChildConfig(c, 'uiBus'),
  resolveSoftNavConfig: (c) => resolveChildConfig(c, 'softNav'),
  resolvePageStateConfig: (c) => resolveChildConfig(c, 'pageState'),
}