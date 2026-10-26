// Programmatic API for @antora-supplemental/contrast-check.
export { run, dedupe, selectPages, globToRegExp, serve } from './run.js'
export { analyze, analyzeFocus, analyzeHover, axeFindings, TOKEN_PAIRS } from './analyze.js'
export { DEFAULTS, mergeConfig, loadConfig } from './config.js'
export { readManifest, schemeRuns, tokenBlocks, nearIdentical, checkPaint } from './paint.js'
export { sortFindings, counts, consoleReport, annotations, markdownSummary, writeSummary } from './report.js'
export * as color from './color.js'
