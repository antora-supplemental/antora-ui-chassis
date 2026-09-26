/**
 * SoftNav — same-origin soft navigation bus for Antora UI chrome.
 *
 * Intercepts in-article (and same-component nav) links, fetches the next page,
 * swaps registered regions (mast / article; nav prefers in-place current sync),
 * then emits lifecycle events so consumers rebind without SoftNav naming them.
 *
 * Same-component nav-tree clicks soft-navigate so the left rail keeps its
 * scroll position. Cross-component links do a full document load.
 *
 * On each successful load the *content* column scrolls to top for reading
 * without resetting the independent nav scrollport.
 *
 * Public API:
 *   SoftNav.on('before'|'loaded'|'failed', handler) -> unsubscribe
 *   SoftNav.registerRegion({ id, extract(doc), apply(fresh, ctx) })
 *   SoftNav.navigate(url)
 *   SoftNav.transition = 'none' | 'crossfade'  (default: none — DeepWiki-like)
 *   SoftNav.replaceNav = false | true          (default: false — patch currents)
 *
 * DOM events (detail = ctx): soft-nav:before | soft-nav:loaded | soft-nav:failed
 * Compat: also fires doc-nav:loaded on successful swaps.
 */
;(function (global) {
  'use strict'

  var FADE_MS = 180
  var listeners = { before: [], loaded: [], failed: [] }
  var regions = Object.create(null)

  function emit (event, detail) {
    var list = listeners[event] || []
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](detail)
      } catch (err) {
        console.warn('[soft-nav] listener error on ' + event, err)
      }
    }
    document.dispatchEvent(new CustomEvent('soft-nav:' + event, { detail: detail }))
    if (event === 'loaded') {
      document.dispatchEvent(new CustomEvent('doc-nav:loaded', { detail: detail }))
    }
  }

  var SoftNav = {
    transition: 'none',
    replaceNav: false,
    on: function (event, handler) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
      return function unsubscribe () {
        var list = listeners[event]
        if (!list) return
        var i = list.indexOf(handler)
        if (i >= 0) list.splice(i, 1)
      }
    },
    registerRegion: function (spec) {
      if (!spec || !spec.id || typeof spec.extract !== 'function' || typeof spec.apply !== 'function') {
        throw new Error('SoftNav.registerRegion requires { id, extract, apply }')
      }
      regions[spec.id] = spec
      return SoftNav
    },
    navigate: function (url) {
      return navigate(url, true)
    },
  }

  function pageUrl (url) {
    return new URL(url, window.location.href)
  }

  function sameOrigin (url) {
    try {
      return pageUrl(url).origin === window.location.origin
    } catch (e) {
      return false
    }
  }

  function samePath (url) {
    try {
      return pageUrl(url).pathname === window.location.pathname
    } catch (e) {
      return false
    }
  }

  function componentName (url) {
    try {
      var parts = pageUrl(url).pathname.split('/').filter(Boolean)
      return parts[0] || ''
    } catch (e) {
      return ''
    }
  }

  function sameComponent (url) {
    return componentName(url) === componentName(window.location.href)
  }

  function normalizePath (href) {
    try {
      var u = pageUrl(href)
      var path = u.pathname || '/'
      path = path.replace(/\/index\.html$/i, '/')
      if (path.length > 1) path = path.replace(/\/+$/, '/') || '/'
      return path
    } catch (e) {
      return String(href || '').split(/[?#]/)[0]
    }
  }

  function absolutize (rootEl, destHref) {
    if (!rootEl) return
    var base = pageUrl(destHref)
    ;['href', 'src'].forEach(function (attr) {
      ;[].forEach.call(rootEl.querySelectorAll('[' + attr + ']'), function (el) {
        var raw = el.getAttribute(attr)
        if (!raw || raw.charAt(0) === '#' || raw.indexOf('mailto:') === 0 || raw.indexOf('javascript:') === 0) {
          return
        }
        try {
          el.setAttribute(attr, new URL(raw, base).href)
        } catch (e) {
          /* leave as-is */
        }
      })
    })
  }

  function bindBreadcrumbDropdowns (scope) {
    if (!scope) return
    ;[].forEach.call(scope.querySelectorAll('.adt-bc-dropdown'), function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation()
      })
    })
    ;[].forEach.call(scope.querySelectorAll('[data-adt-toggle]'), function (button) {
      if (button.getAttribute('data-adt-bound')) return
      button.setAttribute('data-adt-bound', '1')
      var id = button.getAttribute('data-adt-toggle')
      if (!id) return
      var list = document.getElementById(id)
      if (!list) return
      button.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        var isHidden = list.hasAttribute('hidden')
        ;[].forEach.call(document.querySelectorAll('.adt-bc-dropdown'), function (dd) {
          if (dd === list) return
          dd.setAttribute('hidden', 'hidden')
        })
        ;[].forEach.call(document.querySelectorAll('[data-adt-toggle]'), function (b) {
          b.setAttribute('aria-expanded', 'false')
        })
        if (isHidden) {
          list.removeAttribute('hidden')
          button.setAttribute('aria-expanded', 'true')
        } else {
          list.setAttribute('hidden', 'hidden')
          button.setAttribute('aria-expanded', 'false')
        }
      })
    })
  }

  function extractTitle (doc) {
    var t = doc.querySelector('title')
    return t ? t.textContent : document.title
  }

  function navScrollEl () {
    return document.querySelector('.nav-container [data-panel=menu]')
  }

  function readNavScroll () {
    var el = navScrollEl()
    return el ? el.scrollTop || 0 : 0
  }

  function writeNavScroll (y) {
    var el = navScrollEl()
    if (!el) return
    el.scrollTop = y
    if (typeof window.siteNavTreeSaveScroll === 'function') window.siteNavTreeSaveScroll()
  }

  function scrollContentToTop () {
    var articleHost =
      document.querySelector('main.article .content') ||
      document.querySelector('main.article') ||
      document.querySelector('article.doc') ||
      document.querySelector('.adt-article .content')
    if (articleHost && typeof articleHost.scrollTo === 'function') {
      try {
        articleHost.scrollTo(0, 0)
      } catch (e) {
        articleHost.scrollTop = 0
      }
    } else if (articleHost) {
      articleHost.scrollTop = 0
    }
    window.scrollTo(0, 0)
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0
    if (document.documentElement) document.documentElement.scrollTop = 0
    if (document.body) document.body.scrollTop = 0
  }

  function markNavCurrentByUrl (url) {
    if (typeof window.siteNavTreeMarkCurrentByPath === 'function') {
      window.siteNavTreeMarkCurrentByPath(url)
      return
    }
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!menu) return
    var want = normalizePath(url)
    var matches = []
    menu.querySelectorAll('a.nav-link').forEach(function (a) {
      if (normalizePath(a.getAttribute('href') || a.href) === want) {
        var li = a.closest('li.nav-item')
        if (li) matches.push(li)
      }
    })
    if (!matches.length) return
    matches.sort(function (a, b) {
      return (parseInt(b.getAttribute('data-depth'), 10) || 0) - (parseInt(a.getAttribute('data-depth'), 10) || 0)
    })
    menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
      el.classList.remove('is-current-page')
    })
    matches[0].classList.add('is-current-page')
  }

  SoftNav.registerRegion({
    id: 'mast',
    extract: function (doc) {
      return doc.querySelector('.adt-doc-mast-center') || doc.querySelector('nav.breadcrumbs')
    },
    apply: function (fresh, ctx) {
      var host = document.querySelector('.adt-doc-mast-center')
      if (!host) host = document.querySelector('nav.breadcrumbs')
      if (!host || !fresh) return
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      host.replaceWith(node)
      bindBreadcrumbDropdowns(node)
    },
  })

  SoftNav.registerRegion({
    id: 'nav',
    extract: function (doc) {
      return doc.querySelector('.nav-container [data-panel=menu]')
    },
    apply: function (fresh, ctx) {
      if (!fresh) return
      var panel = document.querySelector('.nav-container [data-panel=menu]')
      if (!panel) return
      // Forest nav HTML is identical across pages — keep the live DOM (no flash)
      // and retarget is-current-page. Opt into full replace with SoftNav.replaceNav.
      if (!SoftNav.replaceNav && panel.querySelector('nav.nav-menu')) {
        markNavCurrentByUrl(ctx.url)
        if (typeof ctx.navScrollY === 'number') writeNavScroll(ctx.navScrollY)
        return
      }
      var savedY = typeof ctx.navScrollY === 'number' ? ctx.navScrollY : readNavScroll()
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      panel.innerHTML = ''
      while (node.firstChild) panel.appendChild(node.firstChild)
      writeNavScroll(savedY)
      requestAnimationFrame(function () {
        writeNavScroll(savedY)
      })
    },
  })

  SoftNav.registerRegion({
    id: 'article',
    extract: function (doc) {
      return (
        doc.querySelector('main.article .content') ||
        doc.querySelector('main.article') ||
        doc.querySelector('article.doc')
      )
    },
    apply: function (fresh, ctx) {
      var articleHost =
        document.querySelector('main.article .content') ||
        document.querySelector('main.article') ||
        document.querySelector('article.doc')
      if (!articleHost || !fresh) {
        window.location.href = ctx.url
        return
      }
      var node = document.importNode(fresh, true)
      absolutize(node, ctx.url)
      var fade = SoftNav.transition !== 'none'
      function commit () {
        articleHost.innerHTML = ''
        while (node.firstChild) articleHost.appendChild(node.firstChild)
        if (fade) {
          articleHost.style.opacity = '1'
          window.setTimeout(function () {
            articleHost.style.transition = ''
          }, FADE_MS)
        }
        scrollContentToTop()
        if (typeof ctx.navScrollY === 'number') writeNavScroll(ctx.navScrollY)
        else if (typeof window.siteNavTreeRestoreScroll === 'function') window.siteNavTreeRestoreScroll()
        ctx.articleHost = articleHost
        emit('loaded', ctx)
      }
      if (fade) {
        articleHost.style.transition = 'opacity ' + FADE_MS + 'ms ease'
        articleHost.style.opacity = '0'
        window.setTimeout(commit, FADE_MS)
      } else {
        commit()
      }
    },
  })

  function applyRegions (doc, ctx) {
    var order = ['mast', 'nav', 'article']
    var i
    for (i = 0; i < order.length; i++) {
      var id = order[i]
      var spec = regions[id]
      if (!spec) continue
      var fresh = spec.extract(doc)
      if (id === 'article' && !fresh) throw new Error('no article')
      spec.apply(fresh, ctx)
    }
    Object.keys(regions).forEach(function (id) {
      if (order.indexOf(id) >= 0) return
      var spec = regions[id]
      spec.apply(spec.extract(doc), ctx)
    })
  }

  function navigate (url, push) {
    var dest = pageUrl(url).href
    var ctx = { url: dest, push: !!push, navScrollY: readNavScroll() }
    if (typeof window.siteNavTreeSaveScroll === 'function') window.siteNavTreeSaveScroll()
    emit('before', ctx)
    return fetch(dest, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed')
        return res.text()
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html')
        ctx.doc = doc
        if (push) history.pushState({ softNav: true, docNav: true }, '', dest)
        document.title = extractTitle(doc)
        applyRegions(doc, ctx)
      })
      .catch(function (err) {
        emit('failed', { url: dest, error: err })
        window.location.href = dest
      })
  }

  global.SoftNav = SoftNav

  var root = document.querySelector('.body')
  var articleHost =
    document.querySelector('main.article .content') ||
    document.querySelector('main.article') ||
    document.querySelector('article.doc')
  if (!root || !articleHost) return

  function markNavCurrentFromLink (a) {
    var li = a && a.closest && a.closest('li.nav-item')
    var menu = document.querySelector('.nav-container [data-panel=menu]')
    if (!li || !menu) return
    menu.querySelectorAll('.nav-item.is-current-page').forEach(function (el) {
      el.classList.remove('is-current-page')
    })
    li.classList.add('is-current-page')
    if (typeof window.siteNavTreeCurrent === 'function') window.siteNavTreeCurrent()
  }

  root.addEventListener('click', function (ev) {
    var a = ev.target.closest('a')
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return
    var href = a.getAttribute('href')
    if (!href || href.charAt(0) === '#') return
    if (sameOrigin(a.href) && samePath(a.href)) {
      if (a.classList.contains('nav-link') && a.closest('.nav-container')) {
        ev.preventDefault()
        markNavCurrentFromLink(a)
      }
      return
    }
    if (!sameOrigin(a.href)) return
    if (!sameComponent(a.href)) {
      if (a.closest('.nav-container') && typeof window.siteNavTreeSaveScroll === 'function') {
        window.siteNavTreeSaveScroll()
      }
      return
    }
    ev.preventDefault()
    navigate(a.href, true)
  })

  window.addEventListener('popstate', function () {
    navigate(window.location.href, false)
  })

  if (!history.state || !(history.state.softNav || history.state.docNav)) {
    history.replaceState({ softNav: true, docNav: true }, '', window.location.href)
  }
})(window)