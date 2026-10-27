#!/usr/bin/env node
// contrast-check <site-dir|url> [--pages a.html,b/**/*.html] [--config f] [--json[=file]]
//   [--strict] [--schemes light,dark] [--paint f.css] [--max-pages n] [--near n] [--apca]
import { writeFileSync } from 'node:fs'
import { loadConfig, loadSuppressFile, mergeConfig } from '../lib/config.js'
import { run } from '../lib/run.js'
import { consoleReport, annotations, suppressionAnnotations, markdownSummary, writeSummary, counts, totals } from '../lib/report.js'

const HELP = `Usage: contrast-check <site-dir|url> [options]

  --pages <list>      comma-separated pages or globs (site-relative), e.g. "index.html,guide/**/*.html"
  --max-pages <n>     cap on pages (default 20)
  --schemes <ids>     only these scheme ids (default: every scheme in the paint manifest)
  --paint <file.css>  paint stylesheet(s) for the manifest and static checks (repeatable; default: discovered)
  --config <file>     config file (default: ./contrast-check.config.json when present)
  --near <ratio>      near-threshold margin (default 0.5)
  --apca              add APCA Lc readouts
  --no-focus          skip focus and hover checks
  --state <name>      also check a dynamic UI state (repeatable); preset: search-results
  --json | --json=<file>  print JSON to stdout, or write it to a file
  --strict            fail on warnings too (same as --fail-on warning)
  --fail-on <level>   error (default), warning, or none (report only; still exits 2 on usage errors)
  --suppress <file>   suppression list (JSON, JSON5 or YAML; repeatable), added to the config's \`suppress\`
  --show-suppressed   list suppressed findings with their reasons
  --fail-on-stale     exit 1 when a suppression matched nothing or has expired
  --quiet             only the totals line
  -h, --help`

function parse (argv) {
  const o = { paints: [], suppress: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v }
    if (a === '-h' || a === '--help') o.help = true
    else if (a === '--pages') o.pages = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--max-pages') o.maxPages = +next()
    else if (a === '--schemes') o.schemes = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--paint') o.paints.push(next())
    else if (a === '--config') o.config = next()
    else if (a === '--near') o.nearMargin = +next()
    else if (a === '--apca') o.apca = true
    else if (a === '--no-focus') o.noFocus = true
    else if (a === '--state') (o.states ||= []).push(next())
    else if (a === '--json') o.json = true
    else if (a.startsWith('--json=')) o.json = a.slice(7)
    else if (a === '--strict') o.strict = true
    else if (a === '--fail-on') o.failOn = next()
    else if (a.startsWith('--fail-on=')) o.failOn = a.slice(10)
    else if (a === '--quiet') o.quiet = true
    else if (a === '--suppress') o.suppress.push(next())
    else if (a.startsWith('--suppress=')) o.suppress.push(a.slice(11))
    else if (a === '--show-suppressed') o.showSuppressed = true
    else if (a === '--fail-on-stale') o.failOnStale = true
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`)
    else if (!o.target) o.target = a
    else throw new Error(`unexpected argument ${a}`)
  }
  return o
}

try {
  const o = parse(process.argv.slice(2))
  if (o.help || !o.target) { console.log(HELP); process.exit(o.help ? 0 : 2) }
  const { config: fileCfg } = await loadConfig(o.config)
  const cli = { pages: o.pages, maxPages: o.maxPages, schemes: o.schemes, paints: o.paints.length ? o.paints : undefined, nearMargin: o.nearMargin, apca: o.apca || undefined }
  if (o.noFocus) cli.maxFocus = 0
  if (o.states) cli.states = [...(fileCfg.states || []), ...o.states]
  let failOn = o.failOn || (o.strict ? 'warning' : null) || fileCfg.failOn || (fileCfg.strict ? 'warning' : 'error')
  delete fileCfg.strict; delete fileCfg.failOn
  if (!['error', 'warning', 'none'].includes(failOn)) throw new Error(`--fail-on must be error, warning or none (got ${failOn})`)
  for (const f of o.suppress) cli.suppress = [...(cli.suppress || fileCfg.suppress || []), ...(await loadSuppressFile(f))]
  if (o.failOnStale) cli.failOnStale = true
  const cfg = mergeConfig(fileCfg, cli)
  const { findings, suppressed, suppressionWarnings, meta } = await run(o.target, cfg, o.quiet || o.json === true ? () => {} : (m) => process.stderr.write(m + '\n'))
  const c = counts(findings); const extra = { suppressed, suppressionWarnings, showSuppressed: o.showSuppressed }
  if (o.json) {
    const doc = JSON.stringify({ meta, counts: { ...c, suppressed: suppressed.length }, findings, suppressed, suppressionWarnings }, null, 2)
    if (o.json === true) console.log(doc); else writeFileSync(o.json, doc + '\n')
  }
  if (o.json !== true) console.log(o.quiet ? totals(findings, extra) : consoleReport(findings, meta, 200, extra))
  if (process.env.GITHUB_ACTIONS) for (const a of [...annotations(findings, cfg.maxAnnotations), ...suppressionAnnotations(suppressionWarnings)]) console.log(a)
  writeSummary(markdownSummary(findings, meta, 30, extra))
  const fail = failOn === 'none' ? false : failOn === 'warning' ? c.error + c.warning > 0 : c.error > 0
  process.exit(fail || (cfg.failOnStale && suppressionWarnings.length) ? 1 : 0)
} catch (e) {
  console.error(process.env.CONTRAST_CHECK_DEBUG ? e.stack : e.message)
  process.exit(2)
}
