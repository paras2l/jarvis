const fs = require('fs')
const path = require('path')

const distDir = path.join(process.cwd(), 'dist')

if (!fs.existsSync(distDir)) {
  process.exit(0)
}

const removableNames = new Set([
  '__uninstaller-nsis-patrich.exe',
  'builder-debug.yml',
  'builder-effective-config.yaml',
  'latest.yml',
])

for (const entry of fs.readdirSync(distDir)) {
  const fullPath = path.join(distDir, entry)
  const isTempArchive = entry.endsWith('.7z')
  const isArtifact = entry.endsWith('.exe') || entry.endsWith('.blockmap')
  const shouldRemove = removableNames.has(entry) || isTempArchive || isArtifact || entry === 'win-unpacked'

  if (!shouldRemove) {
    continue
  }

  try {
    fs.rmSync(fullPath, { recursive: true, force: true })
  } catch {
    // Ignore deletion errors and continue; builder may still overwrite artifacts.
  }
}
