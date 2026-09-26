/**
 * Diagram zoom / pan / lightbox for Antora article figures.
 *
 * Enhances baked SVG imageblocks (.imageblock) and client Mermaid hosts
 * (.adt-mermaid, div.mermaid). SoftNav-safe: rebinds on SoftNav.loaded.
 * Wheel handlers only fire when the pointer is over a diagram or lightbox
 * (does not steal left-nav scroll).
 */
;(function (global) {
  'use strict'

  var ATTR = 'data-adt-diagram-zoom'
  var STEP = 1.25
  var MIN = 0.5
  var MAX = 8
  var SELECTOR =
    '.doc .imageblock, .doc .adt-mermaid, .doc div.mermaid:not(.adt-mermaid)'

  var lightbox = null
  var lastFocus = null
  var drag = null

  function onSoftNavLoaded(fn) {
    if (global.SoftNav && typeof SoftNav.on === 'function') SoftNav.on('loaded', fn)
    else document.addEventListener('soft-nav:loaded', function (e) {
      fn(e.detail || {})
    })
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n))
  }

  function findFigure(el) {
    if (!el || !el.closest) return null
    return el.closest(SELECTOR)
  }

  function visualSource(figure) {
    if (!figure) return null
    var themed = figure.querySelector('themed-svg')
    if (themed) return themed
    var svg = figure.querySelector('svg')
    if (svg) return svg
    var img = figure.querySelector('img')
    if (img) return img
    return figure
  }

  function cloneVisual(figure) {
    var src = visualSource(figure)
    if (!src) return null
    if (src.tagName && src.tagName.toLowerCase() === 'themed-svg') {
      var inner = src.querySelector('svg')
      if (!inner && src.shadowRoot) inner = src.shadowRoot.querySelector('svg')
      if (inner) return inner.cloneNode(true)
      var fallback = src.querySelector('img')
      if (fallback) return fallback.cloneNode(true)
      var hostImg = figure.querySelector('img')
      return hostImg ? hostImg.cloneNode(true) : null
    }
    return src.cloneNode(true)
  }

  function ensureChrome(figure) {
    if (figure.getAttribute(ATTR) === '1') return figure._adtZoom
    figure.setAttribute(ATTR, '1')
    figure.classList.add('adt-diagram-zoom')

    var viewport = document.createElement('div')
    viewport.className = 'adt-diagram-zoom__viewport'
    var pending = Array.prototype.slice.call(figure.childNodes)
    pending.forEach(function (node) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('title')) return
      viewport.appendChild(node)
    })
    figure.insertBefore(viewport, figure.firstChild)

    var toolbar = document.createElement('div')
    toolbar.className = 'adt-diagram-zoom__toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'Diagram zoom')

    function btn(action, label, text) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'adt-diagram-zoom__btn'
      b.dataset.adtZoom = action
      b.setAttribute('aria-label', label)
      b.title = label
      b.textContent = text
      toolbar.appendChild(b)
      return b
    }

    btn('in', 'Zoom in', '+')
    btn('out', 'Zoom out', '\u2212')
    btn('reset', 'Reset zoom', '1:1')
    btn('expand', 'Expand diagram', '\u2197')

    figure.appendChild(toolbar)

    var state = { scale: 1, x: 0, y: 0, figure: figure, viewport: viewport }
    figure._adtZoom = state
    applyTransform(state)
    return state
  }

  function applyTransform(state) {
    var target = state.viewport.querySelector('img, svg, themed-svg, .content') || state.viewport.firstElementChild || state.viewport
    target.style.transformOrigin = 'center center'
    target.style.transform =
      'translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.scale + ')'
    state.viewport.classList.toggle('is-zoomed', state.scale !== 1 || state.x !== 0 || state.y !== 0)
  }

  function zoomBy(state, factor, cx, cy) {
    var next = clamp(state.scale * factor, MIN, MAX)
    if (next === state.scale) return
    if (typeof cx === 'number' && typeof cy === 'number') {
      var rect = state.viewport.getBoundingClientRect()
      var px = cx - rect.left - rect.width / 2
      var py = cy - rect.top - rect.height / 2
      var k = next / state.scale
      state.x = px - (px - state.x) * k
      state.y = py - (py - state.y) * k
    }
    state.scale = next
    applyTransform(state)
  }

  function resetZoom(state) {
    state.scale = 1
    state.x = 0
    state.y = 0
    applyTransform(state)
  }

  function ensureLightbox() {
    if (lightbox) return lightbox
    var root = document.createElement('div')
    root.className = 'adt-diagram-lightbox'
    root.hidden = true
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', 'Diagram viewer')
    root.innerHTML =
      '<div class="adt-diagram-lightbox__backdrop" data-adt-lb="close"></div>' +
      '<div class="adt-diagram-lightbox__panel">' +
      '<div class="adt-diagram-lightbox__toolbar" role="toolbar" aria-label="Diagram viewer controls">' +
      '<button type="button" class="adt-diagram-zoom__btn" data-adt-lb="in" aria-label="Zoom in" title="Zoom in">+</button>' +
      '<button type="button" class="adt-diagram-zoom__btn" data-adt-lb="out" aria-label="Zoom out" title="Zoom out">\u2212</button>' +
      '<button type="button" class="adt-diagram-zoom__btn" data-adt-lb="reset" aria-label="Reset zoom" title="Reset zoom">1:1</button>' +
      '<button type="button" class="adt-diagram-zoom__btn adt-diagram-lightbox__close" data-adt-lb="close" aria-label="Close diagram viewer" title="Close (Esc)">\u00d7</button>' +
      '</div>' +
      '<div class="adt-diagram-lightbox__stage" tabindex="-1">' +
      '<div class="adt-diagram-lightbox__canvas"></div>' +
      '</div>' +
      '</div>'
    document.body.appendChild(root)
    lightbox = {
      root: root,
      stage: root.querySelector('.adt-diagram-lightbox__stage'),
      canvas: root.querySelector('.adt-diagram-lightbox__canvas'),
      closeBtn: root.querySelector('[data-adt-lb="close"].adt-diagram-lightbox__close'),
      scale: 1,
      x: 0,
      y: 0,
    }
    root.addEventListener('click', onLightboxClick)
    root.addEventListener('pointerdown', onLightboxPointerDown)
    root.addEventListener('wheel', onLightboxWheel, { passive: false })
    document.addEventListener('keydown', onGlobalKey)
    return lightbox
  }

  function applyLightboxTransform() {
    var lb = lightbox
    if (!lb) return
    lb.canvas.style.transform =
      'translate(' + lb.x + 'px,' + lb.y + 'px) scale(' + lb.scale + ')'
  }

  function openLightbox(figure) {
    var lb = ensureLightbox()
    var clone = cloneVisual(figure)
    if (!clone) return
    lb.canvas.replaceChildren(clone)
    lb.scale = 1
    lb.x = 0
    lb.y = 0
    applyLightboxTransform()
    lastFocus = document.activeElement
    lb.root.hidden = false
    document.documentElement.classList.add('adt-diagram-lightbox-open')
    ;(lb.closeBtn || lb.stage).focus()
  }

  function closeLightbox() {
    if (!lightbox || lightbox.root.hidden) return
    lightbox.root.hidden = true
    lightbox.canvas.replaceChildren()
    document.documentElement.classList.remove('adt-diagram-lightbox-open')
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus() } catch (_) {}
    }
    lastFocus = null
  }

  function onLightboxClick(e) {
    var action = e.target && e.target.getAttribute && e.target.getAttribute('data-adt-lb')
    if (!action) return
    if (action === 'close') { closeLightbox(); return }
    if (action === 'in') {
      lightbox.scale = clamp(lightbox.scale * STEP, MIN, MAX)
      applyLightboxTransform()
    } else if (action === 'out') {
      lightbox.scale = clamp(lightbox.scale / STEP, MIN, MAX)
      applyLightboxTransform()
    } else if (action === 'reset') {
      lightbox.scale = 1; lightbox.x = 0; lightbox.y = 0
      applyLightboxTransform()
    }
  }

  function onLightboxPointerDown(e) {
    if (!lightbox || lightbox.root.hidden) return
    if (e.target.closest && e.target.closest('.adt-diagram-lightbox__toolbar')) return
    if (e.button !== 0) return
    e.preventDefault()
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: lightbox.x,
      origY: lightbox.y,
    }
    lightbox.stage.setPointerCapture(e.pointerId)
    lightbox.stage.addEventListener('pointermove', onLightboxPointerMove)
    lightbox.stage.addEventListener('pointerup', onLightboxPointerUp)
    lightbox.stage.addEventListener('pointercancel', onLightboxPointerUp)
  }

  function onLightboxPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return
    lightbox.x = drag.origX + (e.clientX - drag.startX)
    lightbox.y = drag.origY + (e.clientY - drag.startY)
    applyLightboxTransform()
  }

  function onLightboxPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return
    lightbox.stage.releasePointerCapture(e.pointerId)
    lightbox.stage.removeEventListener('pointermove', onLightboxPointerMove)
    lightbox.stage.removeEventListener('pointerup', onLightboxPointerUp)
    lightbox.stage.removeEventListener('pointercancel', onLightboxPointerUp)
    drag = null
  }

  function onLightboxWheel(e) {
    if (!lightbox || lightbox.root.hidden) return
    e.preventDefault()
    var factor = e.deltaY < 0 ? STEP : 1 / STEP
    lightbox.scale = clamp(lightbox.scale * factor, MIN, MAX)
    applyLightboxTransform()
  }

  function onGlobalKey(e) {
    if (!lightbox || lightbox.root.hidden) return
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); return }
    if (e.key !== 'Tab') return
    var focusables = lightbox.root.querySelectorAll(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
    if (!focusables.length) return
    var first = focusables[0]
    var last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }

  function onFigureClick(e) {
    var btn = e.target.closest && e.target.closest('[data-adt-zoom]')
    if (!btn) return
    var figure = findFigure(btn)
    if (!figure) return
    var state = ensureChrome(figure)
    var action = btn.getAttribute('data-adt-zoom')
    if (action === 'in') zoomBy(state, STEP)
    else if (action === 'out') zoomBy(state, 1 / STEP)
    else if (action === 'reset') resetZoom(state)
    else if (action === 'expand') openLightbox(figure)
  }

  function onFigureWheel(e) {
    if (lightbox && !lightbox.root.hidden) return
    var figure = findFigure(e.target)
    if (!figure || figure.getAttribute(ATTR) !== '1') return
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    var state = figure._adtZoom
    if (!state) return
    zoomBy(state, e.deltaY < 0 ? STEP : 1 / STEP, e.clientX, e.clientY)
  }

  function enhanceAll() {
    document.querySelectorAll(SELECTOR).forEach(function (figure) {
      if (figure.closest('.nav, .toc, .navbar, aside, .toolbar, .no-diagram-zoom')) return
      if (figure.classList.contains('no-diagram-zoom')) return
      if (
        figure.querySelector('img, svg, themed-svg') ||
        figure.classList.contains('adt-mermaid') ||
        figure.classList.contains('mermaid') ||
        (figure.classList.contains('imageblock') && figure.querySelector('.content'))
      ) {
        ensureChrome(figure)
      }
    })
  }

  function boot() { enhanceAll() }

  document.addEventListener('click', onFigureClick)
  document.addEventListener('wheel', onFigureWheel, { passive: false, capture: true })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
  onSoftNavLoaded(function () { closeLightbox(); boot() })
  global.addEventListener('load', function () { setTimeout(enhanceAll, 400) })
})(typeof window !== 'undefined' ? window : this)