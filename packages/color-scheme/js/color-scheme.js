/* @antora-supplemental/color-scheme runtime.
 *
 * Owns the light/dark contract. Toggles (placed by the body kit) call it; they
 * never touch storage or html classes themselves.
 *
 *   ColorScheme.mode()          'system' | 'light' | 'dark'
 *   ColorScheme.isDark()        resolved scheme
 *   ColorScheme.set(mode)       persist and apply (animated unless reduced motion)
 *   ColorScheme.toggle()        flip the resolved scheme
 *   ColorScheme.subscribe(fn)   fn({ mode, dark }) now and on every change; returns off
 *
 * Toggle: binds #theme-toggle (placed by the body kit) or creates one in
 * .navbar-end; aria-label/title/aria-pressed track the scheme.
 *
 * Hooks on <html>: .dark-theme, [data-theme=light|dark], [data-color-scheme-mode].
 * When UiBus is present it also publishes UiBus.state 'color-scheme.mode' and
 * 'color-scheme.dark'.
 *
 * An explicit light/dark choice expires when the OS preference changes after it
 * was made, so the site follows the system again.
 */
(function () {
  if (window.ColorScheme) return
  // Same keys antora-dark-mode used, so saved choices survive the migration.
  var MODE_KEY = 'antora-theme-mode'
  var LEGACY_KEY = 'antora-theme'
  var SNAPSHOT_KEY = 'antora-theme-system-snapshot'
  var ANIMATING = 'color-scheme-animating'
  var VT = 'color-scheme-vt'
  var ANIM_MS = 300
  var html = document.documentElement
  var systemMq = window.matchMedia('(prefers-color-scheme: dark)')
  var reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  var listeners = []
  var timer

  function read (key) { try { return localStorage.getItem(key) } catch (e) { return null } }
  function write (key, value) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch (e) {}
  }
  function systemLabel () { return systemMq.matches ? 'dark' : 'light' }

  function mode () {
    var m = read(MODE_KEY)
    if (m === 'light' || m === 'dark') return m
    var legacy = read(LEGACY_KEY)
    if (legacy === 'light' || legacy === 'dark') {
      write(MODE_KEY, legacy)
      write(LEGACY_KEY, null)
      write(SNAPSHOT_KEY, systemLabel())
      return legacy
    }
    return 'system'
  }
  function resolve (m) { return m === 'system' ? systemMq.matches : m === 'dark' }
  function isDark () { return html.classList.contains('dark-theme') }

  function paint (update, animate) {
    if (!animate || reducedMq.matches) return update()
    if (typeof document.startViewTransition === 'function') {
      html.classList.add(VT)
      var t = document.startViewTransition(update)
      var done = function () { html.classList.remove(VT) }
      if (t && t.finished && t.finished.finally) t.finished.finally(done)
      else { clearTimeout(timer); timer = setTimeout(done, ANIM_MS) }
      return
    }
    html.classList.add(ANIMATING)
    void html.offsetWidth
    update()
    clearTimeout(timer)
    timer = setTimeout(function () { html.classList.remove(ANIMATING) }, ANIM_MS)
  }

  function notify (detail) {
    listeners.slice().forEach(function (fn) { fn(detail) })
    var bus = window.UiBus
    if (bus && bus.state) {
      bus.state.set('color-scheme.mode', detail.mode)
      bus.state.set('color-scheme.dark', detail.dark)
    }
  }

  function apply (animate) {
    var m = mode()
    var dark = resolve(m)
    var flip = dark !== isDark()
    var changed = flip || html.getAttribute('data-color-scheme-mode') !== m
    paint(function () {
      html.classList.toggle('dark-theme', dark)
      html.setAttribute('data-theme', dark ? 'dark' : 'light')
      html.setAttribute('data-color-scheme-mode', m)
    }, animate && flip)
    if (changed) notify({ mode: m, dark: dark })
  }

  function set (next, opts) {
    if (next === 'system') {
      write(MODE_KEY, 'system')
      write(SNAPSHOT_KEY, null)
    } else if (next === 'light' || next === 'dark') {
      write(MODE_KEY, next)
      write(SNAPSHOT_KEY, systemLabel())
    } else {
      throw new TypeError('ColorScheme.set: expected system, light or dark')
    }
    apply(!(opts && opts.animate === false))
  }

  function toggle () { set(isDark() ? 'light' : 'dark') }

  function expireOverride () {
    if (mode() === 'system') return false
    var snap = read(SNAPSHOT_KEY)
    if (!snap) { write(SNAPSHOT_KEY, systemLabel()); return false }
    if (snap === systemLabel()) return false
    set('system')
    return true
  }

  function subscribe (fn) {
    listeners.push(fn)
    fn({ mode: mode(), dark: isDark() })
    return function () { listeners = listeners.filter(function (l) { return l !== fn }) }
  }

  function onSystemChange () {
    if (!expireOverride() && mode() === 'system') apply(true)
  }

  expireOverride()
  apply(false)
  notify({ mode: mode(), dark: resolve(mode()) })
  if (systemMq.addEventListener) systemMq.addEventListener('change', onSystemChange)
  else systemMq.addListener(onSystemChange)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') expireOverride()
  })
  window.addEventListener('focus', expireOverride)

  window.ColorScheme = { mode: mode, isDark: isDark, set: set, toggle: toggle, subscribe: subscribe }

  /* Live paint (livePaint.enabled): the head hook ColorSchemePaint picks the
     palette; light/dark stays with this runtime. Changes are announced on
     UiBus.state 'color-scheme.paint' when present and always as a
     'color-scheme:paint' CustomEvent on document. An embedding page in
     livePaint.allowOrigins may post { type: 'color-scheme:paint', id } or
     { type: 'color-scheme:mode', mode } and receives
     { type: 'color-scheme:state', paint, paints, mode, dark } back. */
  var livePaint = window.ColorSchemePaint
  if (livePaint) {
    var announcePaint = function () {
      var id = livePaint.get()
      if (window.UiBus && window.UiBus.state) window.UiBus.state.set('color-scheme.paint', id)
      document.dispatchEvent(new CustomEvent('color-scheme:paint', { detail: { paint: id } }))
    }
    window.ColorScheme.getPaint = function () { return livePaint.get() }
    window.ColorScheme.paints = function () { return livePaint.ids() }
    window.ColorScheme.setPaint = function (id) {
      var before = livePaint.get()
      var ok = livePaint.set(id)
      if (ok && livePaint.get() !== before) announcePaint()
      return ok
    }
    var reply = function (target, origin) {
      if (target && target.postMessage) {
        target.postMessage({ type: 'color-scheme:state', paint: livePaint.get(), paints: livePaint.ids(), mode: mode(), dark: isDark() }, origin)
      }
    }
    window.addEventListener('message', function (e) {
      if (livePaint.allowOrigins.indexOf(e.origin) < 0) return
      var d = e.data
      if (!d || typeof d !== 'object') return
      if (d.type === 'color-scheme:paint') window.ColorScheme.setPaint(d.id === undefined ? null : d.id)
      else if (d.type === 'color-scheme:mode' && (d.mode === 'light' || d.mode === 'dark' || d.mode === 'system')) set(d.mode, { animate: false })
      else if (d.type !== 'color-scheme:hello') return
      reply(e.source, e.origin)
    })
    if (window.parent !== window) {
      livePaint.allowOrigins.forEach(function (o) {
        try { window.parent.postMessage({ type: 'color-scheme:ready', paint: livePaint.get(), paints: livePaint.ids() }, o) } catch (err) {}
      })
    }
    announcePaint()
  }

  /* Toggle. The body kit places <button id="theme-toggle"> where it wants it;
     with data-color-scheme-toggle="auto" on this script (the default) a button
     is created at the start of .navbar .navbar-end when none was placed. */
  var SUN = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
  var MOON = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
  var script = document.currentScript
  var placement = (script && script.getAttribute('data-color-scheme-toggle')) || 'auto'

  function label (btn, dark) {
    var text = dark ? 'Switch to light mode' : 'Switch to dark mode'
    btn.innerHTML = dark ? SUN : MOON
    btn.setAttribute('aria-label', text)
    btn.setAttribute('title', text)
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false')
  }

  function ensureToggle () {
    var btn = document.getElementById('theme-toggle')
    if (!btn && placement === 'auto') {
      var end = document.querySelector('.navbar .navbar-end')
      if (!end) return
      btn = document.createElement('button')
      btn.id = 'theme-toggle'
      btn.className = 'navbar-item theme-toggle'
      end.insertBefore(btn, end.firstChild)
    }
    if (!btn || btn.dataset.colorSchemeBound === '1') return
    btn.dataset.colorSchemeBound = '1'
    if (btn.tagName === 'BUTTON') btn.type = 'button'
    btn.classList.add('theme-toggle')
    btn.addEventListener('click', function () { toggle() })
    label(btn, isDark())
  }

  subscribe(function (s) {
    var btn = document.getElementById('theme-toggle')
    if (btn) label(btn, s.dark)
  })

  function init () {
    ensureToggle()
    // Soft navigation may swap the header: re-bind after each swap.
    if (window.UiBus && window.UiBus.events) window.UiBus.events.on('nav:loaded', ensureToggle)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
