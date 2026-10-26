/* @antora-supplemental/color-scheme picker page (color-schemes.html). Three
   sections, each a radio group of scheme cards (preview thumbnail + name):
     Light mode  schemes that can fill the light slot (light + both)
     Dark mode   schemes that can fill the dark slot (dark + both)
     Neither     slot-none schemes: session only, turns automatic light/dark off
   An empty section is hidden. Arrow keys move and select within a group.
   "Reset to defaults" clears the visitor's slots and session scheme and turns
   automatic light/dark back on. Labels come from the picker.labels option
   (JSON in #cs-picker-labels). Needs window.ColorSchemes. */
(function () {
  var P = window.ColorSchemes
  var root = document.getElementById('cs-picker-list')
  var banner = document.getElementById('cs-picker-banner')
  if (!P || !root) return
  var L = {}
  try { L = JSON.parse((document.getElementById('cs-picker-labels') || {}).textContent || '{}') } catch (e) {}
  function t (k, d) { return typeof L[k] === 'string' ? L[k] : d }
  var preview = root.getAttribute('data-preview') || '../'
  var CS = function () { return window.ColorScheme }

  function el (tag, attrs, text) {
    var n = document.createElement(tag)
    for (var k in attrs || {}) n.setAttribute(k, attrs[k])
    if (text !== undefined) n.textContent = text
    return n
  }
  function choose (id) { if (CS() && CS().setScheme) CS().setScheme(id); else P.set(id) }
  function assign (slot, id) {
    if (CS() && CS().assign) CS().assign(slot, id); else P.assign(slot, id)
    if (P.offSlot()) choose('auto')
  }
  function frameSrc (id, mode) {
    return preview + (preview.indexOf('?') < 0 ? '?' : '&') + 'cs-preview=' + encodeURIComponent(id) + '&cs-preview-mode=' + mode
  }

  var focusAfter = null
  function section (key, heading, note, ids, mode, checkedId, pick) {
    if (!ids.length) return null
    var sec = el('section', { class: 'cs-picker-section', 'data-section': key, 'aria-labelledby': 'cs-picker-h-' + key })
    sec.appendChild(el('h2', { id: 'cs-picker-h-' + key }, heading))
    if (note) sec.appendChild(el('p', { class: 'cs-picker-note', id: 'cs-picker-n-' + key }, note))
    var group = el('div', { role: 'radiogroup', class: 'cs-picker-row', 'aria-labelledby': 'cs-picker-h-' + key })
    if (note) group.setAttribute('aria-describedby', 'cs-picker-n-' + key)
    var cards = []
    var tabbable = ids.indexOf(checkedId) >= 0 ? checkedId : ids[0]
    ids.forEach(function (id) {
      var info = P.info(id)
      var on = id === checkedId
      var card = el('div', { role: 'radio', class: 'cs-picker-card', 'data-scheme': id, 'aria-checked': on ? 'true' : 'false', tabindex: id === tabbable ? '0' : '-1' })
      var shot = el('div', { class: 'cs-picker-shot', 'aria-hidden': 'true' })
      /* The page at desktop width, scaled down, so the thumbnail shows the real layout. */
      shot.appendChild(el('iframe', { src: frameSrc(id, mode || info.base), title: '', loading: 'lazy', tabindex: '-1' }))
      card.appendChild(shot)
      card.appendChild(el('span', { class: 'cs-picker-name' }, info.label))
      card.addEventListener('click', function () { focusAfter = [key, id]; pick(id) })
      card.addEventListener('keydown', function (e) {
        var i = cards.indexOf(card)
        var next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: cards.length - 1 }[e.key]
        if (next !== undefined) {
          e.preventDefault()
          var c = cards[(next + cards.length) % cards.length]
          focusAfter = [key, c.getAttribute('data-scheme')]
          pick(c.getAttribute('data-scheme'))
        } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); focusAfter = [key, id]; pick(id) }
      })
      cards.push(card)
      group.appendChild(card)
    })
    sec.appendChild(group)
    return sec
  }

  function render () {
    var off = P.offSlot()
    var slots = P.slots()
    if (banner) {
      banner.hidden = !off
      banner.textContent = ''
      if (off) banner.textContent = t('sessionOn', '"{scheme}" is on for this visit, so automatic light/dark is off.').replace('{scheme}', P.info(off.id).label)
    }
    var ids = P.ids()
    root.textContent = ''
    var secs = [
      section('light', t('light', 'Light mode'), t('lightNote', ''), ids.filter(function (id) { return P.fits(id, 'light') }), 'light', off ? null : slots.light, function (id) { assign('light', id) }),
      section('dark', t('dark', 'Dark mode'), t('darkNote', ''), ids.filter(function (id) { return P.fits(id, 'dark') }), 'dark', off ? null : slots.dark, function (id) { assign('dark', id) }),
      section('none', t('none', 'Neither'), t('noneNote', 'Not made for light or dark mode. Picking one uses it for this visit only and turns automatic light/dark off.'),
        ids.filter(function (id) { return P.isNone(id) }), null, off ? off.id : null, function (id) { choose(id) }),
    ]
    secs.forEach(function (s) { if (s) root.appendChild(s) })
    if (focusAfter) {
      var f = root.querySelector('[data-section="' + focusAfter[0] + '"] [data-scheme="' + focusAfter[1] + '"]')
      focusAfter = null
      if (f) f.focus()
    }
  }

  var reset = document.getElementById('cs-picker-reset')
  if (reset) {
    reset.addEventListener('click', function () {
      choose('reset')
      if (window.LightDarkMode && window.LightDarkMode.set) window.LightDarkMode.set('system')
      render()
    })
  }
  document.addEventListener('color-scheme:scheme', render)
  render()
})()
