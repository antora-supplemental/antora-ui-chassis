'use strict'

function resolveChildConfig (config = {}, key, disableWhenFalse) {
  if (config.enabled === false) return null
  if (config[key] === false) return null

  const nested = config[key]
  if (nested && typeof nested === 'object') {
    if (nested.enabled === false) return null
    const { enabled: _enabled, ...child } = nested
    return child
  }

  const { enabled: _enabled, ...rest } = config
  void _enabled
  for (const k of disableWhenFalse) {
    delete rest[k]
  }
  return rest
}

function resolveSoftNavConfig (config = {}) {
  return resolveChildConfig(config, 'softNav', ['softNav', 'softNavContext'])
}

function resolveSoftNavContextConfig (config = {}) {
  return resolveChildConfig(config, 'softNavContext', ['softNav', 'softNavContext'])
}

module.exports = {
  resolveSoftNavConfig,
  resolveSoftNavContextConfig,
}
