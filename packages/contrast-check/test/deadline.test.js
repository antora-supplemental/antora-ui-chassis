import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from '../lib/config.js'
import { run } from '../lib/run.js'
test('total budget defaults and validation', () => {
  assert.equal(mergeConfig().maxDurationMs, 600000)
  for (const n of [0, -1, NaN, Infinity, 1.5, 2147483648]) assert.throws(() => mergeConfig({ maxDurationMs: n }), /maxDurationMs/)
})
test('deadline fails even report-only CLI without emitting successful JSON', () => {
  const start = Date.now()
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/contrast-check.js', import.meta.url)), fileURLToPath(new URL('./fixtures/pass', import.meta.url)), '--max-duration-ms', '1', '--fail-on', 'none', '--json'], { encoding: 'utf8', timeout: 12000 })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /total time limit of 1 ms exceeded; audit incomplete/)
  assert.equal(r.stdout, '')
  assert.ok(Date.now() - start < 10000)
})
test('invalid target fails without leaking a server or browser', async () => {
  await assert.rejects(run('/nonexistent-contrast-fixture', mergeConfig()), /not found/)
})
