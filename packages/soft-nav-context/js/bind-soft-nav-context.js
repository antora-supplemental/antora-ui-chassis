/**
 * bindSoftNavContext — lifecycle helper for Antora supplemental extensions.
 *
 *   bindSoftNavContext({
 *     onBoot: function () {},
 *     onBefore: function (navCtx) {},
 *     onContext: function (pageContext) {},
 *     onLoaded: function (navCtx) {},
 *   })
 *
 * Prefers SoftNavContext when present; else SoftNav; else DOMContentLoaded.
 */
;(function (global) {
  'use strict'

  function bindSoftNavContext (handlers) {
    handlers = handlers || {}
    var boot = handlers.onBoot
    var onBefore = handlers.onBefore
    var onContext = handlers.onContext
    var onLoaded = handlers.onLoaded

    if (global.SoftNavContext && typeof global.SoftNavContext.on === 'function') {
      if (onBefore) global.SoftNavContext.on('before', onBefore)
      if (onContext) {
        global.SoftNavContext.on('context', onContext)
        if (global.SoftNavContext.context) onContext(global.SoftNavContext.context)
      }
      if (onLoaded) global.SoftNavContext.on('loaded', onLoaded)
      return
    }

    function onSoftNavLoaded (fn) {
      if (global.SoftNav && typeof global.SoftNav.on === 'function') {
        global.SoftNav.on('loaded', fn)
      } else {
        global.document.addEventListener('soft-nav:loaded', function (e) {
          fn(e.detail || {})
        })
      }
    }

    if (boot) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot)
      } else {
        boot()
      }
    }
    if (onLoaded) onSoftNavLoaded(onLoaded)
  }

  global.bindSoftNavContext = bindSoftNavContext
})(typeof window !== 'undefined' ? window : globalThis)
