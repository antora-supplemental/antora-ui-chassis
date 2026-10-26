/* @antora-supplemental/color-scheme runtime.
 *
 * Loaded when the active paint has more than the light and dark schemes (or the
 * site sets slots), and when live_paint is enabled. The head hooks pick the
 * scheme (ColorSchemes) and the paint (ColorSchemePaint) before first paint;
 * this script exposes them:
 *
 * Schemes of the active paint (the picker works on these):
 *   ColorScheme.getScheme()      active scheme id (also html[data-scheme])
 *   ColorScheme.schemes()        [{ id, label, slots, base }] for every scheme the paint provides
 *   ColorScheme.setScheme(id)    one that fits the current light/dark slot goes into that
 *                                slot; any other is an off-slot pick for this session
 *                                (light/dark automation off). null or 'auto' turns
 *                                automation back on; 'reset' also restores the site's slots.
 *   ColorScheme.assign(slot, id) put a scheme in the 'light' or 'dark' slot; false when it does not fit
 *   ColorScheme.slots()          { light, dark }
 *   ColorScheme.fits(id, slot)   slot validation (slot_policy 'any' allows every scheme)
 *   ColorScheme.offSlot()        { id, base } while an off-slot scheme is pinned, else null
 *   Changes: UiBus.state 'color-scheme.scheme' and a 'color-scheme:scheme' CustomEvent.
 *
 * Live paint (preview/demo only; swaps the whole paint, no picker UI):
 *   ColorScheme.getPaint() / paints() / setPaint(id|'reset')
 *   Changes: UiBus.state 'color-scheme.paint' and a 'color-scheme:paint' CustomEvent.
 *   An embedding page in live_paint.allow_origins may post
 *   { type: 'color-scheme:paint', id }, { type: 'color-scheme:scheme', id },
 *   { type: 'color-scheme:assign', slot, id } or { type: 'color-scheme:mode', mode }
 *   and receives { type: 'color-scheme:state', paint, paints, scheme, schemes, slots, offSlot, mode, dark }.
 *
 * Light/dark switching is not here: see @antora-supplemental/light-dark-mode.
 */
(function () {
  if (window.ColorScheme) return
  var html = document.documentElement
  var ColorScheme = window.ColorScheme = {}
  var bus = function () { return window.UiBus && window.UiBus.state ? window.UiBus.state : null }
  var S = window.ColorSchemes
  if (S) {
    var announce = function () {
      var detail = { scheme: S.get(), slots: S.slots(), offSlot: S.offSlot() }
      if (bus()) { bus().set('color-scheme.scheme', detail.scheme); bus().set('color-scheme.off-slot', detail.offSlot ? detail.offSlot.id : null) }
      document.dispatchEvent(new CustomEvent('color-scheme:scheme', { detail: detail }))
    }
    var snapshot = function () { return JSON.stringify([S.get(), S.slots(), S.offSlot()]) }
    var change = function (fn) {
      var before = snapshot()
      var ok = fn()
      if (ok && snapshot() !== before) announce()
      return ok
    }
    ColorScheme.getScheme = function () { return S.get() }
    ColorScheme.schemes = function () { return S.ids().map(S.info) }
    ColorScheme.setScheme = function (id) { return change(function () { return S.set(id) }) }
    ColorScheme.assign = function (slot, id) { return change(function () { return S.assign(slot, id) }) }
    ColorScheme.slots = function () { return S.slots() }
    ColorScheme.fits = function (id, slot) { return S.fits(id, slot) }
    ColorScheme.offSlot = function () { return S.offSlot() }
    ColorScheme.sync = function (dark) { change(function () { S.sync(dark); return true }) }
    announce()
  }
  var P = window.ColorSchemePaint
  if (P) {
    var announcePaint = function () {
      if (bus()) bus().set('color-scheme.paint', P.get())
      document.dispatchEvent(new CustomEvent('color-scheme:paint', { detail: { paint: P.get() } }))
    }
    ColorScheme.getPaint = function () { return P.get() }
    ColorScheme.paints = function () { return P.ids() }
    ColorScheme.setPaint = function (id) {
      var before = P.get()
      var ok = P.set(id)
      if (ok && P.get() !== before) announcePaint()
      return ok
    }
    var reply = function (target, origin) {
      if (!target || !target.postMessage) return
      var ldm = window.LightDarkMode
      target.postMessage({
        type: 'color-scheme:state',
        paint: P.get(),
        paints: P.ids(),
        scheme: S ? S.get() : null,
        schemes: S ? S.ids() : [],
        slots: S ? S.slots() : null,
        offSlot: S ? S.offSlot() : null,
        mode: ldm ? ldm.mode() : null,
        dark: html.classList.contains('dark-theme'),
      }, origin)
    }
    window.addEventListener('message', function (e) {
      if (P.allowOrigins.indexOf(e.origin) < 0) return
      var d = e.data
      if (!d || typeof d !== 'object') return
      if (d.type === 'color-scheme:paint') ColorScheme.setPaint(d.id === undefined ? null : d.id)
      else if (d.type === 'color-scheme:scheme' && S) ColorScheme.setScheme(d.id === undefined ? null : d.id)
      else if (d.type === 'color-scheme:assign' && S) ColorScheme.assign(d.slot, d.id)
      else if (d.type === 'color-scheme:mode' && (d.mode === 'light' || d.mode === 'dark' || d.mode === 'system')) {
        if (window.LightDarkMode) window.LightDarkMode.set(d.mode, { animate: false })
      } else if (d.type !== 'color-scheme:hello') return
      reply(e.source, e.origin)
    })
    if (window.parent !== window) {
      P.allowOrigins.forEach(function (o) {
        try { window.parent.postMessage({ type: 'color-scheme:ready', paint: P.get(), paints: P.ids() }, o) } catch (err) {}
      })
    }
    announcePaint()
  }
})()
