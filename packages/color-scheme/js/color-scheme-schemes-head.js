/* @antora-supplemental/color-scheme schemes and slots. Inlined in <head> before
   paint stylesheets apply, so the chosen scheme is in place for the first paint.
   The extension adds it only when the active paint has schemes beyond light
   and dark, or the site sets color_scheme slots.

   A paint provides named color schemes. `light` (its :root block) and `dark`
   (its html.dark-theme block) always exist; a paint can add more with
   html[data-scheme="<id>"] blocks declared in its @color-schemes manifest.
   This hook sets html[data-scheme] to the active scheme; nothing is loaded.

   Config comes from window.__colorSchemes (written by the extension):
     { param, cookie, cookiePath, slotPolicy,
       schemes: { id: { label, slots: ['light','dark'] | [] (none), base } },
       slots: { light: id, dark: id } }

   Two light/dark slots each hold a scheme. The active scheme is the slot
   scheme for the resolved light/dark state. A scheme marked light, dark or
   both is a slot candidate: choosing it assigns it to a slot (the current
   mode's slot when it fits, else the slot it declares) and never turns light/
   dark automation off. Only a scheme with slot none (not made for light/dark)
   is an off-slot pick: it is pinned for this session and automation is off
   until the visitor chooses "auto" or any slot scheme. slot_policy 'any' lets
   a light, dark or both scheme go in either slot; a none scheme never does.

   Storage: cookie <cookie>-slots "light.dark" (one year) and session cookie
   <cookie> for a none-scheme pick.
   Query: ?<param>=<id> chooses like setScheme; ?<param>=reset clears both;
   ?cs-preview=<id>[&cs-preview-mode=light|dark] shows a scheme without saving
   (used by the picker page previews). */
(function () {
  var cfg = window.__colorSchemes
  if (!cfg || window.ColorSchemes) return
  var html = document.documentElement
  var schemes = cfg.schemes || {}
  var anySlot = cfg.slotPolicy === 'any'
  var param = cfg.param || 'scheme'
  var cookieName = cfg.cookie || 'cs-scheme'
  var slotsCookie = cookieName + '-slots'
  var cookiePath = cfg.cookiePath || '/'
  var current = null
  // This hook runs before the light/dark head hook, so resolve light/dark the
  // same way it will (stored choice, then the system when follow_system is on):
  // ?scheme=<both-slot scheme> must land in the slot of the mode the page shows.
  var dark = html.classList.contains('dark-theme')
  if (!dark && !html.hasAttribute('data-theme')) {
    try {
      var ldm = localStorage.getItem('antora-theme-mode') || localStorage.getItem('antora-theme')
      var follow = document.querySelector('meta[name="light-dark-mode-follow-system"]')
      if (ldm === 'dark') dark = true
      else if (ldm !== 'light') dark = !(follow && follow.content === 'off') && window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch (e) {}
  }
  var defaults = { light: (cfg.slots && cfg.slots.light) || 'light', dark: (cfg.slots && cfg.slots.dark) || 'dark' }
  var slots = { light: defaults.light, dark: defaults.dark }
  var session = null
  var preview = false

  function has (id) { return typeof id === 'string' && id !== 'reset' && id !== 'auto' && Object.prototype.hasOwnProperty.call(schemes, id) }
  function declared (id) { return (schemes[id] && schemes[id].slots) || [] }
  function slotScheme (id) { return has(id) && declared(id).length > 0 }
  function fits (id, slot) { return slotScheme(id) && (slot === 'light' || slot === 'dark') && (anySlot || declared(id).indexOf(slot) >= 0) }
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
    else writeCookie(slotsCookie, slots.light + '.' + slots.dark, true)
  }
  function refresh () {
    current = session || slots[dark ? 'dark' : 'light']
    html.setAttribute('data-scheme', current)
    if (session) html.setAttribute('data-color-scheme-off-slot', session)
    else html.removeAttribute('data-color-scheme-off-slot')
  }

  /** null/'auto' = automation on with the current slots. A slot scheme goes into
      the current mode's slot when it fits, else into the slot it declares;
      automation stays on. Only a none scheme is an off-slot pick. */
  function choose (id) {
    if (id === null || id === undefined || id === 'auto') {
      session = null
      writeCookie(cookieName, null)
      refresh()
      return true
    }
    if (!has(id)) return false
    var slot = dark ? 'dark' : 'light'
    if (!fits(id, slot)) slot = slot === 'dark' ? 'light' : 'dark'
    if (fits(id, slot)) {
      session = null
      writeCookie(cookieName, null)
      slots[slot] = id
      saveSlots()
    } else if (slotScheme(id)) {
      return false
    } else {
      session = id
      writeCookie(cookieName, id)
    }
    refresh()
    return true
  }
  function assign (slot, id) {
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
    if (fits(parts[0], 'light')) slots.light = parts[0]
    if (fits(parts[1], 'dark')) slots.dark = parts[1]
  } else if (saved) writeCookie(slotsCookie, null)
  var s = readCookie(cookieName)
  if (has(s) && !slotScheme(s)) session = s
  else if (s) writeCookie(cookieName, null)
  if (pv !== null && has(pv)) {
    preview = true
    session = pv
    if (pvMode === 'light' || pvMode === 'dark') {
      dark = pvMode === 'dark'
      html.setAttribute('data-color-scheme-preview', pvMode)
    }
    refresh()
  } else if (q === 'reset') reset()
  else if (has(q)) choose(q)
  else refresh()

  function info (id) {
    var m = schemes[id] || {}
    return { id: id, label: m.label || id, slots: declared(id).slice(), base: m.base || 'light' }
  }
  window.ColorSchemes = {
    ids: function () { return Object.keys(schemes).filter(has) },
    get: function () { return current },
    set: function (id) { return id === 'reset' ? (reset(), true) : choose(id) },
    assign: assign,
    fits: fits,
    slotsOf: function (id) { return slotScheme(id) ? (anySlot ? ['light', 'dark'] : declared(id).slice()) : [] },
    /** True for a scheme with slot none: choosing it turns light/dark automation off for the session. */
    isNone: function (id) { return has(id) && !slotScheme(id) },
    slots: function () { return { light: slots.light, dark: slots.dark } },
    info: info,
    /** Slot-none scheme pinned for this session, or null while automation is on. */
    offSlot: function () { return session ? { id: session, base: info(session).base } : null },
    preview: function () { return preview ? (pvMode || null) : false },
    /** Called by the light/dark layer whenever the resolved light/dark state changes. */
    sync: function (isDark) {
      if (preview && pvMode) return
      isDark = !!isDark
      if (isDark === dark) return
      dark = isDark
      refresh()
    },
  }
})()
