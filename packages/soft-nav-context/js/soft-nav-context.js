/**
 * SoftNavContext — page context for Antora supplemental UI + SoftNav.
 *
 * Persistent chrome (search scope, dock) stays in the DOM; this store updates
 * on each in-component navigation from the fetched page metadata.
 *
 * Canonical chrome API: SoftNavContext.signals / global SoftNavSignals
 *   .get(key), .subscribe(key, fn), .subscribeContext(fn)
 *
 * Phases: SoftNavContext.on(phase, handler) — before | context | loaded | failed
 *
 * Load after soft-nav.js, before feature scripts.
 */
;(function (global) {
  'use strict'

  var SCHEMA = 1
  var listeners = { before: [], context: [], loaded: [], failed: [] }
  var currentContext = null
  var signalSubscribers = {}
  var contextSubscribers = []

  var SIGNAL_KEYS = [
    'context',
    'pageUrl',
    'componentName',
    'componentTitle',
    'versionName',
    'versionDisplay',
    'scopeLabel',
  ]

  function trim (s) {
    return String(s || '').trim()
  }

  function pathnameParts (url) {
    try {
      return new URL(url, global.location.href).pathname.split('/').filter(Boolean)
    } catch (e) {
      return []
    }
  }

  function deriveScopeLabel (ctx) {
    if (!ctx) return 'All docs'
    var comp = ctx.component || {}
    var ver = ctx.version || {}
    var title = trim(comp.title || comp.name)
    var display = trim(ver.display || ver.name)
    if (display && title) return title + ' · ' + display
    if (display) return display
    return title || 'All docs'
  }

  function readSignal (key, ctx) {
    if (!ctx) {
      if (key === 'context') return null
      return ''
    }
    if (key === 'context') return ctx
    if (key === 'pageUrl') return trim(ctx.url)
    if (key === 'componentName') return trim(ctx.component && ctx.component.name)
    if (key === 'componentTitle') return trim(ctx.component && ctx.component.title)
    if (key === 'versionName') return trim(ctx.version && ctx.version.name)
    if (key === 'versionDisplay') return trim(ctx.version && ctx.version.display)
    if (key === 'scopeLabel') return deriveScopeLabel(ctx)
    return undefined
  }

  function notifySignalKey (key, ctx) {
    var list = signalSubscribers[key]
    if (!list || !list.length) return
    var value = readSignal(key, ctx)
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](value, ctx)
      } catch (err) {
        console.warn('[soft-nav-context] signal listener error on ' + key, err)
      }
    }
  }

  function flushSignalBatch (ctx) {
    for (var k = 0; k < SIGNAL_KEYS.length; k++) {
      notifySignalKey(SIGNAL_KEYS[k], ctx)
    }
    for (var c = 0; c < contextSubscribers.length; c++) {
      try {
        contextSubscribers[c](ctx)
      } catch (err) {
        console.warn('[soft-nav-context] subscribeContext listener error', err)
      }
    }
  }

  var SoftNavSignals = {
    keys: function () {
      return SIGNAL_KEYS.slice()
    },
    get: function (key) {
      if (SIGNAL_KEYS.indexOf(key) < 0) {
        throw new Error('SoftNavSignals.get: unknown key ' + key)
      }
      return readSignal(key, currentContext)
    },
    subscribe: function (key, fn) {
      if (typeof key === 'function') {
        return SoftNavSignals.subscribeContext(key)
      }
      if (SIGNAL_KEYS.indexOf(key) < 0) {
        throw new Error('SoftNavSignals.subscribe: unknown key ' + key)
      }
      if (!signalSubscribers[key]) signalSubscribers[key] = []
      signalSubscribers[key].push(fn)
      fn(readSignal(key, currentContext), currentContext)
      return function unsubscribe () {
        var list = signalSubscribers[key]
        var idx = list.indexOf(fn)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    subscribeContext: function (fn) {
      contextSubscribers.push(fn)
      if (currentContext) fn(currentContext)
      return function unsubscribe () {
        var idx = contextSubscribers.indexOf(fn)
        if (idx >= 0) contextSubscribers.splice(idx, 1)
      }
    },
  }

  function parseJsonScript (doc) {
    var el = doc.getElementById('soft-nav-page-context')
    if (!el) return null
    var raw = trim(el.textContent)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch (e) {
        /* fall through to data-* */
      }
    }
    var ds = el.dataset || {}
    if (!ds.url && !ds.componentName && !ds.componentTitle) return null
    return {
      schema: Number(ds.schema) || SCHEMA,
      url: ds.url || '',
      title: ds.title || '',
      component: {
        name: ds.componentName || '',
        title: ds.componentTitle || ds.componentName || '',
      },
      version: {
        name: ds.version || '',
        display: ds.versionDisplay || ds.version || '',
      },
    }
  }

  function parseFromSearchRoot (doc) {
    var root = doc.querySelector('[data-valentus-search-chat]')
    if (!root) return null
    return {
      schema: SCHEMA,
      component: {
        name: trim(root.getAttribute('data-component-name')),
        title: trim(root.getAttribute('data-component-title')),
      },
      version: {
        name: trim(root.getAttribute('data-version')),
        display: trim(root.getAttribute('data-version-display')),
      },
    }
  }

  function normalizeContext (raw, url, doc) {
    var base = raw && typeof raw === 'object' ? raw : {}
    var parts = pathnameParts(url || global.location.href)
    var comp = base.component && typeof base.component === 'object' ? base.component : {}
    var ver = base.version && typeof base.version === 'object' ? base.version : {}
    if (!comp.name && parts.length) comp.name = parts[0]
    return {
      schema: base.schema || SCHEMA,
      url: trim(base.url || url || global.location.href),
      title: trim(base.title || docTitle(doc)),
      component: {
        name: trim(comp.name),
        title: trim(comp.title || comp.name),
      },
      version: {
        name: trim(ver.name || ver.version),
        display: trim(ver.display || ver.displayVersion || ver.name),
      },
    }
  }

  function docTitle (doc) {
    if (!doc) return ''
    var t = doc.querySelector('title')
    return t ? trim(t.textContent) : ''
  }

  function parseDocument (doc, url) {
    if (!doc) doc = global.document
    var fromJson = parseJsonScript(doc)
    var merged = fromJson || parseFromSearchRoot(doc) || { schema: SCHEMA }
    if (!fromJson && docTitle(doc)) merged.title = docTitle(doc)
    if (!merged.url && url) merged.url = url
    return normalizeContext(merged, merged.url || url, doc)
  }

  function emit (phase, detail) {
    var list = listeners[phase] || []
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](detail)
      } catch (err) {
        console.warn('[soft-nav-context] listener error on ' + phase, err)
      }
    }
    global.document.dispatchEvent(
      new CustomEvent('soft-nav-context:' + phase, { detail: detail })
    )
  }

  function setContext (next) {
    currentContext = next
    emit('context', next)
    flushSignalBatch(next)
  }

  var SoftNavContext = {
    schema: SCHEMA,
    signals: SoftNavSignals,
    get context () {
      return currentContext
    },
    on: function (phase, handler) {
      if (!listeners[phase]) throw new Error('SoftNavContext.on: unknown phase ' + phase)
      listeners[phase].push(handler)
      return function unsubscribe () {
        var list = listeners[phase]
        var idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    /** @deprecated Prefer SoftNavSignals.subscribeContext or .subscribe('context', fn) */
    subscribe: function (fn) {
      return SoftNavSignals.subscribeContext(fn)
    },
    /** @deprecated Prefer SoftNavSignals.get / .subscribe(key, fn) */
    signal: function (key) {
      var legacy = { url: 'pageUrl', title: 'title' }
      var mapped = legacy[key] || key
      if (mapped === 'title') {
        return {
          get value () {
            return currentContext && currentContext.title
          },
          subscribe: function (fn) {
            return SoftNavSignals.subscribe('context', function (ctx) {
              fn(ctx && ctx.title)
            })
          },
        }
      }
      if (SIGNAL_KEYS.indexOf(mapped) < 0) {
        throw new Error('SoftNavContext.signal: unknown key ' + key)
      }
      return {
        get value () {
          return SoftNavSignals.get(mapped)
        },
        subscribe: function (fn) {
          return SoftNavSignals.subscribe(mapped, fn)
        },
      }
    },
    parseDocument: parseDocument,
  }

  function hookSoftNav () {
    var sn = global.SoftNav
    if (sn && typeof sn.on === 'function') {
      sn.on('before', function (ctx) {
        emit('before', ctx)
      })
      sn.on('loaded', function (ctx) {
        if (ctx && ctx.doc) {
          setContext(parseDocument(ctx.doc, ctx.url))
        }
        emit('loaded', ctx)
      })
      sn.on('failed', function (ctx) {
        emit('failed', ctx)
      })
      return
    }
    global.document.addEventListener('soft-nav:before', function (e) {
      emit('before', e.detail || {})
    })
    global.document.addEventListener('soft-nav:loaded', function (e) {
      var ctx = e.detail || {}
      if (ctx.doc) setContext(parseDocument(ctx.doc, ctx.url))
      emit('loaded', ctx)
    })
    global.document.addEventListener('soft-nav:failed', function (e) {
      emit('failed', e.detail || {})
    })
  }

  setContext(parseDocument(global.document, global.location.href))
  hookSoftNav()
  global.SoftNavSignals = SoftNavSignals
  global.SoftNavContext = SoftNavContext
})(typeof window !== 'undefined' ? window : globalThis)
