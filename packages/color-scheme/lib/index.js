'use strict'

/**
 * @antora-supplemental/color-scheme - Antora extension.
 *
 * Light/dark mechanism with no colors: inlines the head hook (no FOUC), links
 * css/color-scheme.css right after the UI's site.css, and loads
 * js/color-scheme.js (persistence, system preference, toggle binding) after
 * UiBus / site.js.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/color-scheme'
 *         toggle: auto     # auto (default): create #theme-toggle in .navbar-end if the body kit placed none
 *                          # placed: only bind a #theme-toggle the body kit placed
 *         navbar: light    # optional: <meta name="dm-navbar"> value, exposed as html[data-dm-navbar] for paint
 *         live_paint:      # optional (off by default): pick the paint at view time
 *           enabled: true
 *           param: paint           # ?paint=<id>; ?paint=reset clears
 *           cookie: cs-paint       # remembers the choice (SameSite=Lax)
 *           cookie_path: /
 *           paints:                # the ONLY loadable paints; ids: lowercase letters/digits
 *             default: css/default-paint.css                       # UI path (relative to the UI root)
 *             valentus: https://cdn.example.org/valentus/site-paint.css
 *           allow_origins: [https://registry.antora-supplemental.org]   # postMessage senders
 *
 * Antora camelCases playbook keys, so live_paint / cookie_path / allow_origins
 * arrive as livePaint / cookiePath / allowOrigins.
 */

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ID = '@antora-supplemental/color-scheme'
const ROOT = path.join(__dirname, '..')
const HEAD_STEMS = ['head-styles', 'head-meta']
const FOOT_STEMS = ['footer-scripts', 'footer-content']
const HEAD_MARKER = 'data-color-scheme-head'

function bodyOf (file) {
  return Buffer.isBuffer(file.contents) ? file.contents.toString('utf8') : String(file.contents || '')
}

function addOrReplaceAsset (uiCatalog, uiOutputDir, relPath, contents) {
  const existing = uiCatalog.findByType('asset').find((f) => f.path === relPath)
  if (existing) {
    existing.contents = contents
    return
  }
  const dirname = path.posix.dirname(relPath)
  const basename = path.posix.basename(relPath)
  const outDir = dirname === '.' ? uiOutputDir : `${uiOutputDir}/${dirname}`
  uiCatalog.addFile({
    contents,
    type: 'asset',
    path: relPath,
    out: { dirname: outDir, path: `${outDir}/${basename}`, basename },
  })
}

// Antora camelCases playbook keys at every depth (my-paint -> myPaint), so ids are plain lowercase.
const PAINT_ID = /^[a-z][a-z0-9]{0,31}$/
const ORIGIN = /^https?:\/\/[^/\s'"<>]+$/

/** Validated live-paint config, or null when disabled. Throws on bad input so a typo fails the build. */
function livePaintConfig (config = {}) {
  const lp = config.livePaint
  if (!lp || lp.enabled !== true) return null
  const paints = {}
  for (const [id, href] of Object.entries(lp.paints || {})) {
    if (!PAINT_ID.test(id) || id === 'reset') throw new Error(`color-scheme livePaint: invalid paint id '${id}' (lowercase letters and digits, starting with a letter)`)
    const h = String(href || '')
    if (!h || /[\s"'<>`\\]|^(javascript|data):/i.test(h)) throw new Error(`color-scheme livePaint: invalid href for paint '${id}'`)
    paints[id] = h
  }
  if (!Object.keys(paints).length) throw new Error('color-scheme livePaint: paints map is empty')
  const allowOrigins = [].concat(lp.allowOrigins || []).map(String)
  for (const o of allowOrigins) if (!ORIGIN.test(o)) throw new Error(`color-scheme livePaint: allowOrigins entry '${o}' must be scheme://host[:port]`)
  const name = (v, d) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v || '')) ? String(v) : d)
  const cookiePath = /^\/[^\s;,]*$/.test(String(lp.cookiePath || '')) ? lp.cookiePath : '/'
  return { param: name(lp.param, 'paint'), cookie: name(lp.cookie, 'cs-paint'), cookiePath, paints, allowOrigins }
}

