/* @antora-supplemental/light-dark-mode head hook. Inlined into <head> before
   paint stylesheets apply, so the first paint already has the right scheme
   (no flash). Sets html.dark-theme, html[data-theme] and
   html[data-light-dark-mode]. With follow_system off (meta
   light-dark-mode-follow-system=off) an unset choice means light. Runs after
   the color-scheme live-paint hook when both are present, and tells it the
   resolved scheme so the slot scheme loads before first paint. */
(function () {
  var html = document.documentElement
  var navbar = document.querySelector('meta[name="dm-navbar"]')
  if (navbar && navbar.content) html.dataset.dmNavbar = navbar.content
  var follow = document.querySelector('meta[name="light-dark-mode-follow-system"]')
  var followSystem = !(follow && follow.content === 'off')
  var mode = 'system'
  try {
    var stored = localStorage.getItem('antora-theme-mode') || localStorage.getItem('antora-theme')
    if (stored === 'light' || stored === 'dark') mode = stored
  } catch (e) {}
  var dark = mode === 'system'
    ? followSystem && window.matchMedia('(prefers-color-scheme: dark)').matches
    : mode === 'dark'
  // color-scheme live paint: an off-slot scheme pins light/dark; a preview frame forces it.
  var paint = window.ColorSchemePaint
  var pv = paint && paint.preview ? paint.preview() : false
  var pin = paint && paint.offSlot ? paint.offSlot() : null
  if (pv) dark = pv === 'dark'
  else if (pin) dark = pin.base === 'dark'
  html.classList.toggle('dark-theme', dark)
  html.setAttribute('data-theme', dark ? 'dark' : 'light')
  html.setAttribute('data-light-dark-mode', mode)
  if (paint) paint.sync(dark)
})()
