const { execSync } = require('child_process')

const checks = [
  { name: 'type-check', cmd: 'npm run type-check' },
  { name: 'build', cmd: 'npm run build' },
  { name: 'lint', cmd: 'npm run lint' },
]

let failed = false

for (const check of checks) {
  process.stdout.write(`\n[release-gate] Running ${check.name}...\n`)
  try {
    execSync(check.cmd, { stdio: 'inherit' })
    process.stdout.write(`[release-gate] PASS ${check.name}\n`)
  } catch (error) {
    failed = true
    process.stdout.write(`[release-gate] FAIL ${check.name}\n`)
  }
}

if (failed) {
  process.stdout.write('\n[release-gate] BLOCKED: fix failing checks before release.\n')
  process.exit(1)
}

process.stdout.write('\n[release-gate] PASS: all release checks completed successfully.\n')
