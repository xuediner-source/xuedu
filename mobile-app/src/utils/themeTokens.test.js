import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainCss = fs.readFileSync(path.join(sourceRoot, 'assets/main.css'), 'utf8')

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /\.(vue|css|js)$/.test(entry.name) ? [fullPath] : []
  })
}

function collectDeclaredTokens(text) {
  const tokens = new Set()
  const declarationPatterns = [
    /(?:^|[;{])\s*(--[\w-]+)\s*:/gm,
    /['"](--[\w-]+)['"]\s*:/g,
  ]
  for (const pattern of declarationPatterns) {
    for (const match of text.matchAll(pattern)) tokens.add(match[1])
  }
  return tokens
}

test('every source CSS variable has a global definition, a local definition, or a fallback', () => {
  const rootMatch = mainCss.match(/:root\s*\{([^}]+)\}/s)
  assert.ok(rootMatch, 'main.css must define a :root theme block')
  const globalTokens = collectDeclaredTokens(rootMatch[1])
  const unresolved = []

  for (const filePath of listSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(filePath, 'utf8')
    const localTokens = collectDeclaredTokens(source)
    const references = /var\(\s*(--[\w-]+)(\s*,|\s*\))/g

    for (const match of source.matchAll(references)) {
      const token = match[1]
      const hasFallback = match[2].includes(',')
      if (!hasFallback && !globalTokens.has(token) && !localTokens.has(token)) {
        unresolved.push(`${path.relative(sourceRoot, filePath)}: ${token}`)
      }
    }
  }

  assert.deepEqual(unresolved, [], `Undefined CSS variables:\n${unresolved.join('\n')}`)
})
