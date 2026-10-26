/* @antora-supplemental/light-dark-mode runtime.
 *
 * Light/dark switching on top of the color-scheme token contract. Toggles call
 * it; they never touch storage or html classes themselves.
 *
 *   LightDarkMode.mode()          'system' | 'light' | 'dark'
 *   LightDarkMode.isDark()        resolved scheme
 *   LightDarkMode.followsSystem() false when follow_system is off
 *   LightDarkMode.set(mode)       persist and apply (animated unless reduced motion)
 *   LightDarkMode.toggle()        flip the resolved scheme
 *   LightDarkMode.subscribe(fn)   fn({ mode, dark }) now and on every change; returns off
 *
 * Toggle: binds #theme-toggle (placed by the layout) or creates one in
 * .navbar-end. A placed button that already has child elements keeps them
 * (style them with html.dark-theme); an empty one gets the built-in sun/moon.
 * aria-label/title/aria-pressed always track the scheme.
 *
 * Hooks on <html>: .dark-theme, [data-theme=light|dark], [data-light-dark-mode].
 * When UiBus is present it also publishes UiBus.state 'light-dark-mode.mode'
 * and 'light-dark-mode.dark'.
 *
 * Following the system (default): an explicit light/dark choice expires when
 * the OS preference changes after it was made. With follow_system off the
 * default is light and the OS preference is never read.
 */
