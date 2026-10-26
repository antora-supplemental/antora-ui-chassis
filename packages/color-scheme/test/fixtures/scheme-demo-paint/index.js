'use strict'

/**
 * Test and demo fixture: a paint with four color schemes, layered on
 * @antora-supplemental/default-paint. List it after default-paint:
 *
 *   antora:
 *     extensions:
 *       - '@antora-supplemental/light-dark-mode'
 *       - '@antora-supplemental/default-paint'
 *       - require: ./node_modules/@antora-supplemental/color-scheme/test/fixtures/scheme-demo-paint/index.js
 *
 * Its stylesheet declares light, dark, pink (light slot), slate (both slots) and midnight (dark
 * slot) in an @color-schemes manifest, so color-scheme adds the picker and its
 * footer link. Not a supported paint.
 */
const fs = require('node:fs')
const path = require('node:path')

const ASSET = 'css/scheme-demo-paint.css'
const LINK = `<link rel="stylesheet" href="{{{uiRootPath}}}/${ASSET}">`

function register ({ config }) {
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    const outDir = playbook.ui?.outputDir || '_'
    const contents = fs.readFileSync(path.join(__dirname, 'scheme-demo-paint.css'))
    if (!uiCatalog.findByType('asset').some((f) => f.path === ASSET)) {
      uiCatalog.addFile({ contents, type: 'asset', path: ASSET, out: { dirname: `${outDir}/css`, path: `${outDir}/${ASSET}`, basename: path.basename(ASSET) } })
    }
    const styles = uiCatalog.findByType('partial').find((f) => f.stem === 'head-styles')
    if (styles && !String(styles.contents).includes(ASSET)) styles.contents = Buffer.from(`${String(styles.contents).trimEnd()}\n${LINK}\n`)
  })
}

module.exports = register
module.exports.register = register
