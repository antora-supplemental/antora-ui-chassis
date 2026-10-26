'use strict'

/**
 * @antora-supplemental/color-scheme - Antora extension.
 *
 * The token contract layer, with no colors of its own: links css/color-scheme.css
 * (contract and the CSS color-scheme property) right after the UI's site.css.
 *
 * Schemes: the active paint provides named color schemes, light and dark at
 * least, declared in an @color-schemes manifest comment in its stylesheet
 * (extra schemes are html[data-scheme="<id>"] blocks). When it has more than
 * two, or the site sets slots, this extension inlines the schemes head hook
 * (window.ColorSchemes, html[data-scheme]), loads js/color-scheme.js, and adds
 * the picker page (color-schemes.html in the start page's version, in the
 * site layout) with a footer link. Light/dark
 * switching is @antora-supplemental/light-dark-mode, which requires this package.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/color-scheme'
 *         schemes:              # optional: add or relabel schemes (normally the paint's manifest)
 *           pink: { label: Pink, slots: [light] }
 *         slots: { light: light, dark: dark }   # default slot schemes
 *         slot_policy: declared # or any: a light, dark or both scheme fits either slot (never a none scheme)
 *         picker: auto          # true | false | { enabled, placement: footer|none, label, preview_page }
 *         scheme_param: scheme  # ?scheme=<id>; ?scheme=reset clears
 *         scheme_cookie: cs-scheme
 *         live_paint:           # optional preview/demo feature: swap the whole paint (no picker UI)
 *           enabled: true
 *           param: paint        # ?paint=<id>; ?paint=reset clears
 *           cookie: cs-paint
 *           cookie_path: /
 *           paints:             # the ONLY loadable paints; ids: lowercase letters/digits
 *             default: css/default-paint.css
 *             valentus: https://cdn.example.org/valentus/site-paint.css
 *           allow_origins: [https://registry.antora-supplemental.org]   # postMessage senders
 *
 * Antora camelCases playbook keys (slot_policy -> slotPolicy). Options that
 * moved are rejected so a stale playbook fails loudly: toggle and navbar
 * (0.3.0, to light-dark-mode); live_paint.slots, slot_policy, picker and per-paint
 * slots/base (0.4.0, now top-level and per scheme).
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

/** Validated live-paint config, or null when disabled. Live paint swaps the whole
    paint for previews and demos; it has no slots and no picker UI. Throws on bad
    input so a typo fails the build. */
function livePaintConfig (config = {}) {
  const lp = config.livePaint
  if (!lp || lp.enabled !== true) return null
  for (const key of ['slots', 'slotPolicy', 'picker']) {
    if (lp[key] !== undefined) throw new Error(`color-scheme livePaint.${key} moved in color-scheme 0.4.0: slots, slot_policy and picker are top-level color-scheme options and work on the active paint's schemes`)
  }
  const paints = {}
  const meta = {}
  for (const [id, entry] of Object.entries(lp.paints || {})) {
    if (!PAINT_ID.test(id) || RESERVED.includes(id)) throw new Error(`color-scheme livePaint: invalid paint id '${id}' (lowercase letters and digits, starting with a letter; not ${RESERVED.join('/')})`)
    const e = entry && typeof entry === 'object' ? entry : { href: entry }
    if (e.slots !== undefined || e.base !== undefined) throw new Error(`color-scheme livePaint: paint '${id}' slots/base moved in color-scheme 0.4.0; declare schemes in the paint's @color-schemes manifest`)
    const h = String(e.href || '')
    if (!h || /[\s"'<>`\\]|^(javascript|data):/i.test(h)) throw new Error(`color-scheme livePaint: invalid href for paint '${id}'`)
    paints[id] = h
    meta[id] = { label: e.label === undefined ? id : String(e.label).slice(0, 80) }
  }
  if (!Object.keys(paints).length) throw new Error('color-scheme livePaint: paints map is empty')
  const allowOrigins = [].concat(lp.allowOrigins || []).map(String)
  for (const o of allowOrigins) if (!ORIGIN.test(o)) throw new Error(`color-scheme livePaint: allowOrigins entry '${o}' must be scheme://host[:port]`)
  const name = (v, d) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v || '')) ? String(v) : d)
  const cookiePath = /^\/[^\s;,]*$/.test(String(lp.cookiePath || '')) ? lp.cookiePath : '/'
  return { param: name(lp.param, 'paint'), cookie: name(lp.cookie, 'cs-paint'), cookiePath, paints, meta, allowOrigins }
}

