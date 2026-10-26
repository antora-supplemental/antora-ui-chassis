#!/usr/bin/env node
// contrast-check <site-dir|url> [--pages a.html,b/**/*.html] [--config f] [--json[=file]]
//   [--strict] [--schemes light,dark] [--paint f.css] [--max-pages n] [--near n] [--apca]
import { writeFileSync } from 'node:fs'
import { loadConfig, mergeConfig } from '../lib/config.js'
import { run } from '../lib/run.js'
import { consoleReport, annotations, markdownSummary, writeSummary, counts } from '../lib/report.js'

const HELP = `Usage: contrast-check <site-dir|url> [options]

  --pages <list>      comma-separated pages or globs (site-relative), e.g. "index.html,guide/**/*.html"
  --max-pages <n>     cap on pages (default 20)
  --schemes <ids>     only these scheme ids (default: every scheme in the paint manifest)
  --paint <file.css>  paint stylesheet(s) for the manifest and static checks (repeatable; default: discovered)
  --config <file>     config file (default: ./contrast-check.config.json when present)
  --near <ratio>      near-threshold margin (default 0.5)
  --apca              add APCA Lc readouts
  --no-focus          skip focus and hover checks
  --json | --json=<file>  print JSON to stdout, or write it to a file
  --strict            fail on warnings too (same as --fail-on warning)
  --fail-on <level>   error (default), warning, or none (report only; still exits 2 on usage errors)
  --quiet             only the totals line
  -h, --help`

function parse (argv) {
  const o = { paints: [] }
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
    else if (a === '--json') o.json = true
    else if (a.startsWith('--json=')) o.json = a.slice(7)
    else if (a === '--strict') o.strict = true
    else if (a === '--fail-on') o.failOn = next()
    else if (a.startsWith('--fail-on=')) o.failOn = a.slice(10)
    else if (a === '--quiet') o.quiet = true
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`)
    else if (!o.target) o.target = a
    else throw new Error(`unexpected argument ${a}`)
  }
  return o
}

try {
  const o = parse(process.argv.slice(2))
  if (o.help || !o.target) { console.log(HELP); process.exit(o.help ? 0 : 2) }
  const { config: fileCfg } = loadConfig(o.config)
  const cli = { pages: o.pages, maxPages: o.maxPages, schemes: o.schemes, paints: o.paints.length ? o.paints : undefined, nearMargin: o.nearMargin, apca: o.apca || undefined }
  if (o.noFocus) cli.maxFocus = 0
  let failOn = o.failOn || (o.strict ? 'warning' : null) || fileCfg.failOn || (fileCfg.strict ? 'warning' : 'error')
  delete fileCfg.strict; delete fileCfg.failOn
  if (!['error', 'warning', 'none'].includes(failOn)) throw new Error(`--fail-on must be error, warning or none (got ${failOn})`)
  const cfg = mergeConfig(fileCfg, cli)
  const { findings, meta } = await run(o.target, cfg, o.quiet || o.json === true ? () => {} : (m) => process.stderr.write(m + '\n'))
  const c = counts(findings)
  if (o.json) {
    const doc = JSON.stringify({ meta, counts: c, findings }, null, 2)
    if (o.json === true) console.log(doc); else writeFileSync(o.json, doc + '\n')
  }
  if (o.json !== true) console.log(o.quiet ? `${c.error} error(s), ${c.warning} warning(s)` : consoleReport(findings, meta))
  if (process.env.GITHUB_ACTIONS) for (const a of annotations(findings, cfg.maxAnnotations)) console.log(a)
  writeSummary(markdownSummary(findings, meta))
  const fail = failOn === 'none' ? false : failOn === 'warning' ? c.error + c.warning > 0 : c.error > 0
  process.exit(fail ? 1 : 0)
} catch (e) {
  console.error(process.env.CONTRAST_CHECK_DEBUG ? e.stack : e.message)
  process.exit(2)
}
