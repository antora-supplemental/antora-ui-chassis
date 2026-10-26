#!/usr/bin/env node
// Copy the chassis placeholder into an unpacked theme UI bundle dir, last, so
// the bundle carries the chassis copies and no theme copies of these paths.
//   node node_modules/@antora-supplemental/brand-placeholder/scripts/bake.mjs <ui-bundle-dir>
import { cpSync } from 'node:fs'
import { createRequire } from 'node:module'
const dir = process.argv[2]
if (!dir) { console.error('usage: bake.mjs <ui-bundle-dir>'); process.exit(2) }
const { UI_DIR, RESERVED } = createRequire(import.meta.url)('../lib/index.js')
cpSync(UI_DIR, dir, { recursive: true })
console.log(`brand-placeholder: baked ${RESERVED.length} files into ${dir}`)
