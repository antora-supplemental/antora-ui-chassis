/* @antora-supplemental/color-scheme live paint and slots (opt-in: live_paint.enabled).
   Inlined in <head> right after css/color-scheme.css, before paint stylesheets
   apply, so the chosen scheme is in place for the first paint.

   Config comes from window.__colorSchemeLivePaint (written by the extension):
     { param, cookie, cookiePath, root, allowOrigins: [], slotPolicy,
       paints: { id: href }, meta: { id: { label, slots: ['light','dark'], base } },
       slots: { light: id|null, dark: id|null } }
   Only ids in `paints` load; the query string never supplies a URL.

   Two light/dark slots each hold a scheme (null = the site's built-in paint).
   The active scheme is the slot scheme for the resolved light/dark state, unless
   the visitor picked an off-slot scheme for this session: then that scheme is
   pinned and light/dark automation is off until they choose a slot scheme or
   "auto". A scheme fits the slots it declares; slot_policy 'any' lets any
   scheme go in either slot.

   Storage: cookie <cookie>-slots "light.dark" (one year; "-" = built-in) and
   session cookie <cookie> for an off-slot pick.
   Query: ?<param>=<id> chooses like setPaint; ?<param>=reset clears both;
   ?cs-preview=<id>[&cs-preview-mode=light|dark] shows a scheme without saving
   (used by the picker page previews).

   A "base" paint is any <link rel=stylesheet> whose href matches a paints
   entry (for example css/default-paint.css linked by default-paint). While a
   different scheme is active the other base links are disabled
   (media="not all"), including ones the parser adds after this script. */
(function () {
  var cfg = window.__colorSchemeLivePaint
  if (!cfg || window.ColorSchemePaint) return
  var ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  var html = document.documentElement
  var paints = cfg.paints || {}
  var meta = cfg.meta || {}
  var anySlot = cfg.slotPolicy === 'any'
  var param = cfg.param || 'paint'
  var cookieName = cfg.cookie || 'cs-paint'
  var slotsCookie = cookieName + '-slots'
  var cookiePath = cfg.cookiePath || '/'
  var root = cfg.root || ''
  var anchor = document.currentScript
  var current = null
  var live = null
  var dark = html.classList.contains('dark-theme')
  var defaults = { light: (cfg.slots && cfg.slots.light) || null, dark: (cfg.slots && cfg.slots.dark) || null }
  var slots = { light: defaults.light, dark: defaults.dark }
  var session = null
  var preview = false

  function has (id) { return typeof id === 'string' && ID.test(id) && id !== 'reset' && id !== 'auto' && Object.prototype.hasOwnProperty.call(paints, id) }
  function declared (id) { return id === null ? ['light', 'dark'] : ((meta[id] && meta[id].slots) || ['light', 'dark']) }
  function fits (id, slot) { return (id === null || has(id)) && (slot === 'light' || slot === 'dark') && (anySlot || declared(id).indexOf(slot) >= 0) }
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
  function writeCookie (name, value, persistent) {
    if (preview) return
    var base = name + '=' + (value ? encodeURIComponent(value) : '') + '; Path=' + cookiePath + '; SameSite=Lax'
    document.cookie = base + (!value ? '; Max-Age=0' : persistent ? '; Max-Age=31536000' : '')
  }
  function saveSlots () {
    if (slots.light === defaults.light && slots.dark === defaults.dark) writeCookie(slotsCookie, null)
    else writeCookie(slotsCookie, (slots.light || '-') + '.' + (slots.dark || '-'), true)
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
    if (session) html.setAttribute('data-color-scheme-off-slot', session)
    else html.removeAttribute('data-color-scheme-off-slot')
  }
  function refresh () { load(session || slots[dark ? 'dark' : 'light']) }

  /** Choose a scheme: null/'auto' = automation on with the current slots;
      a scheme that fits the current light/dark slot goes into that slot;
      any other scheme is an off-slot pick for this session. */
  function choose (id) {
    if (id === null || id === undefined || id === 'auto') {
      session = null
      writeCookie(cookieName, null)
      refresh()
      return true
    }
    if (!has(id)) return false
    var slot = dark ? 'dark' : 'light'
    if (fits(id, slot)) {
      session = null
      writeCookie(cookieName, null)
      slots[slot] = id
      saveSlots()
    } else {
      session = id
      writeCookie(cookieName, id)
    }
    refresh()
    return true
  }
  function assign (slot, id) {
    if (id === 'builtin' || id === undefined) id = null
    if (!fits(id, slot)) return false
    slots[slot] = id
    saveSlots()
    refresh()
    return true
  }
  function reset () {
    session = null
    slots = { light: defaults.light, dark: defaults.dark }
    writeCookie(cookieName, null)
    writeCookie(slotsCookie, null)
    refresh()
  }

  var q = null
  var pv = null
  var pvMode = null
  try {
    var sp = new URLSearchParams(window.location.search)
    q = sp.get(param)
    pv = sp.get('cs-preview')
    pvMode = sp.get('cs-preview-mode')
  } catch (e) {}
  var saved = readCookie(slotsCookie)
  if (saved && /^[^.]+\.[^.]+$/.test(saved)) {
    var parts = saved.split('.')
    var l = parts[0] === '-' ? null : parts[0]
    var d = parts[1] === '-' ? null : parts[1]
    if (fits(l, 'light')) slots.light = l
    if (fits(d, 'dark')) slots.dark = d
  } else if (saved) writeCookie(slotsCookie, null)
  var s = readCookie(cookieName)
  if (has(s)) session = s
  else if (s) writeCookie(cookieName, null)
  if (pv !== null && (has(pv) || pv === 'builtin')) {
    preview = true
    session = pv === 'builtin' ? null : pv
    if (pvMode === 'light' || pvMode === 'dark') {
      dark = pvMode === 'dark'
      if (pv === 'builtin') slots[pvMode] = null
      html.setAttribute('data-color-scheme-preview', pvMode)
    }
    refresh()
  } else if (q === 'reset') reset()
  else if (has(q)) choose(q)
  else refresh()

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
    set: function (id) { return id === 'reset' ? (reset(), true) : choose(id) },
    assign: assign,
    fits: fits,
    slotsOf: function (id) { return anySlot ? ['light', 'dark'] : declared(id).slice() },
    slots: function () { return { light: slots.light, dark: slots.dark } },
    info: function (id) { var m = meta[id] || {}; return { id: id, label: m.label || id, slots: declared(id).slice(), base: m.base || null } },
    /** Off-slot scheme pinned for this session, or null while automation is on. */
    offSlot: function () { return session ? { id: session, base: (meta[session] && meta[session].base) || 'light' } : null },
    preview: function () { return preview ? (pvMode || null) : false },
    /** Called by the light/dark layer whenever the resolved scheme changes. */
    sync: function (isDark) {
      if (preview && pvMode) return
      isDark = !!isDark
      if (isDark === dark) return
      dark = isDark
      refresh()
    },
    allowOrigins: (cfg.allowOrigins || []).slice(),
  }
})()
