/**
 * AdtChrome compatibility helper for Antora supplemental extensions.
 *
 * Prefer AdtChrome when present; otherwise SoftNav events; else DOMContentLoaded boot.
 *
 *   adtChromeBind({
 *     onBoot: function () { /* first full load *\/ },
 *     onBefore: function (ctx) { },
 *     onContext: function (pageContext) { },
 *     onLoaded: function (navCtx) { },
 *   })
 */
;(function (global) {
  'use strict'

  function adtChromeBind (handlers) {
    handlers = handlers || {}
    var boot = handlers.onBoot
    var onBefore = handlers.onBefore
    var onContext = handlers.onContext
    var onLoaded = handlers.onLoaded

    if (global.AdtChrome && typeof global.AdtChrome.on === 'function') {
      if (onBefore) global.AdtChrome.on('before', onBefore)
      if (onContext) {
        global.AdtChrome.on('context', onContext)
        if (global.AdtChrome.context) onContext(global.AdtChrome.context)
      }
      if (onLoaded) global.AdtChrome.on('loaded', onLoaded)
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
    if (onContext && boot) {
      onSoftNavLoaded(function (ctx) {
        if (ctx && ctx.doc && global.AdtChrome && global.AdtChrome.parseDocument) {
          onContext(global.AdtChrome.parseDocument(ctx.doc, ctx.url))
        }
      })
    }
  }

  global.adtChromeBind = adtChromeBind
})(typeof window !== 'undefined' ? window : globalThis)
