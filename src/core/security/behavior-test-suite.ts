import { policyGateway } from '../policy/PolicyGateway'

export async function runBehaviorTestSuite(): Promise<{ passed: number; failed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  let failed = 0

  const tests = [
    async () => {
      const r = await policyGateway.decide({
        agentId: 'main-agent',
        action: 'remote_screen_control',
        command: 'open remote screen',
        source: 'remote',
        explicitPermission: false,
      })
      return r.decision === 'deny'
    },
    async () => {
      const r = await policyGateway.decide({
        agentId: 'main-agent',
        action: 'sensitive_data_read',
        command: 'access personal data',
        source: 'local',
        emergency: true,
        codeword: 'paro the master',
      })
      return r.decision === 'allow'
    },
  ]

  for (let i = 0; i < tests.length; i++) {
    try {
      const ok = await tests[i]()
      if (ok) {
        passed++
        details.push(`test-${i + 1}: pass`)
      } else {
        failed++
        details.push(`test-${i + 1}: fail`)
      }
    } catch {
      failed++
      details.push(`test-${i + 1}: exception`)
    }
  }

  return { passed, failed, details }
}
