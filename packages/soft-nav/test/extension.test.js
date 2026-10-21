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

describe('soft-nav extension injection', () => {
  it('inserts after site.js in footer-scripts', () => {
    const uiCatalog = mockCatalog([
      {
        stem: 'footer-scripts',
        body: '<script src="{{{uiRootPath}}}/js/site.js" defer></script>\n',
      },
    ])
    assert.equal(
      appendFooterScriptAfter(uiCatalog, 'js/soft-nav.js', 'site.js'),
      true
    )
    const body = uiCatalog.findByType('partial')[0].contents.toString('utf8')
    assert.match(body, /site\.js.*\n<script src="\{\{\{uiRootPath\}\}\}\/js\/soft-nav\.js" defer><\/script>/s)
  })

  it('does not duplicate script tags', () => {
    const uiCatalog = mockCatalog([
      {
        stem: 'footer-content',
        body: '<script src="{{{uiRootPath}}}/js/soft-nav.js" defer></script>\n',
      },
    ])
    appendFooterScriptAfter(uiCatalog, 'js/soft-nav.js', 'site.js')
    const body = uiCatalog.findByType('partial')[0].contents.toString('utf8')
    assert.equal((body.match(/soft-nav\.js/g) || []).length, 1)
  })
})
