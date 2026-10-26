'use strict'

/**
 * @antora-supplemental/light-dark-mode - Antora extension.
 *
 * Light/dark switching on top of @antora-supplemental/color-scheme (the token
 * contract). Ensures color-scheme is applied first, then inlines the no-flash
 * head hook right after css/color-scheme.css, links css/light-dark-mode.css
 * (switch transition) and loads js/light-dark-mode.js (saved choice, system
 * preference, toggle binding) after color-scheme.js / UiBus / site.js.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/light-dark-mode'
 *         toggle: auto         # auto (default): create #theme-toggle in .navbar-end if the layout placed none
 *                              # placed: only bind a #theme-toggle the layout placed
 *         toggle_placement: navbar   # navbar (default): compact icon button in .navbar-end
 *                                    # footer: Light / Dark / Auto icon switch in the footer
 *         labels:              # optional i18n strings for the footer switch (aria-label + title)
 *           light: Light       #   sun button
 *           dark: Dark         #   moon button
 *           auto: Auto         #   half-filled circle button (follow the system)
 *           group: Theme       #   accessible name of the button group
 *         follow_system: true  # default; false: default to light, never read the OS preference
 *         navbar: light        # optional: <meta name="dm-navbar"> value, exposed as html[data-dm-navbar] for paint
 *         color_scheme:        # optional: options passed to color-scheme (schemes, slots, picker, live_paint)
 *           slots: { ... }
 *
 * List color-scheme separately instead of color_scheme when you prefer; it runs
 * once either way. Antora camelCases keys (follow_system -> followSystem,
 * color_scheme -> colorScheme).
 */

const fs = require('node:fs')
const path = require('node:path')
const colorScheme = require('./color-scheme.js')

const PACKAGE_ID = '@antora-supplemental/light-dark-mode'
const ROOT = path.join(__dirname, '..')
const HEAD_MARKER = 'data-light-dark-mode-head'
const { bodyOf, addOrReplaceAsset, insertFooterTag, HEAD_STEMS, FOOT_STEMS } = colorScheme

function followsSystem (config) {
  const v = config.followSystem
  return !(v === false || v === 'false' || v === 'off')
}

const DEFAULT_LABELS = { light: 'Light', dark: 'Dark', auto: 'Auto', group: 'Theme' }

/** Footer switch strings: defaults overridden key by key from the labels option. */
function labelsOf (config) {
  const given = config.labels && typeof config.labels === 'object' ? config.labels : {}
  const out = { ...DEFAULT_LABELS }
  for (const k of Object.keys(DEFAULT_LABELS)) {
    if (given[k] !== undefined && given[k] !== null && String(given[k]).trim()) out[k] = String(given[k])
  }
  return out
}

