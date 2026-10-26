'use strict'

// Resolves the color-scheme layer: the installed package, or the sibling
// package when running from the antora-ui-chassis checkout.
try {
  module.exports = require('@antora-supplemental/color-scheme')
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err
  module.exports = require('../../color-scheme/lib/index.js')
}