function headBlock (config) {
  const hook = fs.readFileSync(path.join(ROOT, 'js', 'color-scheme-head.js'), 'utf8').trim()
  const lines = [`<link rel="stylesheet" href="{{{uiRootPath}}}/css/color-scheme.css">`]
  if (config.navbar) lines.push(`<meta name="dm-navbar" content="${String(config.navbar).replace(/"/g, '')}">`)
  lines.push(`<script ${HEAD_MARKER}>\n${hook}\n</script>`)
  const lp = livePaintConfig(config)
  if (lp) {
    const json = JSON.stringify(lp).replace(/</g, '\\u003c').replace(/\{\{/g, '{\\u007b')
    const paintHook = fs.readFileSync(path.join(ROOT, 'js', 'color-scheme-paint-head.js'), 'utf8').trim()
    lines.push(`<script data-color-scheme-live-paint>\nwindow.__colorSchemeLivePaint = Object.assign(${json}, { root: '{{{uiRootPath}}}' });\n${paintHook}\n</script>`)
  }
  return lines.join('\n')
}

/** After the site.css line in head-styles, else at the top of head-meta. */
function injectHead (uiCatalog, config = {}) {
  const partials = uiCatalog.findByType('partial')
  if (partials.some((f) => HEAD_STEMS.includes(f.stem) && bodyOf(f).includes(HEAD_MARKER))) return true
  const block = headBlock(config)
  const styles = partials.find((f) => f.stem === 'head-styles')
  if (styles) {
    const lines = bodyOf(styles).split('\n')
    const idx = lines.findIndex((l) => l.includes('site.css'))
    lines.splice(idx < 0 ? lines.length : idx + 1, 0, block)
    styles.contents = Buffer.from(lines.join('\n'))
    return true
  }
  const meta = partials.find((f) => f.stem === 'head-meta')
  if (!meta) return false
  meta.contents = Buffer.from(`${block}\n${bodyOf(meta)}`)
  return true
}

/** Defer tag after ui-bus.js, else after site.js, else at the end of footer-scripts. */
function injectFooter (uiCatalog, config = {}) {
  const partials = uiCatalog.findByType('partial')
  if (partials.some((f) => FOOT_STEMS.includes(f.stem) && bodyOf(f).includes('js/color-scheme.js'))) return true
  const toggle = config.toggle === 'placed' ? 'placed' : 'auto'
  const tag = `<script src="{{{uiRootPath}}}/js/color-scheme.js" data-color-scheme-toggle="${toggle}" defer></script>`
  for (const anchor of ['ui-bus.js', 'site.js']) {
    for (const stem of FOOT_STEMS) {
      const foot = partials.find((f) => f.stem === stem)
      if (!foot) continue
      const lines = bodyOf(foot).split('\n')
      let idx = -1
      lines.forEach((l, i) => { if (l.includes(anchor)) idx = i })
      if (idx < 0) continue
      lines.splice(idx + 1, 0, tag)
      foot.contents = Buffer.from(lines.join('\n'))
      return true
    }
  }
  const fallback = partials.find((f) => f.stem === 'footer-scripts')
  if (!fallback) return false
  fallback.contents = Buffer.from(`${bodyOf(fallback).trim()}\n${tag}\n`)
  return true
}

function ensureColorScheme (uiCatalog, uiOutputDir, config = {}) {
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'css/color-scheme.css', fs.readFileSync(path.join(ROOT, 'css', 'color-scheme.css')))
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/color-scheme.js', fs.readFileSync(path.join(ROOT, 'js', 'color-scheme.js')))
  return injectHead(uiCatalog, config) && injectFooter(uiCatalog, config)
}

// Antora binds `this` to the generator context and passes ({ config, ... }) only when
// register destructures its single parameter (no default value, or length becomes 0).
function register ({ config }) {
  config = config || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    const ok = ensureColorScheme(uiCatalog, playbook.ui?.outputDir || '_', config)
    if (ok) logger.info('color-scheme: head hook and js/color-scheme.js injected')
    else logger.warn('color-scheme: UI has no head-styles/head-meta or footer-scripts partial; nothing injected')
  })
}

module.exports = register
module.exports.register = register
module.exports.ensureColorScheme = ensureColorScheme
module.exports.injectHead = injectHead
module.exports.injectFooter = injectFooter
module.exports.livePaintConfig = livePaintConfig
