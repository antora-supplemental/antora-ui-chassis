/**
 * bindSoftNavContext — lifecycle convenience for Antora supplemental extensions.
 *
 * Persistent chrome should subscribe via SoftNavSignals (see soft-nav-context.js).
 * This helper wires boot / nav phases and maps onContext → signals.subscribe('context').
 */
;(function (global) {
  'use strict'

  function signalsApi () {
    if (global.SoftNavSignals) return global.SoftNavSignals
    if (global.SoftNavContext && global.SoftNavContext.signals) {
      return global.SoftNavContext.signals
    }
    return null
  }

  function onSoftNavPhase (phase, fn) {
    if (global.SoftNav && typeof global.SoftNav.on === 'function') {
      global.SoftNav.on(phase, fn)
      return
    }
    global.document.addEventListener('soft-nav:' + phase, function (e) {
      fn(e.detail || {})
    })
  }

  function bindSoftNavContext (handlers) {
    handlers = handlers || {}
    var boot = handlers.onBoot
    var onBefore = handlers.onBefore
    var onContext = handlers.onContext
    var onLoaded = handlers.onLoaded

    var signals = signalsApi()
    if (global.SoftNavContext && typeof global.SoftNavContext.on === 'function') {
      if (onBefore) global.SoftNavContext.on('before', onBefore)
      if (onContext) {
        if (signals) signals.subscribe('context', onContext)
        else {
          global.SoftNavContext.on('context', onContext)
          if (global.SoftNavContext.context) onContext(global.SoftNavContext.context)
        }
      }
      if (onLoaded) global.SoftNavContext.on('loaded', onLoaded)
      if (boot) boot()
      return
    }

    if (boot) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot)
      } else {
        boot()
      }
    }
    if (onBefore) onSoftNavPhase('before', onBefore)
    if (onLoaded) onSoftNavPhase('loaded', onLoaded)
  }

  global.bindSoftNavContext = bindSoftNavContext
})(typeof window !== 'undefined' ? window : globalThis)
