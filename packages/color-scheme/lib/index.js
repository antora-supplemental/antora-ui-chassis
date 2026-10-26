'use strict'

/**
 * @antora-supplemental/color-scheme - Antora extension.
 *
 * The token contract layer, with no colors and no switching: links
 * css/color-scheme.css (contract and the CSS color-scheme property) right after
 * the UI's site.css. With live_paint enabled it also inlines the paint head hook
 * and loads js/color-scheme.js (ColorScheme.setPaint and the postMessage bridge).
 * Light/dark switching is @antora-supplemental/light-dark-mode, which requires
 * this package.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/color-scheme'
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
 * arrive as livePaint / cookiePath / allowOrigins. The 0.2 options toggle and
 * navbar moved to light-dark-mode; they are rejected here so a stale playbook
 * fails loudly.
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

const SLOTS = ['light', 'dark']
const RESERVED = ['reset', 'auto', 'builtin']

/** Validated live-paint config, or null when disabled. Throws on bad input so a typo fails the build. */
function livePaintConfig (config = {}) {
  const lp = config.livePaint
  if (!lp || lp.enabled !== true) return null
  const paints = {}
  const meta = {}
  for (const [id, entry] of Object.entries(lp.paints || {})) {
    if (!PAINT_ID.test(id) || RESERVED.includes(id)) throw new Error(`color-scheme livePaint: invalid paint id '${id}' (lowercase letters and digits, starting with a letter; not ${RESERVED.join('/')})`)
    const e = entry && typeof entry === 'object' ? entry : { href: entry }
    const h = String(e.href || '')
    if (!h || /[\s"'<>`\\]|^(javascript|data):/i.test(h)) throw new Error(`color-scheme livePaint: invalid href for paint '${id}'`)
    paints[id] = h
    const slots = e.slots === undefined ? SLOTS.slice() : [].concat(e.slots).map(String)
    for (const sl of slots) if (!SLOTS.includes(sl)) throw new Error(`color-scheme livePaint: paint '${id}' slots must be light and/or dark, got '${sl}'`)
    if (e.base !== undefined && !SLOTS.includes(e.base)) throw new Error(`color-scheme livePaint: paint '${id}' base must be light or dark`)
    const label = e.label === undefined ? id : String(e.label).slice(0, 80)
    meta[id] = { label, slots: [...new Set(slots)], base: e.base || (slots.length === 1 ? slots[0] : 'light') }
  }
  if (!Object.keys(paints).length) throw new Error('color-scheme livePaint: paints map is empty')
  const slotPolicy = lp.slotPolicy === undefined ? 'declared' : String(lp.slotPolicy)
  if (!['declared', 'any'].includes(slotPolicy)) throw new Error(`color-scheme livePaint: slot_policy must be declared or any, got '${slotPolicy}'`)
  const slots = { light: null, dark: null }
  for (const sl of SLOTS) {
    const v = lp.slots && lp.slots[sl]
    if (v === undefined || v === null || v === 'builtin') continue
    if (!paints[v]) throw new Error(`color-scheme livePaint: slots.${sl} '${v}' is not in paints`)
    if (slotPolicy !== 'any' && !meta[v].slots.includes(sl)) throw new Error(`color-scheme livePaint: paint '${v}' does not declare the ${sl} slot (declares ${meta[v].slots.join(', ') || 'none'}); set slot_policy: any to allow it`)
    slots[sl] = v
  }
  const allowOrigins = [].concat(lp.allowOrigins || []).map(String)
  for (const o of allowOrigins) if (!ORIGIN.test(o)) throw new Error(`color-scheme livePaint: allowOrigins entry '${o}' must be scheme://host[:port]`)
  const name = (v, d) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v || '')) ? String(v) : d)
  const cookiePath = /^\/[^\s;,]*$/.test(String(lp.cookiePath || '')) ? lp.cookiePath : '/'
  return { param: name(lp.param, 'paint'), cookie: name(lp.cookie, 'cs-paint'), cookiePath, paints, meta, slots, slotPolicy, allowOrigins }
}

