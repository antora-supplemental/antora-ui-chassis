/* @antora-supplemental/color-scheme live paint (opt-in: live_paint.enabled).
   A preview and demo feature, separate from the color scheme picker: it swaps
   the whole paint stylesheet at view time. Inlined in <head> right after
   css/color-scheme.css, before paint stylesheets apply.

   Config comes from window.__colorSchemeLivePaint (written by the extension):
     { param, cookie, cookiePath, root, allowOrigins: [], paints: { id: href }, meta: { id: { label } } }
   Only ids in `paints` load; the query string never supplies a URL.

   Storage: cookie <cookie> (one year). Query: ?<param>=<id>; ?<param>=reset
   goes back to the site's own paint.

   A "base" paint is any <link rel=stylesheet> whose href matches a paints
   entry (for example css/default-paint.css linked by default-paint). While a
   different paint is active the other base links are disabled
   (media="not all"), including ones the parser adds after this script. */
(function () {
  var cfg = window.__colorSchemeLivePaint
  if (!cfg || window.ColorSchemePaint) return
  var ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  var html = document.documentElement
  var paints = cfg.paints || {}
  var meta = cfg.meta || {}
  var param = cfg.param || 'paint'
  var cookieName = cfg.cookie || 'cs-paint'
  var cookiePath = cfg.cookiePath || '/'
  var root = cfg.root || ''
  var anchor = document.currentScript
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
  function readCookie (name) {
    var m = ('; ' + document.cookie).match(new RegExp('; ' + name.replace(/[^\w-]/g, '') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  }
  function writeCookie (value) {
    var base = cookieName + '=' + (value ? encodeURIComponent(value) : '') + '; Path=' + cookiePath + '; SameSite=Lax'
    document.cookie = base + (value ? '; Max-Age=31536000' : '; Max-Age=0')
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
  function load (id) {
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
  function choose (id) {
    if (id === null || id === undefined || id === 'reset') { writeCookie(null); load(null); return true }
    if (!has(id)) return false
    writeCookie(id)
    load(id)
    return true
  }

  var q = null
  try { q = new URLSearchParams(window.location.search).get(param) } catch (e) {}
  var saved = readCookie(cookieName)
  if (q === 'reset') choose(null)
  else if (has(q)) choose(q)
  else if (has(saved)) load(saved)
  else { if (saved) writeCookie(null); load(null) }

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
    document.addEventListener('DOMContentLoaded', function () { mo.disconnect(); load(current) })
  }

  window.ColorSchemePaint = {
    ids: function () { return Object.keys(paints).filter(has) },
    get: function () { return current },
    set: choose,
    info: function (id) { return { id: id, label: (meta[id] && meta[id].label) || id } },
    allowOrigins: (cfg.allowOrigins || []).slice(),
  }
})()
