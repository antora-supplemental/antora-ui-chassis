'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { resolvePageStateConfig, resolveSoftNavConfig, resolveUiBusConfig } = require('../lib/resolve-config.js')

describe('chassis-compose member config', () => {
  it('passes top-level options through, minus member keys', () => {
    assert.deepEqual(resolvePageStateConfig({ ui: false, softNav: false }), { ui: false })
  })
  it('uses a nested override', () => {
    assert.deepEqual(resolveSoftNavConfig({ softNav: { ui: false } }), { ui: false })
  })
  it('disables members', () => {
    assert.equal(resolveUiBusConfig({ enabled: false }), null)
    assert.equal(resolvePageStateConfig({ pageState: false }), null)
    assert.equal(resolveSoftNavConfig({ softNav: { enabled: false } }), null)
  })
})