/* Schemes. A paint provides named color schemes: light (its :root block) and
   dark (its html.dark-theme block), plus any html[data-scheme="<id>"] blocks.
   It declares them in a manifest comment in its stylesheet:

     /* @color-schemes
     { "light": { "label": "Light" }, "dark": { "label": "Dark" },
       "pink": { "label": "Pink", "slots": ["light"] } }
     *\/

   Each scheme: label, slots ("light", "dark", "both" or a list of those: the
   light/dark slots it is a candidate for; "none" or [] for a scheme not made
   for the light/dark system) and base (light or dark: the light/dark state it
   is drawn on; defaults to its only slot, else light). Choosing a slot scheme
   puts it in a slot and keeps light/dark automation on; only a "none" scheme
   turns automation off, for the session. The site's color-scheme `schemes` option adds or
   overrides entries (for a paint without a manifest, or to relabel). */
const MANIFEST = /\/\*!?\s*@color-schemes\b([\s\S]*?)\*\//

function parseManifest (css, where = 'stylesheet') {
  const m = MANIFEST.exec(String(css || ''))
  if (!m) return null
  try {
    return JSON.parse(m[1].trim())
  } catch (err) {
    throw new Error(`color-scheme: invalid @color-schemes manifest in ${where}: ${err.message}`)
  }
}

function normalizeScheme (id, e, where) {
  if (!PAINT_ID.test(id) || RESERVED.includes(id)) throw new Error(`color-scheme: invalid scheme id '${id}' in ${where} (lowercase letters and digits, starting with a letter; not ${RESERVED.join('/')})`)
  e = e && typeof e === 'object' ? e : {}
  const implicit = SLOTS.includes(id) ? [id] : SLOTS.slice()
  let slots = e.slots === undefined ? (e.base && !SLOTS.includes(id) ? [e.base] : implicit) : [].concat(e.slots).map(String)
  if (slots.length === 1 && slots[0] === 'both') slots = SLOTS.slice()
  else if (slots.length === 1 && slots[0] === 'none') slots = []
  for (const sl of slots) if (!SLOTS.includes(sl)) throw new Error(`color-scheme: scheme '${id}' in ${where}: slots must be light, dark, both or none, got '${sl}'`)
  if (SLOTS.includes(id) && !slots.includes(id)) throw new Error(`color-scheme: scheme '${id}' in ${where} must fit the ${id} slot`)
  if (e.base !== undefined && !SLOTS.includes(e.base)) throw new Error(`color-scheme: scheme '${id}' in ${where}: base must be light or dark`)
  const base = e.base || (SLOTS.includes(id) ? id : slots.length === 1 ? slots[0] : 'light')
  const label = e.label === undefined ? id.charAt(0).toUpperCase() + id.slice(1) : String(e.label).slice(0, 80)
  return { label, slots: [...new Set(slots)], base }
}

/** Stylesheets linked from the head partials, in order, as UI asset paths. */
function linkedStylesheets (uiCatalog) {
  const text = uiCatalog.findByType('partial').filter((f) => HEAD_STEMS.includes(f.stem)).map(bodyOf).join('\n')
  const out = []
  const re = /<link rel="stylesheet" href="\{\{\{uiRootPath\}\}\}\/([^"{}]+\.css)"/g
  let m
  while ((m = re.exec(text))) out.push(m[1])
  return out
}

/** The active paint's schemes: { id: { label, slots, base } }. The paint is the last
    linked stylesheet with a @color-schemes manifest (paints link after the bundle). */
function paintSchemes (uiCatalog, config = {}) {
  const assets = uiCatalog.findByType('asset')
  let declared = null
  let source = null
  for (const rel of linkedStylesheets(uiCatalog)) {
    const file = assets.find((f) => f.path === rel)
    const manifest = file && parseManifest(bodyOf(file), rel)
    if (manifest) { declared = manifest; source = rel }
  }
  const raw = Object.assign({ light: {}, dark: {} }, declared || {})
  for (const [id, e] of Object.entries(config.schemes || {})) {
    if (e === false || e === null) { delete raw[id]; continue }
    raw[id] = Object.assign({}, raw[id] || {}, e)
  }
  const schemes = {}
  for (const [id, e] of Object.entries(raw)) schemes[id] = normalizeScheme(id, e, source || 'color-scheme schemes')
  for (const sl of SLOTS) if (!schemes[sl]) throw new Error(`color-scheme: the active paint must provide a '${sl}' scheme`)
  return { schemes, source }
}