(function () {
  if (window.LightDarkMode) return
  // Same keys antora-dark-mode used, so saved choices survive the migration.
  var MODE_KEY = 'antora-theme-mode'
  var LEGACY_KEY = 'antora-theme'
  var SNAPSHOT_KEY = 'antora-theme-system-snapshot'
  var ANIMATING = 'light-dark-mode-animating'
  var VT = 'light-dark-mode-vt'
  var ANIM_MS = 300
  var html = document.documentElement
  var script = document.currentScript
  var followMeta = document.querySelector('meta[name="light-dark-mode-follow-system"]')
  var followSystem = !(followMeta && followMeta.content === 'off')
  var systemMq = window.matchMedia('(prefers-color-scheme: dark)')
  var reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  var listeners = []
  var lastAuto = true
  var timer

  function read (key) { try { return localStorage.getItem(key) } catch (e) { return null } }
  function write (key, value) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch (e) {}
  }
  function systemDark () { return followSystem && systemMq.matches }
  function systemLabel () { return systemDark() ? 'dark' : 'light' }

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
  function pinned () { var p = window.ColorSchemePaint; return p && p.offSlot ? p.offSlot() : null }
  function previewMode () { var p = window.ColorSchemePaint; return p && p.preview ? p.preview() : false }
  function resolve (m) {
    var pv = previewMode()
    if (pv) return pv === 'dark'
    var pin = pinned()
    if (pin) return pin.base === 'dark'
    return m === 'system' ? systemDark() : m === 'dark'
  }
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
      bus.state.set('light-dark-mode.auto', detail.auto !== false)
      bus.state.set('light-dark-mode.mode', detail.mode)
      bus.state.set('light-dark-mode.dark', detail.dark)
    }
  }

  function apply (animate) {
    var m = mode()
    var dark = resolve(m)
    var flip = dark !== isDark()
    var changed = flip || html.getAttribute('data-light-dark-mode') !== m
    paint(function () {
      html.classList.toggle('dark-theme', dark)
      html.setAttribute('data-theme', dark ? 'dark' : 'light')
      html.setAttribute('data-light-dark-mode', m)
      if (window.ColorSchemePaint) window.ColorSchemePaint.sync(dark)
    }, animate && flip)
    var auto = !pinned()
    if (changed || auto !== lastAuto) notify({ mode: m, dark: dark, auto: auto })
    lastAuto = auto
  }

  function set (next, opts) {
    if (pinned()) {
      if (window.ColorScheme && window.ColorScheme.setPaint) window.ColorScheme.setPaint('auto')
      else window.ColorSchemePaint.set('auto')
    }
    if (next === 'system') {
      write(MODE_KEY, 'system')
      write(SNAPSHOT_KEY, null)
    } else if (next === 'light' || next === 'dark') {
      write(MODE_KEY, next)
      write(SNAPSHOT_KEY, systemLabel())
    } else {
      throw new TypeError('LightDarkMode.set: expected system, light or dark')
    }
    apply(!(opts && opts.animate === false))
  }

  function toggle () { set(isDark() ? 'light' : 'dark') }

  function expireOverride () {
    if (!followSystem || mode() === 'system') return false
    var snap = read(SNAPSHOT_KEY)
    if (!snap) { write(SNAPSHOT_KEY, systemLabel()); return false }
    if (snap === systemLabel()) return false
    set('system')
    return true
  }

  function subscribe (fn) {
    listeners.push(fn)
    fn({ mode: mode(), dark: isDark(), auto: !pinned() })
    return function () { listeners = listeners.filter(function (l) { return l !== fn }) }
  }

  function onSystemChange () {
    if (!expireOverride() && mode() === 'system') apply(true)
  }

  expireOverride()
  apply(false)
  notify({ mode: mode(), dark: resolve(mode()), auto: !pinned() })
  // An off-slot scheme pins light/dark; a slot scheme or 'auto' releases it.
  document.addEventListener('color-scheme:paint', function () { apply(true) })
  if (followSystem) {
    if (systemMq.addEventListener) systemMq.addEventListener('change', onSystemChange)
    else systemMq.addListener(onSystemChange)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') expireOverride()
    })
    window.addEventListener('focus', expireOverride)
  }

  window.LightDarkMode = {
    mode: mode,
    isDark: isDark,
    followsSystem: function () { return followSystem },
    set: set,
    toggle: toggle,
    subscribe: subscribe,
    /** false while an off-slot color scheme has switched light/dark automation off */
    isAuto: function () { return !pinned() },
    resume: function () { if (window.ColorScheme && window.ColorScheme.setPaint) window.ColorScheme.setPaint('auto'); else if (window.ColorSchemePaint) window.ColorSchemePaint.set('auto'); apply(true) }
  }

  /* Toggle component, two variants with the same state code:
     - navbar: compact icon button #theme-toggle (or [data-light-dark-mode-toggle]),
       created at the start of .navbar .navbar-end.
     - footer: Light / Dark / Auto icon switch [data-light-dark-mode-switch]
       (sun, moon, half-filled circle), created in the page footer. Its
       strings (aria-label and title of each button, group name) come from
       data-light-dark-mode-labels, the labels option.
     data-light-dark-mode-toggle on this script: auto (create the configured
     variant when the page has none) or placed (bind only).
     data-light-dark-mode-placement: navbar (default) or footer.
     Override order: markup the site or layout placed always wins; the chassis
     fills in its default icon only when a button is empty or has
     data-light-dark-mode-icons="built-in", and default switch buttons only when
     the switch container is empty. */
  var SUN = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
  var MOON = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
  var placement = (script && script.getAttribute('data-light-dark-mode-toggle')) || 'auto'
  var variant = (script && script.getAttribute('data-light-dark-mode-placement')) || 'navbar'
  var LABELS = { light: 'Light', dark: 'Dark', auto: 'Auto', group: 'Theme' }
  try {
    var given = JSON.parse((script && script.getAttribute('data-light-dark-mode-labels')) || '{}')
    for (var k in LABELS) if (given && typeof given[k] === 'string' && given[k]) LABELS[k] = given[k]
  } catch (e) {}
  var SW = '<svg class="light-dark-switch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  var AUTO = SW + '<circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 1 0 18z" class="light-dark-switch-fill"></path></svg>'
  var CHOICES = [
    ['light', LABELS.light, SUN.replace('class="theme-icon"', 'class="light-dark-switch-icon"')],
    ['dark', LABELS.dark, MOON.replace('class="theme-icon"', 'class="light-dark-switch-icon"')],
    ['system', LABELS.auto, AUTO]
  ]

  function offText () {
    var pin = pinned()
    var name = pin ? pin.id : ''
    try { if (pin && window.ColorScheme && window.ColorScheme.schemes) window.ColorScheme.schemes().forEach(function (x) { if (x.id === pin.id) name = x.label }) } catch (e) {}
    return 'Custom color scheme "' + name + '" is on for this visit, so automatic light/dark is off'
  }

  function label (btn, dark) {
    var auto = !pinned()
    var text = !auto ? offText() + '. Turn automatic light/dark back on' : dark ? 'Switch to light mode' : 'Switch to dark mode'
    if (!btn.dataset.lightDarkModeIcons) btn.dataset.lightDarkModeIcons = btn.children.length ? 'own' : 'built-in'
    if (btn.dataset.lightDarkModeIcons !== 'own') btn.innerHTML = dark ? SUN : MOON
    btn.setAttribute('aria-label', text)
    btn.setAttribute('title', text)
    btn.setAttribute('aria-pressed', !auto ? 'mixed' : dark ? 'true' : 'false')
    btn.setAttribute('data-light-dark-mode-state', auto ? (dark ? 'dark' : 'light') : 'off')
  }

  function paintSwitch (box) {
    var auto = !pinned()
    var m = mode()
    var btns = box.querySelectorAll('[data-light-dark-mode-value]')
    for (var i = 0; i < btns.length; i++) {
      var on = auto && btns[i].getAttribute('data-light-dark-mode-value') === m
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false')
    }
    box.setAttribute('data-light-dark-mode-state', auto ? m : 'off')
    var note = box.querySelector('[data-light-dark-mode-note]')
    if (note) {
      note.textContent = auto ? '' : offText() + '. Pick ' + LABELS.light + ', ' + LABELS.dark + ' or ' + LABELS.auto + ' to turn it back on.'
      note.hidden = auto
    }
  }

  function fillSwitch (box) {
    if (box.querySelector('[data-light-dark-mode-value]')) return
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }
    var html = '<span class="light-dark-switch-options" role="group" aria-label="' + esc(LABELS.group) + '">'
    CHOICES.forEach(function (c) {
      html += '<button type="button" class="light-dark-switch-option" data-light-dark-mode-value="' + c[0] + '" aria-label="' + esc(c[1]) + '" title="' + esc(c[1]) + '">' + c[2] + '</button>'
    })
    box.innerHTML = html + '</span><span class="light-dark-switch-note" data-light-dark-mode-note role="status" hidden></span>'
  }

  function bindButton (btn) {
    if (btn.dataset.lightDarkModeBound === '1') return
    btn.dataset.lightDarkModeBound = '1'
    if (btn.tagName === 'BUTTON') btn.type = 'button'
    btn.classList.add('theme-toggle')
    btn.addEventListener('click', function () {
      if (pinned()) window.LightDarkMode.resume()
      else toggle()
    })
    label(btn, isDark())
  }

  function bindSwitch (box) {
    if (box.dataset.lightDarkModeBound === '1') return
    box.dataset.lightDarkModeBound = '1'
    box.classList.add('light-dark-switch')
    fillSwitch(box)
    box.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-light-dark-mode-value]') : null
      if (t) set(t.getAttribute('data-light-dark-mode-value'))
    })
    paintSwitch(box)
  }

  function footerHost () {
    return document.querySelector('[data-light-dark-mode-footer]') || document.querySelector('footer.footer') || document.querySelector('body > footer') || document.querySelector('footer')
  }

  function ensureToggle () {
    var btn = document.getElementById('theme-toggle') || document.querySelector('[data-light-dark-mode-toggle-button]')
    var box = document.querySelector('[data-light-dark-mode-switch]')
    if (!btn && !box && placement === 'auto') {
      if (variant === 'footer') {
        var host = footerHost()
        if (host) {
          box = document.createElement('div')
          box.setAttribute('data-light-dark-mode-switch', '')
          box.className = 'light-dark-switch light-dark-switch--footer'
          var link = host.querySelector('.color-scheme-picker-link')
          if (link) host.insertBefore(box, link)
          else host.appendChild(box)
        }
      } else {
        var end = document.querySelector('.navbar .navbar-end')
        if (end) {
          btn = document.createElement('button')
          btn.id = 'theme-toggle'
          btn.className = 'navbar-item theme-toggle theme-toggle--navbar'
          end.insertBefore(btn, end.firstChild)
        }
      }
    }
    if (btn) bindButton(btn)
    var boxes = document.querySelectorAll('[data-light-dark-mode-switch]')
    for (var i = 0; i < boxes.length; i++) bindSwitch(boxes[i])
  }

  subscribe(function (s) {
    var btn = document.getElementById('theme-toggle') || document.querySelector('[data-light-dark-mode-toggle-button]')
    if (btn) label(btn, s.dark)
    var boxes = document.querySelectorAll('[data-light-dark-mode-switch]')
    for (var i = 0; i < boxes.length; i++) paintSwitch(boxes[i])
  })

  function init () {
    ensureToggle()
    // Soft navigation may swap the header or footer: re-bind after each swap.
    if (window.UiBus && window.UiBus.events) window.UiBus.events.on('nav:loaded', ensureToggle)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
