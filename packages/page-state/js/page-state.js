/**
 * page-state - publishes the current Antora page's context as UiBus state.
 *
 * Reads the per-page `#page-state-context` script (component, version, url,
 * title) on load and again after every `nav:loaded`, then sets:
 *
 *   page.context            whole normalized object
 *   page.url  page.title
 *   page.component.name     page.component.title
 *   page.version.name       page.version.display
 *   page.scopeLabel         "Component · Version" (or "All docs")
 *
 * Consumers: UiBus.state.watch('page.component.name', fn)
 * Load after ui-bus.js (and after soft-nav.js when present).
 */
;(function (global) {
  'use strict'

  var SCHEMA = 1
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
    if (display && title) return title + ' \u00b7 ' + display
    if (display) return display
    return title || 'All docs'
  }

  function parseJsonScript (doc) {
    var el = doc.getElementById('page-state-context')
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

  function publish (ctx) {
    var s = global.UiBus.state
    s.set('page.context', ctx)
    s.set('page.url', ctx.url)
    s.set('page.title', ctx.title)
    s.set('page.component.name', ctx.component.name)
    s.set('page.component.title', ctx.component.title)
    s.set('page.version.name', ctx.version.name)
    s.set('page.version.display', ctx.version.display)
    s.set('page.scopeLabel', deriveScopeLabel(ctx))
  }

  if (!global.UiBus) {
    console.warn('[page-state] UiBus not loaded; load ui-bus.js before page-state.js')
    return
  }
  publish(parseDocument(global.document, global.location.href))
  global.UiBus.events.on('nav:loaded', function (ctx) {
    if (ctx && ctx.doc) publish(parseDocument(ctx.doc, ctx.url))
  })
})(typeof window !== 'undefined' ? window : globalThis)