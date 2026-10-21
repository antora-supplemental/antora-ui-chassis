'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

function loadRuntime () {
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'soft-nav-context.js'),
    'utf8'
  )
  const order = []
  const domListeners = {}
  const sandbox = {
    console,
    URL,
    CustomEvent: class CustomEvent {
      constructor (type, init) {
        this.type = type
        this.detail = init && init.detail
      }
    },
  }
  sandbox.location = { href: 'https://example/mycomp/1.0/page.html' }
  sandbox.window = sandbox
  sandbox.document = {
    dispatchEvent (ev) {
      order.push('dom:' + ev.type)
      var list = domListeners[ev.type] || []
      for (var i = 0; i < list.length; i++) list[i](ev)
    },
    addEventListener (type, fn) {
      if (!domListeners[type]) domListeners[type] = []
      domListeners[type].push(fn)
    },
    readyState: 'complete',
    querySelector () { return null },
    getElementById () { return null },
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  sandbox._order = order
  return sandbox
}

function nextContext (runtime, url) {
  runtime.document.dispatchEvent(new runtime.CustomEvent('soft-nav:loaded', {
    detail: {
      url: url || 'https://example/docs/other/2.0/next.html',
      doc: {
        getElementById () {
          return {
            textContent: JSON.stringify({
              url: url || 'https://example/docs/other/2.0/next.html',
              component: { name: 'other', title: 'Other' },
              version: { name: '2.0', display: '2.0' },
            }),
          }
        },
        querySelector () { return null },
        querySelectorAll () { return [] },
      },
    },
  }))
}

describe('SoftNavSignals', () => {
  it('get and derived keys reflect current context', () => {
    const rt = loadRuntime()
    const signals = rt.SoftNavSignals
    assert.equal(signals.get('componentName'), 'mycomp')
    assert.ok(signals.get('scopeLabel').length > 0)
  })

  it('subscribe(key) fires immediately then on navigation', () => {
    const rt = loadRuntime()
    const signals = rt.SoftNavSignals
    const urls = []
    signals.subscribe('pageUrl', function (u) {
      urls.push(u)
    })
    assert.equal(urls.length, 1)
    nextContext(rt)
    assert.equal(urls.length, 2)
    assert.match(urls[1], /other\/2\.0/)
  })

  it('unsubscribe stops key notifications', () => {
    const rt = loadRuntime()
    const signals = rt.SoftNavSignals
    var count = 0
    var unsub = signals.subscribe('componentName', function () {
      count++
    })
    assert.equal(count, 1)
    unsub()
    nextContext(rt)
    assert.equal(count, 1)
  })

  it('context phase and signals run before loaded phase', () => {
    const rt = loadRuntime()
    const order = rt._order
    rt.SoftNavContext.on('loaded', function () {
      order.push('phase:loaded')
    })
    rt.SoftNavContext.on('context', function () {
      order.push('phase:context')
    })
    var navOrder = []
    rt.SoftNavSignals.subscribe('pageUrl', function () {
      navOrder.push('signal:pageUrl')
    })
    navOrder.length = 0
    order.length = 0
    nextContext(rt)
    const ctxIdx = order.indexOf('phase:context')
    const loadedIdx = order.indexOf('phase:loaded')
    assert.ok(navOrder.indexOf('signal:pageUrl') >= 0)
    assert.ok(ctxIdx >= 0 && loadedIdx > ctxIdx)
  })

  it('batched key order is stable on each context update', () => {
    const rt = loadRuntime()
    const signals = rt.SoftNavSignals
    const seen = []
    signals.keys().forEach(function (key) {
      if (key === 'context') return
      signals.subscribe(key, function () {
        seen.push(key)
      })
    })
    const perUpdate = seen.length
    seen.length = 0
    nextContext(rt)
    assert.equal(seen.length, perUpdate)
    assert.equal(
      seen.join(','),
      signals.keys().filter(function (k) { return k !== 'context' }).join(',')
    )
  })
})
