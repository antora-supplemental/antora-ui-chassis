#!/usr/bin/env node
// Warn when a theme UI dir ships brand files (see checkTheme in lib/index.js).
//   node .../brand-placeholder/scripts/validate-theme.mjs <theme-ui-dir> [--strict] [--allow=a,b]
// Warnings exit 0; --strict exits 1 when there is any warning.
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
const strict = args.includes('--strict')
const allow = (args.find((a) => a.startsWith('--allow=')) || '--allow=').slice(8).split(',').filter(Boolean)
if (!dir) { console.error('usage: validate-theme.mjs <theme-ui-dir> [--strict] [--allow=a,b]'); process.exit(2) }
const { checkTheme } = createRequire(import.meta.url)('../lib/index.js')
const warnings = checkTheme(dir, allow)
for (const w of warnings) console.warn(`warning: ${w}`)
console.log(`brand-placeholder: ${warnings.length} warning(s) in ${dir}`)
process.exit(strict && warnings.length ? 1 : 0)