/** Picker page settings, or null when off. auto (default) turns it on when the paints map has more than two schemes. */
function pickerConfig (config = {}) {
  const lp = livePaintConfig(config)
  if (!lp) return null
  let p = config.livePaint.picker
  if (p === undefined || typeof p !== 'object' || p === null) p = { enabled: p === undefined ? 'auto' : p }
  const enabled = p.enabled === undefined ? 'auto' : p.enabled
  if (![true, false, 'auto'].includes(enabled)) throw new Error("color-scheme livePaint.picker.enabled must be true, false or 'auto'")
  if (enabled === false || (enabled === 'auto' && Object.keys(lp.paints).length <= 2)) return null
  const placement = p.placement === undefined ? 'footer' : String(p.placement)
  if (!['footer', 'none'].includes(placement)) throw new Error("color-scheme livePaint.picker.placement must be 'footer' or 'none'")
  const label = p.label === undefined ? 'Color schemes' : String(p.label).replace(/[<>&"]/g, '').slice(0, 60)
  return { placement, label, previewPage: p.previewPage ? String(p.previewPage).replace(/^\/+/, '') : null }
}

function headBlock (config) {
  const lines = [`<link rel="stylesheet" href="{{{uiRootPath}}}/css/color-scheme.css" ${HEAD_MARKER}>`]
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

/** Insert tag after the last line containing one of anchors (first anchor wins), else at the end of footer-scripts. */
function insertFooterTag (uiCatalog, tag, anchors) {
  const partials = uiCatalog.findByType('partial')
  for (const anchor of anchors) {
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

/** Live paint only: defer tag after ui-bus.js, else after site.js, else at the end of footer-scripts. */
function injectFooter (uiCatalog) {
  const partials = uiCatalog.findByType('partial')
  if (partials.some((f) => FOOT_STEMS.includes(f.stem) && bodyOf(f).includes('js/color-scheme.js'))) return true
  return insertFooterTag(uiCatalog, '<script src="{{{uiRootPath}}}/js/color-scheme.js" defer></script>', ['ui-bus.js', 'site.js'])
}

function rejectMovedOptions (config) {
  for (const key of ['toggle', 'navbar']) {
    if (config[key] !== undefined) throw new Error(`color-scheme: option '${key}' moved to @antora-supplemental/light-dark-mode in color-scheme 0.3.0`)
  }
}

function ensureColorScheme (uiCatalog, uiOutputDir, config = {}) {
  rejectMovedOptions(config)
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'css/color-scheme.css', fs.readFileSync(path.join(ROOT, 'css', 'color-scheme.css')))
  if (!injectHead(uiCatalog, config)) return false
  if (!livePaintConfig(config)) return true
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/color-scheme.js', fs.readFileSync(path.join(ROOT, 'js', 'color-scheme.js')))
  const picker = pickerConfig(config)
  if (picker) addPickerLink(uiCatalog, picker)
  return injectFooter(uiCatalog)
}

/* Picker page. The footer link is the color-scheme-picker-link partial; it is
   added only when neither the site's supplemental UI nor the layout has one
   (site markup beats layout markup beats this default). placement: footer puts
   {{> color-scheme-picker-link}} in footer-content (before </footer>, else at
   the end) unless a partial already includes it; placement: none leaves
   placing it to the layout. */
const PICKER_PAGE = 'color-schemes.html'

function addPickerLink (uiCatalog, picker) {
  const partials = uiCatalog.findByType('partial')
  if (!partials.some((f) => f.stem === 'color-scheme-picker-link')) {
    const body = `<a class="color-scheme-picker-link" href="{{{uiRootPath}}}/${PICKER_PAGE}">${picker.label}</a>\n`
    uiCatalog.addFile({ type: 'partial', stem: 'color-scheme-picker-link', path: 'partials/color-scheme-picker-link.hbs', contents: Buffer.from(body) })
  }
  if (picker.placement !== 'footer') return true
  if (partials.some((f) => /\{\{>\s*color-scheme-picker-link\b/.test(bodyOf(f)))) return true
  const foot = partials.find((f) => f.stem === 'footer-content')
  if (!foot) return false
  const body = bodyOf(foot)
  const i = body.lastIndexOf('</footer>')
  const tag = '{{> color-scheme-picker-link}}'
  foot.contents = Buffer.from(i < 0 ? `${body.trimEnd()}\n${tag}\n` : `${body.slice(0, i)}${tag}\n${body.slice(i)}`)
  return true
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The picker page head: the UI's own stylesheets plus the color-scheme and light/dark hooks, with uiRootPath = '.'. */
function pickerHead (uiCatalog) {
  const text = uiCatalog.findByType('partial').filter((f) => HEAD_STEMS.includes(f.stem)).map(bodyOf).join('\n')
  const re = /<link rel="stylesheet" href="\{\{\{uiRootPath\}\}\}\/[^"{}]+"[^>{}]*>|<meta name="(?:dm-navbar|light-dark-mode-follow-system)"[^>]*>|<script data-(?:color-scheme-live-paint|light-dark-mode-head)>[\s\S]*?<\/script>/g
  return (text.match(re) || []).map((m) => m.split('{{{uiRootPath}}}').join('.')).join('\n')
}

function pickerScripts (uiCatalog) {
  const text = uiCatalog.findByType('partial').filter((f) => FOOT_STEMS.includes(f.stem)).map(bodyOf).join('\n')
  const re = /<script src="\{\{\{uiRootPath\}\}\}\/js\/(?:ui-bus|color-scheme|light-dark-mode)\.js"[^>{}]*><\/script>/g
  return (text.match(re) || []).map((m) => m.split('{{{uiRootPath}}}').join('.')).join('\n')
}

function pickerHtml (uiCatalog, picker, previewHref, siteTitle) {
  const ldm = uiCatalog.findByType('partial').some((f) => bodyOf(f).includes('js/light-dark-mode.js'))
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(picker.label)}${siteTitle ? ' | ' + esc(siteTitle) : ''}</title>
${pickerHead(uiCatalog)}
<link rel="stylesheet" href="./css/color-scheme-picker.css">
</head>
<body class="cs-picker-page">
<main class="cs-picker">
<p><a href="${esc(previewHref)}">Back to the docs</a></p>
<h1>${esc(picker.label)}</h1>
<p>Light and dark mode switch between a light scheme and a dark scheme. Put a scheme in the light or dark slot to use it with automatic light/dark. Picking a scheme for this visit only turns automatic light/dark off until you pick Automatic or a slot scheme.</p>
<div class="cs-picker-top">
${ldm ? '<div data-light-dark-mode-switch class="light-dark-switch"></div>' : ''}
<button type="button" id="cs-picker-reset">Automatic, site defaults</button>
</div>
<div id="cs-picker-banner" class="cs-picker-banner" role="status" hidden></div>
<ul id="cs-picker-list" class="cs-picker-list" data-preview="${esc(previewHref)}"></ul>
</main>
${pickerScripts(uiCatalog)}
<script src="./js/color-scheme-picker.js" defer></script>
</body>
</html>
`
}

/** Relative href from the UI output dir to a site URL (start page by default). */
function previewHrefOf (uiOutputDir, url) {
  const from = '/' + String(uiOutputDir || '_').replace(/^\/+|\/+$/g, '') + '/'
  const rel = path.posix.relative(from, url || '/')
  return (rel || '.') + (String(url || '/').endsWith('/') && rel ? '/' : '')
}

function addPickerPage (uiCatalog, uiOutputDir, picker, startUrl, siteTitle) {
  const href = previewHrefOf(uiOutputDir, picker.previewPage ? '/' + picker.previewPage : startUrl)
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/color-scheme-picker.js', fs.readFileSync(path.join(ROOT, 'js', 'color-scheme-picker.js')))
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'css/color-scheme-picker.css', fs.readFileSync(path.join(ROOT, 'css', 'color-scheme-picker.css')))
  addOrReplaceAsset(uiCatalog, uiOutputDir, PICKER_PAGE, Buffer.from(pickerHtml(uiCatalog, picker, href, siteTitle)))
  return href
}

/** contentClassified listener that builds the picker page, after every uiLoaded listener (light-dark-mode, paint) has run. Layers that call ensureColorScheme register it too. */
function pickerListener (config, logger) {
  return ({ playbook, contentCatalog, uiCatalog }) => {
    if (config.enabled === false) return
    const picker = pickerConfig(config)
    if (!picker) return
    const start = contentCatalog.getSiteStartPage && contentCatalog.getSiteStartPage()
    const startUrl = (start && start.pub && start.pub.url) || '/'
    addPickerPage(uiCatalog, playbook.ui?.outputDir || '_', picker, startUrl, playbook.site?.title)
    if (logger) logger.info(`color-scheme: picker page ${PICKER_PAGE} added`)
  }
}

// Antora binds `this` to the generator context and passes ({ config, ... }) only when
// register destructures its single parameter (no default value, or length becomes 0).
function register ({ config }) {
  config = config || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    const ok = ensureColorScheme(uiCatalog, playbook.ui?.outputDir || '_', config)
    if (ok) logger.info('color-scheme: token contract stylesheet injected')
    else logger.warn('color-scheme: UI has no head-styles/head-meta or footer-scripts partial; nothing injected')
  })
  this.on('contentClassified', pickerListener(config, logger))
}

module.exports = register
module.exports.register = register
module.exports.ensureColorScheme = ensureColorScheme
module.exports.injectHead = injectHead
module.exports.injectFooter = injectFooter
module.exports.livePaintConfig = livePaintConfig
module.exports.pickerConfig = pickerConfig
module.exports.pickerListener = pickerListener
module.exports.addPickerPage = addPickerPage
module.exports.previewHrefOf = previewHrefOf
module.exports.PICKER_PAGE = PICKER_PAGE
module.exports.addOrReplaceAsset = addOrReplaceAsset
module.exports.insertFooterTag = insertFooterTag
module.exports.bodyOf = bodyOf
module.exports.HEAD_STEMS = HEAD_STEMS
module.exports.FOOT_STEMS = FOOT_STEMS
