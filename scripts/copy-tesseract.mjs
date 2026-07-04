// Populate public/tesseract/ with self-hosted OCR assets so tesseract.js loads
// from our OWN origin at runtime (data privacy + reliability), never a CDN.
//
// Runs automatically via the "predev" and "prebuild" npm hooks. Vercel executes
// "prebuild" during its build step and has network access to fetch the language data.
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const outDir = path.resolve('public/tesseract')
await mkdir(outDir, { recursive: true })

// Resolve a package directory. If package `exports` blocks `<pkg>/package.json`,
// fall back to reading node_modules/<pkg> directly.
function pkgDir(pkg) {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`))
  } catch {
    const direct = path.resolve('node_modules', pkg)
    if (existsSync(direct)) return direct
    throw new Error(`Cannot locate package "${pkg}" — is it installed?`)
  }
}

// 1) Core wasm + JS glue. Copy every tesseract-core*.wasm(.js) variant
//    (plain + SIMD) so the runtime can pick the fastest one it supports.
const coreDir = pkgDir('tesseract.js-core')
let coreCount = 0
for (const f of await readdir(coreDir)) {
  if (/^tesseract-core.*\.wasm(\.js)?$/.test(f)) {
    await copyFile(path.join(coreDir, f), path.join(outDir, f))
    coreCount++
  }
}
if (coreCount === 0) throw new Error(`No tesseract-core*.wasm files found in ${coreDir}`)

// 2) Worker script.
const tjsDir = pkgDir('tesseract.js')
await copyFile(path.join(tjsDir, 'dist', 'worker.min.js'), path.join(outDir, 'worker.min.js'))

// 3) Language data (gzipped). Download once; skip if already present.
const langOut = path.join(outDir, 'eng.traineddata.gz')
if (!existsSync(langOut)) {
  const url = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`traineddata download failed: ${res.status} ${res.statusText}`)
  await writeFile(langOut, Buffer.from(await res.arrayBuffer()))
}

console.log(`Tesseract assets -> ${outDir}  (core variants: ${coreCount}, worker + eng.traineddata.gz ready)`)
