/* @antora-supplemental/color-scheme head hook. Inlined into <head> before paint
   stylesheets apply, so the first paint already has the right scheme (no FOUC).
   Sets html.dark-theme, html[data-theme] and html[data-color-scheme-mode]. */
(function () {
  var html = document.documentElement
  var navbar = document.querySelector('meta[name="dm-navbar"]')
  if (navbar && navbar.content) html.dataset.dmNavbar = navbar.content
  var mode = 'system'
  try {
    var stored = localStorage.getItem('antora-theme-mode') || localStorage.getItem('antora-theme')
    if (stored === 'light' || stored === 'dark') mode = stored
  } catch (e) {}
  var dark = mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : mode === 'dark'
  html.classList.toggle('dark-theme', dark)
  html.setAttribute('data-theme', dark ? 'dark' : 'light')
  html.setAttribute('data-color-scheme-mode', mode)
})()