/** Validated scheme settings (schemes, slots, slot policy, cookie). */
function schemesConfig (schemes, config = {}) {
  const slotPolicy = config.slotPolicy === undefined ? 'declared' : String(config.slotPolicy)
  if (!['declared', 'any'].includes(slotPolicy)) throw new Error(`color-scheme: slot_policy must be declared or any, got '${slotPolicy}'`)
  const slots = { light: 'light', dark: 'dark' }
  for (const sl of SLOTS) {
    const v = config.slots && config.slots[sl]
    if (v === undefined || v === null) continue
    if (!schemes[v]) throw new Error(`color-scheme: slots.${sl} '${v}' is not a scheme of the active paint (${Object.keys(schemes).join(', ')})`)
    if (!schemes[v].slots.length) throw new Error(`color-scheme: scheme '${v}' has slot none (not made for light/dark), so it cannot be the ${sl} slot`)
    if (slotPolicy !== 'any' && !schemes[v].slots.includes(sl)) throw new Error(`color-scheme: scheme '${v}' does not declare the ${sl} slot (declares ${schemes[v].slots.join(', ') || 'none'}); set slot_policy: any to allow it`)
    slots[sl] = v
  }
  const name = (v, d) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v || '')) ? String(v) : d)
  const cookiePath = /^\/[^\s;,]*$/.test(String(config.cookiePath || '')) ? config.cookiePath : '/'
  return { param: name(config.schemeParam, 'scheme'), cookie: name(config.schemeCookie, 'cs-scheme'), cookiePath, schemes, slots, slotPolicy }
}

/** Picker page settings, or null when off. auto (default) turns it on when the active paint has more than two schemes. */
function pickerConfig (config = {}, schemeCount = 2) {
  let p = config.picker
  if (p === undefined || typeof p !== 'object' || p === null) p = { enabled: p === undefined ? 'auto' : p }
  const enabled = p.enabled === undefined ? 'auto' : p.enabled
  if (![true, false, 'auto'].includes(enabled)) throw new Error("color-scheme picker.enabled must be true, false or 'auto'")
  if (enabled === false || (enabled === 'auto' && schemeCount <= 2)) return null
  const placement = p.placement === undefined ? 'footer' : String(p.placement)
  if (!['footer', 'none'].includes(placement)) throw new Error("color-scheme picker.placement must be 'footer' or 'none'")
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
  return injectFooter(uiCatalog)
}

/* Picker page. The footer link is the color-scheme-picker-link partial; it is
   added only when neither the site's supplemental UI nor the layout has one
   (site markup beats layout markup beats this default). placement: footer puts
   {{> color-scheme-picker-link}} in footer-content (before </footer>, else at
   the end) unless a partial already includes it; placement: none leaves
   placing it to the layout. */
const PICKER_PAGE = 'color-schemes.html'

function addPickerLink (uiCatalog, picker, pageUrl) {
  const partials = uiCatalog.findByType('partial')
  if (!partials.some((f) => f.stem === 'color-scheme-picker-link')) {
    const href = pageUrl ? `{{{siteRootPath}}}${pageUrl}` : `{{{uiRootPath}}}/${PICKER_PAGE}`
    const body = `<a class="color-scheme-picker-link" href="${href}">${picker.label}</a>\n`
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
  const re = /<link rel="stylesheet" href="\{\{\{uiRootPath\}\}\}\/[^"{}]+"[^>{}]*>|<meta name="(?:dm-navbar|light-dark-mode-follow-system)"[^>]*>|<script data-(?:color-scheme-live-paint|color-scheme-schemes|light-dark-mode-head)>[\s\S]*?<\/script>/g
  return (text.match(re) || []).map((m) => m.split('{{{uiRootPath}}}').join('.')).join('\n')
}

function pickerScripts (uiCatalog) {
  const text = uiCatalog.findByType('partial').filter((f) => FOOT_STEMS.includes(f.stem)).map(bodyOf).join('\n')
  const re = /<script src="\{\{\{uiRootPath\}\}\}\/js\/(?:ui-bus|color-scheme|light-dark-mode)\.js"[^>{}]*><\/script>/g
  return (text.match(re) || []).map((m) => m.split('{{{uiRootPath}}}').join('.')).join('\n')
}

const INTRO = "These are the color schemes this site's paint provides. Light and dark mode switch between the scheme in the light slot and the scheme in the dark slot. Choosing a light or dark scheme puts it in its slot and keeps automatic light/dark on. Schemes not made for light/dark can be used for this visit only, which turns automatic light/dark off until you pick Automatic or a slot scheme."

