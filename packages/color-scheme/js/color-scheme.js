/* @antora-supplemental/color-scheme runtime: live paint.
 *
 * Loaded only when live_paint.enabled is set. The head hook
 * (color-scheme-paint-head.js, ColorSchemePaint) picks the palette before first
 * paint; this script exposes it:
 *
 *   ColorScheme.getPaint()      active paint id, or null for the built-in paint
 *   ColorScheme.paints()        ids from the playbook paints map
 *   ColorScheme.setPaint(id)    choose a scheme: one that fits the current light/dark
 *                               slot goes into that slot; any other is an off-slot pick
 *                               for this session (light/dark automation off). null or
 *                               'auto' turns automation back on; 'reset' also restores
 *                               the site's default slots. false for unknown ids.
 *   ColorScheme.assign(slot, id) put a scheme in the 'light' or 'dark' slot ('builtin' or
 *                               null = the site's own paint); false when it does not fit
 *   ColorScheme.slots()         { light, dark }
 *   ColorScheme.fits(id, slot)  slot validation (slot_policy 'any' allows every scheme)
 *   ColorScheme.offSlot()       { id, base } while an off-slot scheme is pinned, else null
 *   ColorScheme.schemes()       [{ id, label, slots, base }] for every scheme in the map
 *
 * Changes are announced on UiBus.state 'color-scheme.paint' when present and
 * always as a 'color-scheme:paint' CustomEvent on document. An embedding page
 * in live_paint.allow_origins may post { type: 'color-scheme:paint', id } or
 * { type: 'color-scheme:mode', mode } or { type: 'color-scheme:assign', slot, id } (forwarded to LightDarkMode when that
 * layer is loaded) and receives { type: 'color-scheme:state', paint, paints,
 * mode, dark } back.
 *
 * Light/dark switching is not here: see @antora-supplemental/light-dark-mode.
 */
(function () {
  if (window.ColorScheme) return
  var html = document.documentElement
  var ColorScheme = window.ColorScheme = {}
  var livePaint = window.ColorSchemePaint
  if (livePaint) {
    var announcePaint = function () {
      var id = livePaint.get()
      if (window.UiBus && window.UiBus.state) window.UiBus.state.set('color-scheme.paint', id)
      var detail = { paint: id, slots: livePaint.slots(), offSlot: livePaint.offSlot() }
      if (window.UiBus && window.UiBus.state) window.UiBus.state.set('color-scheme.off-slot', detail.offSlot ? detail.offSlot.id : null)
      document.dispatchEvent(new CustomEvent('color-scheme:paint', { detail: detail }))
    }
    ColorScheme.getPaint = function () { return livePaint.get() }
    ColorScheme.paints = function () { return livePaint.ids() }
    var snapshot = function () { return JSON.stringify([livePaint.get(), livePaint.slots(), livePaint.offSlot()]) }
    var change = function (fn) {
      var before = snapshot()
      var ok = fn()
      if (ok && snapshot() !== before) announcePaint()
      return ok
    }
    ColorScheme.setPaint = function (id) { return change(function () { return livePaint.set(id) }) }
    ColorScheme.assign = function (slot, id) { return change(function () { return livePaint.assign(slot, id) }) }
    ColorScheme.slots = function () { return livePaint.slots() }
    ColorScheme.fits = function (id, slot) { return livePaint.fits(id === 'builtin' ? null : id, slot) }
    ColorScheme.offSlot = function () { return livePaint.offSlot() }
    ColorScheme.schemes = function () { return livePaint.ids().map(livePaint.info) }
    var reply = function (target, origin) {
      if (target && target.postMessage) {
        var ldm = window.LightDarkMode
        target.postMessage({ type: 'color-scheme:state', paint: livePaint.get(), paints: livePaint.ids(), slots: livePaint.slots(), offSlot: livePaint.offSlot(), mode: ldm ? ldm.mode() : null, dark: html.classList.contains('dark-theme') }, origin)
      }
    }
    window.addEventListener('message', function (e) {
      if (livePaint.allowOrigins.indexOf(e.origin) < 0) return
      var d = e.data
      if (!d || typeof d !== 'object') return
      if (d.type === 'color-scheme:paint') ColorScheme.setPaint(d.id === undefined ? null : d.id)
      else if (d.type === 'color-scheme:assign') ColorScheme.assign(d.slot, d.id)
      else if (d.type === 'color-scheme:mode' && (d.mode === 'light' || d.mode === 'dark' || d.mode === 'system')) {
        if (window.LightDarkMode) window.LightDarkMode.set(d.mode, { animate: false })
      } else if (d.type !== 'color-scheme:hello') return
      reply(e.source, e.origin)
    })
    if (window.parent !== window) {
      livePaint.allowOrigins.forEach(function (o) {
        try { window.parent.postMessage({ type: 'color-scheme:ready', paint: livePaint.get(), paints: livePaint.ids() }, o) } catch (err) {}
      })
    }
    announcePaint()
  }
})()
