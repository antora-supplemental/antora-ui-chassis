#!/usr/bin/env node
'use strict'
// Usage: asset-fingerprint [site-dir=build/site] [--include <glob>]... [--exclude <glob>]...
//        [--hash-length N] [--fonts] [--images] [--base-path /repo] [--param v]
const { fingerprintSite } = require('../lib/index.js')
const args = process.argv.slice(2)
const opts = { include: undefined, exclude: [] }
let dir = 'build/site'
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  const next = () => args[++i]
  if (a === '--include') (opts.include ||= []).push(next())
  else if (a === '--exclude') opts.exclude.push(next())
  else if (a === '--hash-length') opts.hashLength = Number(next())
  else if (a === '--fonts') opts.fonts = true
  else if (a === '--images') opts.images = true
  else if (a === '--base-path') opts.basePath = next()
  else if (a === '--param') opts.param = next()
  else if (a === '-h' || a === '--help') { console.log('asset-fingerprint [site-dir] [--include g] [--exclude g] [--hash-length N] [--fonts] [--images] [--base-path /p] [--param v]'); process.exit(0) }
  else dir = a
}
const r = fingerprintSite(dir, opts)
console.log(`asset-fingerprint: ${r.urls} URL(s) in ${r.files} page(s), ${r.assets} asset(s) hashed`)