/** The picker body: shared by the in-layout page and the standalone fallback. */
function pickerBody (uiCatalog, previewHref, heading, standalone) {
  /* In the site layout the UI's own light/dark toggle (navbar or footer) is on the page. */
  const ldm = standalone && uiCatalog.findByType('partial').some((f) => bodyOf(f).includes('js/light-dark-mode.js'))
  return `<div class="cs-picker">
${heading}
<p>${INTRO}</p>
<div class="cs-picker-top">
${ldm ? '<div data-light-dark-mode-switch class="light-dark-switch"></div>' : ''}
<button type="button" id="cs-picker-reset" class="cs-picker-button">Automatic, site defaults</button>
<a class="cs-picker-back" href="${esc(previewHref)}">Back to the docs</a>
</div>
<div id="cs-picker-banner" class="cs-picker-banner" role="status" hidden></div>
<ul id="cs-picker-list" class="cs-picker-list" data-preview="${esc(previewHref)}"></ul>
</div>`
}

function pickerHtml (uiCatalog, picker, previewHref, siteTitle) {
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
<main>
${pickerBody(uiCatalog, previewHref, `<h1>${esc(picker.label)}</h1>`, true)}
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

function addPickerAssets (uiCatalog, uiOutputDir) {
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/color-scheme-picker.js', fs.readFileSync(path.join(ROOT, 'js', 'color-scheme-picker.js')))
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'css/color-scheme-picker.css', fs.readFileSync(path.join(ROOT, 'css', 'color-scheme-picker.css')))
}

/** Standalone fallback (no content catalog page possible): _/color-schemes.html. */
function addPickerPage (uiCatalog, uiOutputDir, picker, startUrl, siteTitle) {
  const href = previewHrefOf(uiOutputDir, picker.previewPage ? '/' + picker.previewPage : startUrl)
  addPickerAssets(uiCatalog, uiOutputDir)
  addOrReplaceAsset(uiCatalog, uiOutputDir, PICKER_PAGE, Buffer.from(pickerHtml(uiCatalog, picker, href, siteTitle)))
  return href
}

/** The picker as a site page in the start page's component version, so the UI's
    default layout (header, nav, footer, paint) wraps it. Returns its URL, or null
    when it cannot be added (no start page, or a page of that name exists). */
function addPickerSitePage (uiCatalog, contentCatalog, uiOutputDir, picker, start) {
  if (!contentCatalog || typeof contentCatalog.addFile !== 'function' || !start || !start.src) return null
  const { component, version } = start.src
  const relative = PICKER_PAGE.replace(/\.html$/, '.adoc')
  if (contentCatalog.getById && contentCatalog.getById({ component, version, module: 'ROOT', family: 'page', relative })) return null
  const file = contentCatalog.addFile({
    contents: Buffer.alloc(0),
    mediaType: 'text/html',
    src: { component, version, module: 'ROOT', family: 'page', relative, mediaType: 'text/asciidoc' },
  })
  if (!file || !file.pub || !file.pub.url) return null
  const dir = path.posix.dirname(file.pub.url)
  const rel = (to) => path.posix.relative(dir, to) || '.'
  const ui = rel('/' + String(uiOutputDir || '_').replace(/^\/+|\/+$/g, ''))
  const previewHref = rel(picker.previewPage ? '/' + picker.previewPage : start.pub.url)
  file.mediaType = 'text/html'
  file.asciidoc = { doctitle: picker.label, attributes: { 'page-role': 'cs-picker-page', doctitle: picker.label } }
  file.title = picker.label
  addPickerAssets(uiCatalog, uiOutputDir)
  file.contents = Buffer.from(`<link rel="stylesheet" href="${ui}/css/color-scheme-picker.css">
${pickerBody(uiCatalog, previewHref, '', false)}
<script src="${ui}/js/color-scheme-picker.js" defer></script>
`)
  return file.pub.url
}

const SCHEMES_MARKER = 'data-color-scheme-schemes'

/** Inline the schemes head hook before the light/dark head hook (that hook reads
    the pinned scheme), else right after css/color-scheme.css. */
