'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveSoftNavConfig,
  resolveSoftNavContextConfig,
} = require('../lib/resolve-config.js')

describe('chassis-compose soft-nav config', () => {
  it('passes through top-level options when softNav not nested', () => {
    assert.deepEqual(resolveSoftNavConfig({ ui: false }), { ui: false })
  })

  it('disables soft-nav when nested or compose enabled is false', () => {
    assert.equal(resolveSoftNavConfig({ softNav: false }), null)
    assert.equal(resolveSoftNavConfig({ softNav: { enabled: false } }), null)
  })
})

describe('chassis-compose soft-nav-context config', () => {
  it('passes through top-level child options (compose pack merge)', () => {
    assert.deepEqual(resolveSoftNavContextConfig({ ui: false }), { ui: false })
  })

  it('merges nested softNavContext override', () => {
    assert.deepEqual(resolveSoftNavContextConfig({ softNavContext: { ui: false } }), { ui: false })
  })

  it('disables child when compose or nested enabled is false', () => {
    assert.equal(resolveSoftNavContextConfig({ enabled: false }), null)
    assert.equal(resolveSoftNavContextConfig({ softNavContext: false }), null)
    assert.equal(resolveSoftNavContextConfig({ softNavContext: { enabled: false } }), null)
  })
})
