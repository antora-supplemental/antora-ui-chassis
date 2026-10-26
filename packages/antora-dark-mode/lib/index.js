'use strict'

/**
 * antora-dark-mode 2.x - dark mode for Antora 3, powered by antora-ui-chassis.
 *
 * A relabel: it registers three chassis extensions and passes options through.
 * It has no CSS or JS of its own.
 *
 *   @antora-supplemental/color-scheme     token contract (and optional live paint)
 *   @antora-supplemental/light-dark-mode  no-flash head hook, saved choice, system
 *                                         preference, toggle (navbar or footer)
 *   @antora-supplemental/default-paint    light and dark palette for the Default UI
 *
 *   antora:
 *     extensions:
 *       - require: antora-dark-mode
 *         navbar: dark            # dm-navbar: dark (default) | light | match
 *         toggle: auto            # auto | placed
 *         toggle_placement: navbar  # navbar | footer
 *         follow_system: true
 *         paint: true             # false: bring your own paint
 *         color_scheme: {}        # passed to color-scheme (live_paint, ...)
 *
 * site.keys.dark_mode_navbar (antora-dark-mode 1.x) still sets navbar when the
 * navbar option is not given.
 */

function load (name, sibling) {
  try {
    return require(name)
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err
    return require(sibling)
  }
}

const lightDarkMode = load('@antora-supplemental/light-dark-mode', '../../light-dark-mode/lib/index.js')
const defaultPaint = load('@antora-supplemental/default-paint', '../../default-paint/lib/index.js')

const PASS = ['toggle', 'togglePlacement', 'followSystem', 'colorScheme', 'enabled']

/** antora-dark-mode options -> light-dark-mode options (site keys read at uiLoaded). */
function mapOptions (config = {}, siteKeys = {}) {
  const out = {}
  for (const k of PASS) if (config[k] !== undefined) out[k] = config[k]
  const navbar = config.navbar !== undefined ? config.navbar : (siteKeys.dark_mode_navbar ?? siteKeys.darkModeNavbar)
  out.navbar = navbar === undefined ? 'dark' : navbar
  return out
}

function register ({ config }) {
  config = config || {}
  const ldm = {}
  // Runs before the delegated uiLoaded listeners (Antora calls them in registration order).
  this.on('uiLoaded', ({ playbook }) => {
    Object.assign(ldm, mapOptions(config, (playbook.site && playbook.site.keys) || {}))
  })
  lightDarkMode.register.call(this, { config: ldm })
  if (config.paint !== false) defaultPaint.register.call(this, { config: { enabled: config.enabled } })
}

module.exports = register
module.exports.register = register
module.exports.mapOptions = mapOptions