function injectSchemesHead (uiCatalog, cfg) {
  const partials = uiCatalog.findByType('partial').filter((f) => HEAD_STEMS.includes(f.stem))
  if (partials.some((f) => bodyOf(f).includes(SCHEMES_MARKER))) return true
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c').replace(/\{\{/g, '{\\u007b')
  const hook = fs.readFileSync(path.join(ROOT, 'js', 'color-scheme-schemes-head.js'), 'utf8').trim()
  const block = `<script ${SCHEMES_MARKER}>\nwindow.__colorSchemes = ${json};\n${hook}\n</script>`
  for (const [needle, before] of [['<script data-light-dark-mode-head>', true], [HEAD_MARKER, false]]) {
    const file = partials.find((f) => bodyOf(f).includes(needle))
    if (!file) continue
    const lines = bodyOf(file).split('\n')
    const idx = lines.findIndex((l) => l.includes(needle))
    lines.splice(before ? idx : idx + 1, 0, block)
    file.contents = Buffer.from(lines.join('\n'))
    return true
  }
  return false
}

/** contentClassified listener, after every uiLoaded listener (light-dark-mode, paints)
    has run: reads the active paint's schemes and, when it has more than light and
    dark (or the site sets slots), adds the schemes hook, the runtime and the picker.
    Layers that call ensureColorScheme register it too; it runs once. */
function schemesListener (config, logger) {
  return ({ playbook, contentCatalog, uiCatalog }) => {
    if (config.enabled === false) return
    const partials = uiCatalog.findByType('partial')
    if (!partials.some((f) => HEAD_STEMS.includes(f.stem) && bodyOf(f).includes(HEAD_MARKER))) return
    if (partials.some((f) => HEAD_STEMS.includes(f.stem) && bodyOf(f).includes(SCHEMES_MARKER))) return
    const { schemes, source } = paintSchemes(uiCatalog, config)
    const cfg = schemesConfig(schemes, config)
    const count = Object.keys(schemes).length
    const custom = cfg.slots.light !== 'light' || cfg.slots.dark !== 'dark'
    const picker = pickerConfig(config, count)
    if (count <= 2 && !custom && !picker) return
    const outDir = playbook.ui?.outputDir || '_'
    injectSchemesHead(uiCatalog, cfg)
    addOrReplaceAsset(uiCatalog, outDir, 'js/color-scheme.js', fs.readFileSync(path.join(ROOT, 'js', 'color-scheme.js')))
    injectRuntimeBeforeLightDark(uiCatalog)
    if (logger) logger.info(`color-scheme: ${count} schemes (${Object.keys(schemes).join(', ')}) from ${source || 'defaults'}`)
    if (!picker) return
    const start = contentCatalog.getSiteStartPage && contentCatalog.getSiteStartPage()
    const startUrl = (start && start.pub && start.pub.url) || '/'
    const pageUrl = addPickerSitePage(uiCatalog, contentCatalog, outDir, picker, start)
    if (!pageUrl) addPickerPage(uiCatalog, outDir, picker, startUrl, playbook.site?.title)
    addPickerLink(uiCatalog, picker, pageUrl)
    if (logger) logger.info(`color-scheme: picker page ${pageUrl || PICKER_PAGE} added${pageUrl ? ' (site layout)' : ''}`)
  }
}
const pickerListener = schemesListener

/** js/color-scheme.js before js/light-dark-mode.js when that is already in the footer, else as injectFooter. */
function injectRuntimeBeforeLightDark (uiCatalog) {
  const partials = uiCatalog.findByType('partial').filter((f) => FOOT_STEMS.includes(f.stem))
  if (partials.some((f) => bodyOf(f).includes('js/color-scheme.js'))) return true
  const foot = partials.find((f) => bodyOf(f).includes('js/light-dark-mode.js'))
  if (!foot) return injectFooter(uiCatalog)
  const lines = bodyOf(foot).split('\n')
  lines.splice(lines.findIndex((l) => l.includes('js/light-dark-mode.js')), 0, '<script src="{{{uiRootPath}}}/js/color-scheme.js" defer></script>')
  foot.contents = Buffer.from(lines.join('\n'))
  return true
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
module.exports.schemesListener = schemesListener
module.exports.paintSchemes = paintSchemes
module.exports.parseManifest = parseManifest
module.exports.schemesConfig = schemesConfig
module.exports.addPickerPage = addPickerPage
module.exports.addPickerSitePage = addPickerSitePage
module.exports.previewHrefOf = previewHrefOf
module.exports.PICKER_PAGE = PICKER_PAGE
module.exports.addOrReplaceAsset = addOrReplaceAsset
module.exports.insertFooterTag = insertFooterTag
module.exports.bodyOf = bodyOf
module.exports.HEAD_STEMS = HEAD_STEMS
module.exports.FOOT_STEMS = FOOT_STEMS
