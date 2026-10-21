'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { appendFooterScriptAfter } = require('../lib/index.js')

function mockCatalog (partials) {
  const files = partials.map((p) => ({
    stem: p.stem,
    contents: Buffer.from(p.body),
  }))
  return {
    findByType (type) {
      if (type !== 'partial') return []
      return files
    },
  }
}

describe('soft-nav-context extension injection', () => {
  it('inserts after soft-nav.js in footer-content', () => {
    const uiCatalog = mockCatalog([
      {
        stem: 'footer-content',
        body: '<script src="{{{uiRootPath}}}/js/soft-nav.js" defer></script>\n',
      },
    ])
    assert.equal(
      appendFooterScriptAfter(uiCatalog, 'js/soft-nav-context.js', 'soft-nav.js'),
      true
    )
    const body = uiCatalog.findByType('partial')[0].contents.toString('utf8')
    assert.match(body, /soft-nav\.js.*\n<script src="\{\{\{uiRootPath\}\}\}\/js\/soft-nav-context\.js" defer><\/script>/s)
  })

  it('does not duplicate script tags', () => {
    const uiCatalog = mockCatalog([
      {
        stem: 'footer-scripts',
        body: '<script src="{{{uiRootPath}}}/js/soft-nav-context.js" defer></script>\n',
      },
    ])
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav-context.js', 'soft-nav.js')
    const body = uiCatalog.findByType('partial')[0].contents.toString('utf8')
    assert.equal((body.match(/soft-nav-context\.js/g) || []).length, 1)
  })
})
