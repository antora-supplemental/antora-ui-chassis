/**
 * UiBus - general event bus for Antora UI extensions.
 *
 * Knows nothing about navigation, themes, or any feature. Lives for the life
 * of the document (across soft navigations) and lets independent extensions
 * talk without naming each other.
 *
 *   UiBus.events - signals: transient. Miss one and it is gone.
 *     .on(name, fn) -> off      .once(name, fn) -> off
 *     .off(name, fn)            .emit(name, detail)
 *
 *   UiBus.state  - values: persistent, readable any time.
 *     .get(key)                 .set(key, value)   (notifies only on change)
 *     .watch(key, fn) -> off    (fn(value, prev) now, then on every change)
 *     .keys()
 *
 * Naming: dotted, owner-first. Events like 'nav:loaded'; state like 'page.url'.
 * Load first, before any extension script.
 */
;(function (global) {
  'use strict'
  if (global.UiBus) return

  function makeRegistry (label) {
    var map = Object.create(null)
    return {
      add: function (key, fn) {
        if (typeof fn !== 'function') throw new Error('UiBus.' + label + ': handler must be a function')
        ;(map[key] || (map[key] = [])).push(fn)
        return function off () { remove(key, fn) }
      },
      remove: remove,
      call: function (key, a, b) {
        var list = map[key]
        if (!list) return
        list = list.slice()
        for (var i = 0; i < list.length; i++) {
          try { list[i](a, b) } catch (err) { console.warn('[ui-bus] ' + label + ' handler error on ' + key, err) }
        }
      },
    }
    function remove (key, fn) {
      var list = map[key]
      if (!list) return
      var i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    }
  }

  var eventRegistry = makeRegistry('events')
  var watchRegistry = makeRegistry('state')
  var values = Object.create(null)

  var events = {
    on: function (name, fn) { return eventRegistry.add(name, fn) },
    once: function (name, fn) {
      var off = eventRegistry.add(name, function (detail) { off(); fn(detail) })
      return off
    },
    off: function (name, fn) { eventRegistry.remove(name, fn) },
    emit: function (name, detail) { eventRegistry.call(name, detail) },
  }

  var state = {
    get: function (key) { return values[key] },
    set: function (key, value) {
      var prev = values[key]
      if (Object.is(prev, value) && key in values) return
      values[key] = value
      watchRegistry.call(key, value, prev)
    },
    watch: function (key, fn) {
      var off = watchRegistry.add(key, fn)
      if (key in values) {
        try { fn(values[key], undefined) } catch (err) { console.warn('[ui-bus] state handler error on ' + key, err) }
      }
      return off
    },
    keys: function () { return Object.keys(values) },
  }

  global.UiBus = Object.freeze({ version: '0.1.0', events: Object.freeze(events), state: Object.freeze(state) })
})(typeof window !== 'undefined' ? window : globalThis)