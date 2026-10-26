/* @antora-supplemental/color-scheme picker page (color-schemes.html in the UI
   output dir). Lists every color scheme the active paint provides, with a live
   preview, its light/dark slots, and buttons to put it in a slot or use it for
   this visit only. It does not list paints (live paint is separate).
   Needs the schemes head hook (window.ColorSchemes); uses the light/dark layer
   (window.LightDarkMode) when present. */
(function () {
  var P = window.ColorSchemes
  var list = document.getElementById('cs-picker-list')
  var banner = document.getElementById('cs-picker-banner')
  if (!P || !list) return
  var preview = list.getAttribute('data-preview') || '../'
  var CS = function () { return window.ColorScheme }

  function el (tag, attrs, text) {
    var n = document.createElement(tag)
    for (var k in attrs || {}) n.setAttribute(k, attrs[k])
    if (text !== undefined) n.textContent = text
    return n
  }
  function choose (id) { if (CS() && CS().setScheme) CS().setScheme(id); else P.set(id); render() }
  function assign (slot, id) {
    if (CS() && CS().assign) CS().assign(slot, id); else P.assign(slot, id)
    if (P.offSlot()) choose('auto')
    render()
  }
  function frameSrc (id, mode) {
    return preview + (preview.indexOf('?') < 0 ? '?' : '&') + 'cs-preview=' + encodeURIComponent(id) + '&cs-preview-mode=' + mode
  }

  function card (id) {
    var info = P.info(id)
    var key = id
    var slots = P.slots()
    var off = P.offSlot()
    var li = el('li', { class: 'cs-picker-card', 'data-scheme': id })
    li.appendChild(el('h2', {}, info.label))
    if (P.get() === id) li.setAttribute('aria-current', 'true')
    var fitsLight = P.fits(key, 'light')
    var fitsDark = P.fits(key, 'dark')
    var where = []
    if (slots.light === key) where.push('light')
    if (slots.dark === key) where.push('dark')
    var none = !fitsLight && !fitsDark
    var status = off && off.id === id ? 'In use for this visit (automatic light/dark is off)'
      : where.length ? 'Current ' + where.join(' and ') + ' scheme'
        : !none ? 'Fits: ' + [fitsLight && 'light', fitsDark && 'dark'].filter(Boolean).join(', ') + ' (automatic light/dark stays on)'
          : 'Not made for light/dark: using it turns off automatic light/dark for this visit'
    li.appendChild(el('p', { class: 'cs-picker-status' }, status))
    var shots = el('div', { class: 'cs-picker-previews' })
    var modes = fitsLight && fitsDark ? ['light', 'dark'] : fitsLight ? ['light'] : fitsDark ? ['dark'] : [info.base]
    modes.forEach(function (m) {
      /* Render the page at desktop width and scale it down, so previews show the real layout. */
      var shot = el('div', { class: 'cs-picker-shot' })
      shot.appendChild(el('iframe', { src: frameSrc(id, m), title: info.label + ' preview (' + m + ')', loading: 'lazy', tabindex: '-1' }))
      shots.appendChild(shot)
    })
    li.appendChild(shots)
    var row = el('div', { class: 'cs-picker-actions' })
    function btn (text, fn, pressed) {
      var b = el('button', { type: 'button', class: 'cs-picker-button' }, text)
      if (pressed !== undefined) b.setAttribute('aria-pressed', pressed ? 'true' : 'false')
      b.addEventListener('click', fn)
      row.appendChild(b)
    }
    if (fitsLight) btn('Use for light', function () { assign('light', key) }, slots.light === key)
    if (fitsDark) btn('Use for dark', function () { assign('dark', key) }, slots.dark === key)
    if (none) btn('Use for this visit (turns off automatic light/dark)', function () { choose(id) }, !!(off && off.id === id))
    li.appendChild(row)
    return li
  }

  function render () {
    var off = P.offSlot()
    if (banner) {
      banner.hidden = !off
      banner.textContent = ''
      if (off) {
        banner.appendChild(document.createTextNode('"' + P.info(off.id).label + '" is on for this visit, so automatic light/dark is off. '))
        var b = el('button', { type: 'button' }, 'Turn automatic light/dark back on')
        b.addEventListener('click', function () { choose('auto') })
        banner.appendChild(b)
      }
    }
    list.textContent = ''
    P.ids().forEach(function (id) { list.appendChild(card(id)) })
  }

  var reset = document.getElementById('cs-picker-reset')
  if (reset) reset.addEventListener('click', function () { choose('reset') })
  document.addEventListener('color-scheme:scheme', render)
  render()
})()
