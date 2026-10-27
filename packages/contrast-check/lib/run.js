// Orchestration: serve or open the site, run each scheme in a fresh browser
// context, axe + probe every page, add static paint checks, dedupe.
import { createServer } from 'node:http'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { readManifest, schemeRuns, checkPaint } from './paint.js'
import { analyze, analyzeFocus, analyzeHover, axeFindings, TOKENS } from './analyze.js'
import { probe, focusables, snapshot } from './probe.js'
import { normalizeSuppressions, applySuppressions, suppressionWarnings, inlineIgnores } from './suppress.js'

const require = createRequire(import.meta.url)
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' }

export function serve (dir) {
  const root = path.resolve(dir)
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let f = path.join(root, p)
    if (!f.startsWith(root)) { res.writeHead(403); return res.end() }
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html')
    if (!existsSync(f)) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

export function globToRegExp (g) {
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*') { if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++ } else re += '[^/]*' } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

function walk (dir, rel = '') {
  const out = []
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) { if (e.name !== '_' && !e.name.startsWith('.')) out.push(...walk(dir, r)) } else if (e.name.endsWith('.html') && e.name !== '404.html') out.push(r)
  }
  return out.sort()
}

/** Page paths (site-relative, no leading slash, may carry ?query) to check. */
export function selectPages (dir, patterns, max, ignore = []) {
  const ign = ignore.map(globToRegExp)
  if (!dir) return (patterns.length ? patterns : ['']).map((p) => p.replace(/^\//, '')).slice(0, max)
  const all = walk(dir)
  let picked
  if (!patterns.length) picked = all
  else {
    picked = []
    for (const p of patterns) {
      const clean = p.replace(/^\//, '')
      if (/[*?]/.test(clean)) { const re = globToRegExp(clean); picked.push(...all.filter((f) => re.test(f))) } else picked.push(clean)
    }
  }
  return [...new Set(picked)].filter((p) => !ign.some((re) => re.test(p))).slice(0, max)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** End state only: no transitions or animations (the context also sets prefers-reduced-motion). */
export async function freezeMotion (page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}' }).catch(() => {})
}

/** Force-reveal hidden-but-present UI: [hidden], closed <details>, collapsed aria-expanded controls and display:none containers that hold text. */
export function revealHidden () {
  const skip = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE', 'SVG'])
  let n = 0
  for (const d of document.querySelectorAll('details:not([open])')) { d.open = true; n++ }
  for (const b of document.querySelectorAll('[aria-expanded="false"]')) {
    b.setAttribute('aria-expanded', 'true'); n++
    for (const id of (b.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean)) { const t = document.getElementById(id); if (t) { t.hidden = false; t.style.setProperty('display', 'block', 'important') } }
  }
  for (const e of document.querySelectorAll('body [hidden]')) { if (!skip.has(e.tagName)) { e.hidden = false; n++ } }
  for (const e of document.querySelectorAll('body *')) {
    if (skip.has(e.tagName.toUpperCase()) || e.closest('svg,script,template,[data-contrast-check-ignore=""]')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' && e.textContent.trim()) { e.style.setProperty('display', e.tagName === 'SPAN' || e.tagName === 'A' ? 'inline' : 'block', 'important'); n++ }
    if (cs.visibility === 'hidden' && e.textContent.trim()) e.style.setProperty('visibility', 'visible', 'important')
  }
  return n
}

/** Run fixtures that extensions register on window.contrastCheckFixtures ({ name, run() }) to render sample JS UI. */
export async function runFixtures (page, names) {
  return page.evaluate(async (names) => {
    const list = (window.contrastCheckFixtures || []).filter((f) => !names || names.includes(f.name))
    for (const f of list) { try { await f.run() } catch {} }
    document.dispatchEvent(new CustomEvent('contrast-check:state', { detail: { names } }))
    return list.map((f) => f.name)
  }, names || null)
}

async function open (page, url, run) {
  await page.goto(url, { waitUntil: 'load' })
  const settle = () => page.waitForFunction(() => !document.querySelector('.valentus-fouc-pending'), null, { timeout: 5000 }).catch(() => {})
  await settle(); await sleep(150)
  await freezeMotion(page)
  if (run.query) {
    const got = await page.evaluate(() => document.documentElement.dataset.scheme)
    if (got !== run.id) { await page.reload({ waitUntil: 'load' }); await settle(); await sleep(150) }
  }
  await freezeMotion(page)
  return page.evaluate(() => ({ scheme: document.documentElement.dataset.scheme || null, dark: document.documentElement.classList.contains('dark-theme') }))
}

const withQuery = (u, run, param) => {
  if (!run.query) return u
  const url = new URL(u); url.searchParams.set(param, run.id); return url.href
}

export async function discoverPaints (page, cfg, base, dir) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href))
  const paints = []
  for (const h of hrefs) {
    let css = null
    try {
      if (dir && h.startsWith(base)) css = readFileSync(path.join(dir, decodeURIComponent(new URL(h).pathname)), 'utf8')
      else css = await (await fetch(h)).text()
    } catch { continue }
    if (css && /@color-schemes/.test(css)) paints.push({ file: dir ? path.relative(process.cwd(), path.join(dir, new URL(h).pathname)) : h, css })
  }
  return paints
}

/** Built-in states, referenced by name string in `states` (e.g. "search-results"). */
export const PRESET_STATES = {
  // Lunr / antora-search-chat: type a query so the results dropdown opens and is populated.
  // Hidden-but-present nodes forced visible (details, aria-expanded, [hidden], display:none with text).
  'reveal-hidden': { name: 'reveal-hidden', steps: [{ reveal: true }] },
  // Sample UI that extensions render through window.contrastCheckFixtures (e.g. antora-search-chat).
  fixtures: { name: 'fixtures', steps: [{ fixtures: true }, { wait: 300 }] },
  'search-results': { name: 'search-results', steps: [{ click: '#search-input' }, { type: '#search-input', text: 'a' }, { waitFor: '.search-result-dropdown-menu .search-result-document-hit, .search-result-dropdown-menu .search-result-document-title', optional: true }, { wait: 300 }] },
}

export function resolveStates (states) {
  return (states || []).map((s) => {
    if (typeof s === 'string') { if (!PRESET_STATES[s]) throw new Error(`contrast-check: unknown state preset '${s}'`); return PRESET_STATES[s] }
    return s
  })
}

/** Run one state's steps; returns false when a required step fails (the state is then reported as not reached). */
export async function applyState (page, state) {
  for (const st of state.steps) {
    try {
      if (st.reveal) await page.evaluate(revealHidden)
      else if (st.fixtures) { const ran = await runFixtures(page, Array.isArray(st.fixtures) ? st.fixtures : null); if (!ran.length && !st.optional) return false }
      else if (st.click) await page.locator(st.click).first().click({ timeout: 3000, force: true })
      else if (st.fill) await page.locator(st.fill).first().fill(st.text ?? '', { timeout: 3000 })
      else if (st.type) await page.locator(st.type).first().pressSequentially(st.text ?? '', { delay: 30, timeout: 3000 })
      else if (st.press) await page.keyboard.press(st.press)
      else if (st.hover) await page.locator(st.hover).first().hover({ timeout: 3000 })
      else if (st.waitFor) await page.waitForSelector(st.waitFor, { state: 'visible', timeout: st.timeout || 8000 })
      else if (st.wait) await sleep(st.wait)
    } catch (e) { if (!st.optional) return false }
  }
  await sleep(250) // transitions
  return true
}

export async function run (target, cfg, log = () => {}) {
  const { chromium } = require('playwright-core')
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
  const isUrl = /^https?:\/\//.test(target)
  const dir = isUrl ? null : path.resolve(target)
  if (dir && !existsSync(dir)) throw new Error(`contrast-check: site directory not found: ${target}`)
  const srv = dir ? await serve(dir) : null
  const base = srv ? srv.base : target.replace(/\/$/, '')
  const pages = selectPages(dir, cfg.pages, cfg.maxPages, cfg.ignore.pages)
  if (!pages.length) throw new Error('contrast-check: no pages to check')
  const launch = { headless: true }
  if (process.env.CONTRAST_CHECK_CHROME) launch.executablePath = process.env.CONTRAST_CHECK_CHROME
  else launch.channel = process.env.CONTRAST_CHECK_CHANNEL || undefined
  const browser = await chromium.launch(launch).catch(async (e) => {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe']) if (existsSync(p)) return chromium.launch({ headless: true, executablePath: p })
    throw e
  })
  const states = resolveStates(cfg.states)
  const findings = []; const meta = { pages, schemes: [], paints: [], states: states.map((s) => s.name), base: isUrl ? base : target }
  try {
    // Paint discovery and manifest from the first page.
    const ctx0 = await browser.newContext()
    const p0 = await ctx0.newPage()
    await p0.goto(`${base}/${pages[0]}`)
    let paints = cfg.paints.length ? cfg.paints.map((f) => ({ file: f, css: readFileSync(f, 'utf8') })) : await discoverPaints(p0, cfg, base, dir)
    await ctx0.close()
    const manifest = {}
    for (const p of paints) Object.assign(manifest, readManifest(p.css) || {})
    if (!manifest.light) manifest.light = {}
    if (!manifest.dark) manifest.dark = {}
    let runs = schemeRuns(manifest)
    if (cfg.schemes.length) runs = runs.filter((r) => cfg.schemes.includes(r.id))
    meta.schemes = runs.map((r) => `${r.id}/${r.mode}`)
    meta.paints = paints.map((p) => p.file)
    for (const p of paints) findings.push(...(await checkPaint(p.css, p.file, cfg)).filter((f) => !cfg.ignore.rules.includes(f.rule)))

    for (const r of runs) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: r.mode, reducedMotion: 'reduce' })
      const page = await context.newPage()
      for (const pg of pages) {
        const url = withQuery(`${base}/${pg}`, r, 'scheme')
        const ctx = { page: '/' + pg, scheme: r.id, mode: r.mode, file: dir ? path.relative(process.cwd(), path.join(dir, pg.split('?')[0])) : url }
        log(`  ${r.id}/${r.mode} ${ctx.page}`)
        const state = await open(page, url, r)
        if (r.query && state.scheme !== r.id) { findings.push({ ...ctx, level: 'warning', rule: 'scheme-not-applied', selector: 'html', message: `?scheme=${r.id} did not apply (data-scheme is ${state.scheme})` }); continue }
        await page.addScriptTag({ content: axeSource })
        const axeRes = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations'] })).violations)
        const ax = axeFindings(axeRes, ctx, cfg).filter((f) => !cfg.ignore.selectors.some((s) => f.selector.includes(s)))
        const axeSel = new Set()
        for (const v of axeRes) for (const n of v.nodes) axeSel.add(n.target.join(' '))
        const m = await page.evaluate(probe, { maxText: cfg.maxText, ignoreSelectors: cfg.ignore.selectors, tokens: TOKENS })
        const pf = analyze(m, { ...ctx, axeSelectors: axeSel }, cfg)
        // Focus: one Tab so Chrome treats focus as keyboard focus, then each focusable.
        const fs = []
        if (cfg.maxFocus > 0) {
          const ids = await page.evaluate(focusables, { max: cfg.maxFocus, ignoreSelectors: cfg.ignore.selectors })
          await page.keyboard.press('Tab')
          for (const i of ids) {
            await page.evaluate(() => document.activeElement && document.activeElement.blur())
            const rest = await page.evaluate(snapshot, i)
            await page.evaluate((i) => document.querySelector(`[data-cc-focus="${i}"]`)?.focus(), i)
            await page.keyboard.press('Shift'); await sleep(30)
            const foc = await page.evaluate(snapshot, i)
            if (rest && foc && foc.focused) { const f = analyzeFocus(rest, foc, ctx, cfg); if (f) fs.push(f) }
          }
          await page.evaluate(() => document.activeElement && document.activeElement.blur())
          for (const i of ids.slice(0, cfg.maxHover)) {
            const loc = page.locator(`[data-cc-focus="${i}"]`)
            const rest = await page.evaluate(snapshot, i)
            if (!rest || !(await loc.isVisible())) continue
            try { await loc.hover({ timeout: 1000 }) } catch { continue }
            await sleep(250) // transitions
            const hov = await page.evaluate(snapshot, i)
            await page.mouse.move(0, 0); await sleep(30)
            const f = hov && analyzeHover(rest, hov, ctx, cfg)
            if (f) fs.push(f)
          }
        }
        const pageFs = [...ax, ...pf, ...fs].filter((f) => !cfg.ignore.rules.includes(f.rule))
        // Inline opt-out: data-contrast-check-ignore="rule1 rule2" on the element or an ancestor (empty = every rule).
        const marks = await page.evaluate((sels) => sels.map((s) => { try { const h = s && document.querySelector(s)?.closest('[data-contrast-check-ignore]'); return h ? h.getAttribute('data-contrast-check-ignore') : null } catch { return null } }), pageFs.map((f) => f.selector))
        pageFs.forEach((f, i) => findings.push({ ...f, file: ctx.file, ...(marks[i] != null && inlineIgnores(marks[i], f.rule) ? { suppressedBy: 'inline', suppressReason: `data-contrast-check-ignore="${marks[i]}"` } : {}) }))
        for (const s of states) {
          if (s.pages && !s.pages.map(globToRegExp).some((re) => re.test(pg))) continue
          const sctx = { ...ctx, state: s.name }
          log(`  ${r.id}/${r.mode} ${ctx.page} [${s.name}]`)
          await open(page, url, r)
          if (!(await applyState(page, s))) { findings.push({ ...sctx, level: 'warning', rule: 'state-not-reached', selector: 'html', message: `state '${s.name}' could not be reached on ${ctx.page}` }); continue }
          await page.addScriptTag({ content: axeSource })
          const sAxe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations'] })).violations)
          const sSel = new Set(); for (const v of sAxe) for (const n of v.nodes) sSel.add(n.target.join(' '))
          const sm = await page.evaluate(probe, { maxText: cfg.maxText, ignoreSelectors: cfg.ignore.selectors, tokens: TOKENS })
          const sFs = [...axeFindings(sAxe, sctx, cfg).filter((f) => !cfg.ignore.selectors.some((x) => f.selector.includes(x))), ...analyze(sm, { ...sctx, axeSelectors: sSel }, cfg)].filter((f) => !cfg.ignore.rules.includes(f.rule))
          sFs.forEach((f) => findings.push({ ...f, state: s.name, file: ctx.file }))
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
    if (srv) srv.server.close()
  }
  const entries = normalizeSuppressions(cfg.suppress)
  const { kept, suppressed, used, expired } = applySuppressions(findings, entries)
  return { findings: dedupe(kept), suppressed: dedupe(suppressed), suppressionWarnings: suppressionWarnings(entries, used, expired), meta }
}

/** Hover findings are about the stylesheet, not the colors: one per selector, listing every scheme run. */
const SCHEME_AGNOSTIC = new Set(['hover-unchanged', 'hover-too-similar', 'focus-not-visible'])

/** Merge findings that differ only by page (and, for scheme-agnostic rules, by scheme). */
export function dedupe (findings) {
  const map = new Map()
  for (const f of findings) {
    const agnostic = SCHEME_AGNOSTIC.has(f.rule)
    const k = agnostic
      ? [f.level, f.rule, f.suppressedBy, f.selector].join('|')
      : [f.level, f.rule, f.suppressedBy, f.scheme, f.mode, f.state || '', f.selector, f.fg, f.bg, f.ratio, f.file && !f.page ? f.file : ''].join('|')
    const run = f.scheme ? `${f.scheme}/${f.mode}` : null
    const g = map.get(k)
    if (g) {
      if (f.page && !g.pages.includes(f.page)) g.pages.push(f.page)
      if (agnostic && run && !g.schemes.includes(run)) g.schemes.push(run)
    } else map.set(k, { ...f, pages: f.page ? [f.page] : [], ...(agnostic ? { schemes: run ? [run] : [] } : {}) })
  }
  return [...map.values()]
}
