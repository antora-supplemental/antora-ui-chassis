#!/usr/bin/env node
// Stage one chassis package for packing: node .github/scripts/stage-package.mjs <package-dir> <out-dir>
// Copies the package to <out-dir>. When package.json lists bundleDependencies
// (antora-dark-mode), the sibling chassis packages are copied into
// <out-dir>/node_modules and their git-path dependency specs are rewritten to
// the bundled versions, so npm installs the tarball without fetching git.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [pkgDir, outDir] = process.argv.slice(2).map((p) => p && resolve(p))
if (!pkgDir || !outDir) { console.error('usage: stage-package.mjs <package-dir> <out-dir>'); process.exit(2) }
const packagesRoot = resolve(pkgDir, '..')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const skip = (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src.slice(packagesRoot.length))

rmSync(outDir, { recursive: true, force: true })
cpSync(pkgDir, outDir, { recursive: true, filter: skip })
const pkg = read(join(outDir, 'package.json'))
const bundled = pkg.bundleDependencies || []
const versions = {}
for (const name of bundled) {
  const dir = join(packagesRoot, name.split('/').pop())
  const sub = read(join(dir, 'package.json'))
  if (sub.name !== name) throw new Error(`${dir}: expected ${name}, found ${sub.name}`)
  if (pkg.dependencies[name] !== sub.version) throw new Error(`${pkg.name} wants ${name}@${pkg.dependencies[name]}, sibling is ${sub.version}`)
  versions[name] = sub.version
}
for (const name of bundled) {
  const dest = join(outDir, 'node_modules', ...name.split('/'))
  mkdirSync(dest, { recursive: true })
  cpSync(join(packagesRoot, name.split('/').pop()), dest, { recursive: true, filter: skip })
  const p = join(dest, 'package.json')
  const sub = read(p)
  for (const dep of Object.keys(sub.dependencies || {})) {
    if (!versions[dep]) throw new Error(`${name} depends on ${dep}, which is not bundled`)
    sub.dependencies[dep] = versions[dep]
  }
  writeFileSync(p, JSON.stringify(sub, null, 2) + '\n')
}
console.log(`staged ${pkg.name}@${pkg.version} in ${outDir}${bundled.length ? ` with ${bundled.join(', ')}` : ''}`)
