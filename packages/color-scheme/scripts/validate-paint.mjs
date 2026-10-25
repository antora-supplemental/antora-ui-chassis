#!/usr/bin/env node
// Paint-selector allowlist validator (for the extensions registry and paint CI).
//
//   node validate-paint.mjs <paint.css> [--extra=.valentus-,.cards] [--strict] [--json]
//
// A paint layer may only style shared, layout-neutral hooks:
//   * token blocks on :root / html / html.dark-theme / html[data-theme=...]
//   * Antora Default UI chrome classes, Asciidoctor content classes, highlight.js
//     token classes, and the chassis toggle hooks (.theme-toggle, .theme-icon)
//   * class prefixes the paint declares for the layout it targets (--extra,
//     from the manifest's paint.extraSelectors), e.g. Valentus Paint targets .valentus-
// Also rejected: @import and external url(). Hex/rgb/hsl colors outside token
// blocks are warnings (errors with --strict): rules should read var(--cs-*) or
// paint-local tokens so schemes switch. Black-alpha rgba() shadows are exempt.
// Exit 0 = ok, 1 = violations, 2 = usage.
import { readFileSync } from 'node:fs'

export const ALLOWED_CLASS_PREFIXES = [
  // chassis
  'dark-theme', 'theme-toggle', 'theme-icon', 'color-scheme',
  // Antora Default UI
  'navbar', 'nav', 'toolbar', 'home-link', 'edit-this-page', 'breadcrumbs', 'page-versions', 'version', 'versions',
  'component', 'components', 'context', 'toc', 'footer', 'search-', 'is-', 'menu', 'submenu', 'caret', 'button', 'btn',
  'explore', 'body', 'article', 'main', 'content', 'title', 'heading', 'filter', 'selector',
  // Asciidoctor content
  'doc', 'sect', 'admonitionblock', 'note', 'tip', 'important', 'warning', 'caution', 'icon', 'listingblock',
  'literalblock', 'exampleblock', 'sidebarblock', 'quoteblock', 'verseblock', 'openblock', 'imageblock', 'videoblock',
  'stemblock', 'sidebar', 'mathblock', 'tableblock', 'colist', 'attribution', 'discrete', 'stripes-', 'highlight', 'source-toolbox',
  'menuseq', 'tabs', 'tabpanel', 'tablist', 'tab', 'result', 'class_', 'conum', 'paragraph', 'ulist', 'olist', 'dlist',
  'red', 'green', 'blue', 'yellow', 'big', 'small', 'underline', 'line-through',
  // syntax highlighters
  'hljs', 'pygments', 'rouge', 'CodeMirror',
]
const TOKEN_SELECTOR = /^(:root|html)(\.dark-theme|\[data-theme="(light|dark)"\])?$/
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

export function validatePaint (css, extra = []) {
  const prefixes = [...ALLOWED_CLASS_PREFIXES, ...extra.map((e) => e.replace(/^\./, ''))]
  const errors = []
  const warnings = []
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/@import\b/.test(src)) errors.push('@import is not allowed in a paint')
  for (const m of src.matchAll(/url\(\s*['"]?(https?:)?\/\//g)) errors.push(`external url() not allowed: ${m[0]}`)
  // Flatten @media/@supports wrappers; inspect leaf rules.
  for (const m of src.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].trim().split(',').map((s) => s.trim()).filter(Boolean)
    if (selectors.some((s) => s.startsWith('@'))) continue
    const tokenBlock = selectors.every((s) => TOKEN_SELECTOR.test(s))
    for (const sel of selectors) {
      const bare = sel.replace(/:not\(([^()]|\([^()]*\))*\)/g, '')
      for (const cls of bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        if (!prefixes.some((p) => cls[1] === p || (cls[1].startsWith(p) && (p.endsWith('-') || p.endsWith('_') || /[-\d]/.test(cls[1][p.length] || ''))))) {
          errors.push(`selector "${sel}": class .${cls[1]} is not on the paint allowlist`)
        }
      }
      for (const id of bare.matchAll(/#([a-zA-Z][\w-]*)/g)) {
        if (!['search-input', 'search-field'].includes(id[1])) errors.push(`selector "${sel}": #${id[1]} is not on the paint allowlist`)
      }
    }
    if (!tokenBlock) {
      for (const decl of m[2].split(';')) {
        const [prop, ...rest] = decl.split(':')
        const value = rest.join(':')
        if (!prop.trim().startsWith('--') && COLOR_LITERAL.test(value.replace(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,[^)]*\)/g, ''))) {
          warnings.push(`selector "${selectors.join(', ')}": literal color in ${prop.trim()} (use a token)`)
        }
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-paint.mjs')) {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) { console.error('usage: validate-paint.mjs <paint.css> [--extra=.prefix-,...] [--strict] [--json]'); process.exit(2) }
  const extra = (args.find((a) => a.startsWith('--extra=')) || '--extra=').slice(8).split(',').filter(Boolean)
  const res = validatePaint(readFileSync(file, 'utf8'), extra)
  const errors = args.includes('--strict') ? [...res.errors, ...res.warnings] : res.errors
  const warnings = args.includes('--strict') ? [] : res.warnings
  if (args.includes('--json')) console.log(JSON.stringify({ file, ok: !errors.length, errors, warnings }, null, 2))
  else {
    for (const w of warnings) console.log(`  warning: ${w}`)
    for (const e of errors) console.log(`  error: ${e}`)
    if (!errors.length) console.log(`ok: ${file}${warnings.length ? ` (${warnings.length} warnings)` : ''}`)
  }
  process.exit(errors.length ? 1 : 0)
}