function attrJson (value) {
  return JSON.stringify(value).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function placementOf (config) {
  const v = config.togglePlacement === undefined ? 'navbar' : String(config.togglePlacement)
  if (!['navbar', 'footer'].includes(v)) throw new Error(`light-dark-mode: toggle_placement must be navbar or footer, got '${v}'`)
  return v
}

/* Partials. Layouts include the two slots where each variant may go:
     {{> light-dark-navbar-slot}}  in the header, inline with its icon buttons
     {{> light-dark-footer-slot}}  in the footer
   and the slot named by toggle_placement renders its variant, the other one
   renders nothing. The variants themselves are the light-dark-toggle (navbar
   icon button) and light-dark-switch (footer Light / Dark / Auto icons) partials.
   Every partial here is added only when neither the site's supplemental UI
   nor the layout already has one with that name, so a direct UI override
   beats the theme or layout, which beats these chassis defaults. Without
   slots in the layout, the runtime creates the variant itself
   (toggle: auto). */
const VARIANTS = {
  'light-dark-toggle': '<button type="button" id="theme-toggle" class="navbar-item theme-toggle theme-toggle--navbar" aria-label="Switch light or dark mode"></button>\n',
  'light-dark-switch': '<div class="light-dark-switch light-dark-switch--footer" data-light-dark-mode-switch></div>\n',
}

function partialsFor (config) {
  const where = placementOf(config)
  return {
    ...VARIANTS,
    'light-dark-navbar-slot': where === 'navbar' ? '{{> light-dark-toggle}}\n' : '',
    'light-dark-footer-slot': where === 'footer' ? '{{> light-dark-switch}}\n' : '',
  }
}

function addPartials (uiCatalog, config) {
  const have = new Set(uiCatalog.findByType('partial').map((f) => f.stem))
  for (const [stem, body] of Object.entries(partialsFor(config))) {
    if (have.has(stem)) continue
    uiCatalog.addFile({ type: 'partial', stem, path: `partials/${stem}.hbs`, contents: Buffer.from(body) })
  }
}

function headBlock (config) {
  const hook = fs.readFileSync(path.join(ROOT, 'js', 'light-dark-mode-head.js'), 'utf8').trim()
  const lines = [`<link rel="stylesheet" href="{{{uiRootPath}}}/css/light-dark-mode.css">`]
  if (config.navbar) lines.push(`<meta name="dm-navbar" content="${String(config.navbar).replace(/"/g, '')}">`)
  if (!followsSystem(config)) lines.push('<meta name="light-dark-mode-follow-system" content="off">')
  lines.push(`<script ${HEAD_MARKER}>\n${hook}\n</script>`)
  return lines.join('\n')
}

/** Right after the color-scheme stylesheet, else after site.css in head-styles, else at the top of head-meta. */
function injectHead (uiCatalog, config = {}) {
  const partials = uiCatalog.findByType('partial')
  const heads = partials.filter((f) => HEAD_STEMS.includes(f.stem))
  if (heads.some((f) => bodyOf(f).includes(HEAD_MARKER))) return true
  const block = headBlock(config)
  for (const anchor of ['data-color-scheme-live-paint', 'css/color-scheme.css', 'site.css']) {
    for (const f of heads) {
      const lines = bodyOf(f).split('\n')
      let idx = lines.findIndex((l) => l.includes(anchor))
      if (idx < 0) continue
      // After the live-paint script so the hook can hand it the resolved scheme.
      if (anchor === 'data-color-scheme-live-paint') while (idx < lines.length - 1 && !lines[idx].includes('</script>')) idx++
      lines.splice(idx + 1, 0, block)
      f.contents = Buffer.from(lines.join('\n'))
      return true
    }
  }
  const meta = partials.find((f) => f.stem === 'head-meta')
  if (!meta) return false
  meta.contents = Buffer.from(`${block}\n${bodyOf(meta)}`)
  return true
}

/** Defer tag after color-scheme.js, else ui-bus.js, else site.js, else at the end of footer-scripts. */
function injectFooter (uiCatalog, config = {}) {
  const partials = uiCatalog.findByType('partial')
  if (partials.some((f) => FOOT_STEMS.includes(f.stem) && bodyOf(f).includes('js/light-dark-mode.js'))) return true
  const toggle = config.toggle === 'placed' ? 'placed' : 'auto'
  const where = placementOf(config)
  const tag = `<script src="{{{uiRootPath}}}/js/light-dark-mode.js" data-light-dark-mode-toggle="${toggle}" data-light-dark-mode-placement="${where}" data-light-dark-mode-labels='${attrJson(labelsOf(config))}' defer></script>`
  return insertFooterTag(uiCatalog, tag, ['js/color-scheme.js', 'ui-bus.js', 'site.js'])
}

function ensureLightDarkMode (uiCatalog, uiOutputDir, config = {}) {
  if (!colorScheme.ensureColorScheme(uiCatalog, uiOutputDir, config.colorScheme || {})) return false
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'css/light-dark-mode.css', fs.readFileSync(path.join(ROOT, 'css', 'light-dark-mode.css')))
  addOrReplaceAsset(uiCatalog, uiOutputDir, 'js/light-dark-mode.js', fs.readFileSync(path.join(ROOT, 'js', 'light-dark-mode.js')))
  addPartials(uiCatalog, config)
  return injectHead(uiCatalog, config) && injectFooter(uiCatalog, config)
}

// Antora binds `this` to the generator context and passes ({ config, ... }) only when
// register destructures its single parameter.
function register ({ config }) {
  config = config || {}
  const logger = this.getLogger(PACKAGE_ID)
  this.on('uiLoaded', ({ playbook, uiCatalog }) => {
    if (config.enabled === false) return
    const ok = ensureLightDarkMode(uiCatalog, playbook.ui?.outputDir || '_', config)
    if (ok) logger.info('light-dark-mode: head hook and js/light-dark-mode.js injected')
    else logger.warn('light-dark-mode: UI has no head-styles/head-meta or footer-scripts partial; nothing injected')
  })
  // color-scheme schemes, slots and picker page, same as registering color-scheme itself.
  const cs = config.colorScheme || {}
  this.on('contentClassified', (ctx) => { if (config.enabled !== false) colorScheme.pickerListener(cs, logger)(ctx) })
}

module.exports = register
module.exports.register = register
module.exports.ensureLightDarkMode = ensureLightDarkMode
module.exports.injectHead = injectHead
module.exports.injectFooter = injectFooter
module.exports.followsSystem = followsSystem
module.exports.partialsFor = partialsFor
module.exports.labelsOf = labelsOf
