/* @antora-supplemental/color-scheme live paint (opt-in: livePaint.enabled).
   Inlined in <head> right after the scheme hook, before paint stylesheets
   apply, so the chosen paint is in place for the first paint.

   Config comes from window.__colorSchemeLivePaint (written by the extension):
     { param, cookie, cookiePath, root, paints: { id: href }, allowOrigins: [] }
   Only ids in `paints` load; the query string never supplies a URL.
   Order: ?<param>=<id> beats the cookie. ?<param>=reset clears the cookie.

   A "base" paint is any <link rel=stylesheet> whose href matches a paints
   entry (for example css/default-paint.css linked by default-paint). While a
   live paint is active the other base links are disabled (media="not all"),
   including ones the parser adds after this script. */
(function () {
  var cfg = window.__colorSchemeLivePaint
  if (!cfg || window.ColorSchemePaint) return
  var ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  var html = document.documentElement
  var paints = cfg.paints || {}
  var param = cfg.param || 'paint'
  var cookieName = cfg.cookie || 'cs-paint'
  var cookiePath = cfg.cookiePath || '/'
  var root = cfg.root || ''
  var current = null
  var live = null

  function has (id) { return typeof id === 'string' && ID.test(id) && id !== 'reset' && Object.prototype.hasOwnProperty.call(paints, id) }
  function href (id) {
    var v = paints[id]
    return /^(https?:)?\/\//.test(v) || v.charAt(0) === '/' ? v : root.replace(/\/$/, '') + '/' + v
  }
  function tail (h) { return String(h || '').replace(/[?#].*$/, '').replace(/^.*?\/(css\/|[^/]+$)/, '$1') }
  function baseIdOf (link) {
    var t = tail(link.getAttribute('href'))
    for (var id in paints) if (has(id) && tail(href(id)) === t) return id
    return null
  }
  function readCookie () {
    var m = ('; ' + document.cookie).match(new RegExp('; ' + cookieName.replace(/[^\w-]/g, '') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  }
  function writeCookie (id) {
    var base = cookieName + '=' + (id ? encodeURIComponent(id) : '') + '; Path=' + cookiePath + '; SameSite=Lax'
    document.cookie = base + (id ? '; Max-Age=31536000' : '; Max-Age=0')
  }
  function sweep (link) {
    if (link === live || !link.getAttribute || !/\bstylesheet\b/.test(link.getAttribute('rel') || '')) return
    var id = baseIdOf(link)
    if (!id) return
    if (!link.hasAttribute('data-color-scheme-media')) link.setAttribute('data-color-scheme-media', link.getAttribute('media') || '')
    var on = !current || id === current
    var media = link.getAttribute('data-color-scheme-media')
    if (on) { if (media) link.setAttribute('media', media); else link.removeAttribute('media') } else link.setAttribute('media', 'not all')
  }
  function sweepAll () {
    var links = document.querySelectorAll('link[rel~="stylesheet"]')
    for (var i = 0; i < links.length; i++) sweep(links[i])
  }
  function apply (id) {
    current = id
    var baseLoaded = false
    var links = document.querySelectorAll('link[rel~="stylesheet"]')
    for (var i = 0; i < links.length; i++) if (links[i] !== live && id && baseIdOf(links[i]) === id) baseLoaded = true
    var want = id && !baseLoaded ? href(id) : null
    if (want) {
      if (!live) {
        live = document.createElement('link')
        live.rel = 'stylesheet'
        live.setAttribute('data-color-scheme-paint', '')
        var anchor = document.currentScript
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(live, anchor.nextSibling)
        else document.head.appendChild(live)
      }
      if (live.getAttribute('href') !== want) live.setAttribute('href', want)
    } else if (live) {
      live.parentNode && live.parentNode.removeChild(live)
      live = null
    }
    sweepAll()
    if (id) html.setAttribute('data-color-scheme-paint', id)
    else html.removeAttribute('data-color-scheme-paint')
  }

  var q = null
  try { q = new URLSearchParams(window.location.search).get(param) } catch (e) {}
  var initial = null
  if (q === 'reset') writeCookie(null)
  else if (has(q)) { initial = q; writeCookie(q) } else {
    var c = readCookie()
    if (has(c)) initial = c
    else if (c) writeCookie(null)
  }
  apply(initial)

  // Base paint links parsed after this script (e.g. default-paint at the end of head-styles).
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (records) {
      if (!current) return
      for (var r = 0; r < records.length; r++) {
        var added = records[r].addedNodes
        for (var n = 0; n < added.length; n++) if (added[n].nodeName === 'LINK') sweep(added[n])
      }
    })
    mo.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('DOMContentLoaded', function () { mo.disconnect(); apply(current) })
  }

  window.ColorSchemePaint = {
    ids: function () { return Object.keys(paints).filter(has) },
    get: function () { return current },
    /** id from the paints map, or null / 'reset' for the built-in paint. Returns false for unknown ids. */
    set: function (id) {
      if (id === null || id === undefined || id === 'reset') { writeCookie(null); apply(null); return true }
      if (!has(id)) return false
      writeCookie(id)
      apply(id)
      return true
    },
    allowOrigins: (cfg.allowOrigins || []).slice(),
  }
})()
