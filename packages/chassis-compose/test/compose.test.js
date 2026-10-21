'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { resolveSoftNavContextConfig } = require('../lib/index.js')

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
