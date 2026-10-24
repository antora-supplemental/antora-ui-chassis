'use strict'
const test = require('node:test')
const assert = require('node:assert')
delete globalThis.UiBus
require('../js/ui-bus.js')
const { events, state } = globalThis.UiBus

test('events are transient and unsubscribable', () => {
  const got = []
  events.emit('x', 0)
  const off = events.on('x', (d) => got.push(d))
  events.emit('x', 1)
  off()
  events.emit('x', 2)
  assert.deepStrictEqual(got, [1])
})

test('once fires a single time', () => {
  let n = 0
  events.once('y', () => n++)
  events.emit('y'); events.emit('y')
  assert.strictEqual(n, 1)
})

test('state watch replays current value and notifies only on change', () => {
  state.set('page.url', '/a')
  const got = []
  const off = state.watch('page.url', (v, prev) => got.push([v, prev]))
  state.set('page.url', '/a')
  state.set('page.url', '/b')
  off()
  state.set('page.url', '/c')
  assert.deepStrictEqual(got, [['/a', undefined], ['/b', '/a']])
  assert.strictEqual(state.get('page.url'), '/c')
})

test('a throwing handler does not stop others', () => {
  let ok = false
  events.on('z', () => { throw new Error('boom') })
  events.on('z', () => { ok = true })
  const warn = console.warn; console.warn = () => {}
  events.emit('z'); console.warn = warn
  assert.ok(ok)
})