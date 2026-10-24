'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { appendFooterScriptAfter } = require('../../ui-bus/lib/index.js')

function mockCatalog (partials) {
  const files = partials.map((p) => ({ stem: p.stem, contents: Buffer.from(p.body) }))
  return { findByType: (type) => (type === 'partial' ? files : []) }
}

describe('page-state injection', () => {
  it('inserts after soft-nav.js, which follows ui-bus.js', () => {
    const cat = mockCatalog([{
      stem: 'footer-content',
      body: '<script src="{{{uiRootPath}}}/js/ui-bus.js" defer></script>\n<script src="{{{uiRootPath}}}/js/soft-nav.js" defer></script>\n',
    }])
    appendFooterScriptAfter(cat, 'js/page-state.js', ['soft-nav.js', 'ui-bus.js'])
    const body = cat.findByType('partial')[0].contents.toString('utf8')
    assert.ok(body.indexOf('ui-bus.js') < body.indexOf('soft-nav.js'))
    assert.ok(body.indexOf('soft-nav.js') < body.indexOf('page-state.js'))
  })

  it('does not duplicate script tags', () => {
    const cat = mockCatalog([{ stem: 'footer-scripts', body: '<script src="{{{uiRootPath}}}/js/page-state.js" defer></script>\n' }])
    appendFooterScriptAfter(cat, 'js/page-state.js', ['soft-nav.js'])
    assert.equal((cat.findByType('partial')[0].contents.toString().match(/page-state\.js/g) || []).length, 1)
  })
})