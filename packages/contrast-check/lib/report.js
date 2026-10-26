// Output: console, JSON, GitHub annotations and step summary.
import { appendFileSync } from 'node:fs'

const ORDER = { error: 0, warning: 1 }
export function sortFindings (fs) {
  return [...fs].sort((a, b) => (ORDER[a.level] - ORDER[b.level]) || ((a.ratio ?? 99) - (b.ratio ?? 99)) || String(a.rule).localeCompare(b.rule))
}

export function counts (fs) {
  const c = { error: 0, warning: 0, byRule: {}, byScheme: {} }
  for (const f of fs) {
    c[f.level]++
    c.byRule[f.rule] = (c.byRule[f.rule] || 0) + 1
    const s = f.scheme ? `${f.scheme}/${f.mode}` : '(paint)'
    c.byScheme[s] ??= { error: 0, warning: 0 }
    c.byScheme[s][f.level]++
  }
  return c
}

const where = (f) => [f.schemes?.length > 1 ? `${f.schemes.length} schemes` : f.scheme && `${f.scheme}/${f.mode}`, f.pages?.length ? f.pages[0] + (f.pages.length > 1 ? ` (+${f.pages.length - 1})` : '') : f.file].filter(Boolean).join(' ')
const colors = (f) => f.fg || f.bg ? `${f.fg ?? '?'} on ${f.bg ?? '?'}` : ''
export function line (f) {
  const bits = [colors(f), f.ratio != null && `${f.ratio}:1${f.required ? (f.ratio < f.required ? ` < ${f.required}:1` : ` (min ${f.required}:1)`) : ''}`, f.suggestion && `try ${f.suggestion}`, f.apca != null && `APCA Lc ${f.apca}`].filter(Boolean)
  return `${f.level === 'error' ? 'error' : 'warn '} ${f.rule} ${where(f)} ${f.selector ?? ''}${bits.length ? ' | ' + bits.join(', ') : ''}\n        ${f.message}`
}

const supTail = (x) => x.suppressed?.length ? `, ${x.suppressed.length} suppressed` : ''
/** Totals line: "E error(s), W warning(s)[, N suppressed]". */
export function totals (fs, extra = {}) { const c = counts(fs); return `${c.error} error(s), ${c.warning} warning(s)${supTail(extra)}` }

export function consoleReport (fs, meta, limit = 200, extra = {}) {
  const s = sortFindings(fs); const c = counts(fs)
  const out = [`contrast-check: ${meta.pages.length} page(s) x ${meta.schemes.length} scheme run(s) [${meta.schemes.join(', ')}]${meta.paints.length ? `; paints: ${meta.paints.join(', ')}` : ''}`]
  for (const f of s.slice(0, limit)) out.push(line(f))
  if (s.length > limit) out.push(`... ${s.length - limit} more (use --json for all)`)
  for (const w of extra.suppressionWarnings || []) out.push(`warn  suppression-${w.kind} ${w.message}`)
  if (extra.showSuppressed && extra.suppressed?.length) {
    out.push('suppressed:')
    for (const f of sortFindings(extra.suppressed)) out.push(line(f).replace(/^(error|warn )/, 'supp ') + `\n        suppressed by ${f.suppressedBy}: ${f.suppressReason}`)
  }
  out.push(`${c.error} error(s), ${c.warning} warning(s)${supTail(extra)}`)
  return out.join('\n')
}

const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C')
export function annotations (fs, max = 50) {
  return sortFindings(fs).slice(0, max).map((f) => {
    const props = [f.file && `file=${escProp(f.file)}`, `title=${escProp(`contrast-check ${f.rule}${f.scheme ? ` (${f.scheme}/${f.mode})` : ''}`)}`].filter(Boolean).join(',')
    const msg = `${f.selector ? f.selector + ': ' : ''}${f.message}${colors(f) ? ` [${colors(f)}${f.suggestion ? `, try ${f.suggestion}` : ''}]` : ''}${f.pages?.length ? ` on ${f.pages.join(', ')}` : ''}`
    return `::${f.level === 'error' ? 'error' : 'warning'} ${props}::${esc(msg)}`
  })
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
export function markdownSummary (fs, meta, top = 30, extra = {}) {
  const c = counts(fs); const s = sortFindings(fs)
  const out = [`## Contrast check: ${c.error ? '❌' : '✅'} ${c.error} error(s), ${c.warning} warning(s)${supTail(extra)}`, '',
    `${meta.pages.length} page(s), schemes: ${meta.schemes.map((x) => '`' + x + '`').join(', ')}`, '',
    '| Scheme | Errors | Warnings |', '| --- | ---: | ---: |',
    ...Object.entries(c.byScheme).map(([k, v]) => `| ${k} | ${v.error} | ${v.warning} |`), '']
  if (s.length) {
    out.push(`### Top ${Math.min(top, s.length)} findings`, '', '| Level | Rule | Scheme | Page | Selector | Colors | Ratio | Suggest |', '| --- | --- | --- | --- | --- | --- | ---: | --- |')
    for (const f of s.slice(0, top)) out.push(`| ${f.level} | ${f.rule} | ${cell(f.scheme ? `${f.scheme}/${f.mode}` : '')} | ${cell(f.pages?.[0] || f.file)} | \`${cell(f.selector)}\` | ${cell(colors(f))} | ${f.ratio != null ? `${f.ratio}:1` : ''} | ${cell(f.suggestion)} |`)
  }
  if (extra.suppressionWarnings?.length) out.push('', '### Suppression warnings', '', ...extra.suppressionWarnings.map((w) => `- **${w.kind}**: ${cell(w.message)}`))
  if (extra.showSuppressed && extra.suppressed?.length) {
    out.push('', `### ${extra.suppressed.length} suppressed`, '', '| Rule | Scheme | Page | Selector | By | Reason |', '| --- | --- | --- | --- | --- | --- |')
    for (const f of sortFindings(extra.suppressed)) out.push(`| ${f.rule} | ${cell(f.scheme ? `${f.scheme}/${f.mode}` : '')} | ${cell(f.pages?.[0] || f.file)} | \`${cell(f.selector)}\` | ${cell(f.suppressedBy)} | ${cell(f.suppressReason)} |`)
  }
  return out.join('\n') + '\n'
}

/** ::warning lines for stale and expired suppressions. */
export function suppressionAnnotations (ws = []) { return ws.map((w) => `::warning title=${escProp(`contrast-check suppression-${w.kind}`)}::${esc(w.message)}`) }

export function writeSummary (md, file = process.env.GITHUB_STEP_SUMMARY) { if (file) appendFileSync(file, md) }
