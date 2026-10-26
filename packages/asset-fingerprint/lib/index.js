'use strict'
// Asset fingerprint: rewrite CSS/JS (optionally font/img) URLs in built HTML to ?v=<content hash>,
// so a deploy shows up at once instead of after the browser's cache max-age (GitHub Pages: 4 h).
// Theme-agnostic: works on any built Antora site, as an Antora extension (sitePublished) or a CLI.
const { readdirSync, readFileSync, writeFileSync, statSync, existsSync } = require('node:fs')
const { join, dirname, resolve, relative, sep } = require('node:path')
const { createHash } = require('node:crypto')

const DEFAULT_INCLUDE = ['_/css/**', '_/js/**', '**/search-index.js']
const FONT_INCLUDE = ['_/font/**', '_/fonts/**']
const IMG_INCLUDE = ['_/img/**']

function globToRegExp (glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

function normalizeOptions (opts = {}) {
  let include = opts.include ? [].concat(opts.include) : DEFAULT_INCLUDE.slice()
  if (opts.fonts) include = include.concat(FONT_INCLUDE)
  if (opts.images) include = include.concat(IMG_INCLUDE)
  const exclude = opts.exclude ? [].concat(opts.exclude) : []
  const length = Math.max(4, Math.min(64, Number(opts.hashLength || opts.hash_length || opts.length || 10)))
  const param = opts.param || 'v'
  let basePath = opts.basePath || opts.base_path || ''
  if (basePath && !basePath.startsWith('/')) basePath = '/' + basePath
  basePath = basePath.replace(/\/+$/, '')
  return { include: include.map(globToRegExp), exclude: exclude.map(globToRegExp), length, param, basePath, pages: opts.pages ? [].concat(opts.pages).map(globToRegExp) : null }
}

function walk (dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const toPosix = (p) => p.split(sep).join('/')
const ATTR_RE = /(\s(?:href|src)\s*=\s*)(["'])([^"']*)\2/gi

/**
 * Fingerprint asset URLs in every HTML file under siteDir.
 * @returns {{ files: number, urls: number, assets: number }}
 */
function fingerprintSite (siteDir, opts = {}) {
  const o = normalizeOptions(opts)
  const root = resolve(siteDir)
  if (!existsSync(root)) throw new Error(`asset-fingerprint: site dir not found: ${root}`)
  const hashes = new Map()
  const hashOf = (abs) => {
    if (!hashes.has(abs)) hashes.set(abs, createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, o.length))
    return hashes.get(abs)
  }
  const matches = (rel) => o.include.some((r) => r.test(rel)) && !o.exclude.some((r) => r.test(rel))
  let files = 0
  let urls = 0
  for (const f of walk(root)) {
    if (!f.endsWith('.html')) continue
    const relPage = toPosix(relative(root, f))
    if (o.pages && !o.pages.some((r) => r.test(relPage))) continue
    const t = readFileSync(f, 'utf8')
    const u = t.replace(ATTR_RE, (m, pre, q, url) => {
      if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return m
      const hashAt = url.indexOf('#')
      const frag = hashAt >= 0 ? url.slice(hashAt) : ''
      const noFrag = hashAt >= 0 ? url.slice(0, hashAt) : url
      const qAt = noFrag.indexOf('?')
      const path = qAt >= 0 ? noFrag.slice(0, qAt) : noFrag
      const query = qAt >= 0 ? noFrag.slice(qAt + 1) : ''
      if (new RegExp('(?:^|&)' + o.param + '=').test(query)) return m
      let abs
      if (path.startsWith('/')) {
        let p = path
        if (o.basePath && (p === o.basePath || p.startsWith(o.basePath + '/'))) p = p.slice(o.basePath.length)
        abs = join(root, decodeURIComponent(p))
      } else abs = resolve(dirname(f), decodeURIComponent(path))
      const rel = toPosix(relative(root, abs))
      if (rel.startsWith('..') || !matches(rel) || !existsSync(abs) || !statSync(abs).isFile()) return m
      urls++
      return pre + q + path + '?' + (query ? query + '&' : '') + o.param + '=' + hashOf(abs) + frag + q
    })
    if (u !== t) { writeFileSync(f, u); files++ }
  }
  return { files, urls, assets: hashes.size }
}

/** Antora extension: runs after the site is written to disk. */
function register ({ config = {}, playbook } = {}) {
  const logger = this.getLogger ? this.getLogger('@antora-supplemental/asset-fingerprint') : console
  const opts = { ...config }
  this.on('sitePublished', ({ playbook: pb, publications }) => {
    pb = pb || playbook
    if (opts.enabled === false) return
    if (!opts.basePath && pb && pb.site && pb.site.url) {
      try { opts.basePath = new URL(pb.site.url).pathname } catch {}
    }
    const dirs = new Set()
    for (const p of publications || []) if (p && p.resolvedPath) dirs.add(p.resolvedPath)
    if (!dirs.size && pb && pb.output && pb.output.dir) dirs.add(resolve(pb.dir || process.cwd(), pb.output.dir))
    for (const d of dirs) {
      if (!existsSync(d) || !statSync(d).isDirectory()) continue
      const r = fingerprintSite(d, opts)
      logger.info(`asset-fingerprint: ${r.urls} URL(s) in ${r.files} page(s), ${r.assets} asset(s) hashed (${d})`)
    }
  })
}

module.exports = { register, fingerprintSite, globToRegExp, DEFAULT_INCLUDE }
