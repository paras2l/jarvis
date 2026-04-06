// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ClaimedGpuJob = {
  id: string
  media_job_id: string
  stage_type: string
  prompt: string
  input_urls: unknown
  model_name: string
  retry_count: number
  max_retries: number
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const WORKER_ID = Deno.env.get('WORKER_ID') ?? `edge-${crypto.randomUUID()}`
const STAGE_TYPES = (Deno.env.get('GPU_WORKER_STAGE_TYPES') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for gpu-worker function.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405)
    }

    const body = await req.json().catch(() => ({})) as { action?: string; maxJobs?: number }
    const action = body.action ?? 'run-once'
    const maxJobs = Math.max(1, Math.min(20, body.maxJobs ?? 1))

    if (action === 'heartbeat') {
      await writeWorkerHeartbeat('online', { mode: 'heartbeat-only' })
      return json({ ok: true, workerId: WORKER_ID, heartbeat: 'ok' })
    }

    const processed: Array<{ id: string; status: 'done' | 'failed'; error?: string }> = []
    for (let i = 0; i < maxJobs; i += 1) {
      const job = await claimNextGpuJob()
      if (!job) break

      await heartbeatJob(job.id)
      const result = await executeModelJob(job)
      await completeJob(job.id, result)
      processed.push({ id: job.id, status: result.status, error: result.error })

      if (action === 'run-once') break
    }

    await writeWorkerHeartbeat('online', {
      mode: action,
      processed: processed.length,
      stageTypes: STAGE_TYPES,
    })

    return json({
      ok: true,
      workerId: WORKER_ID,
      claimed: processed.length,
      processed,
    })
  } catch (error) {
    await writeWorkerHeartbeat('error', {
      message: error instanceof Error ? error.message : 'unknown worker error',
    })

    return json(
      {
        ok: false,
        workerId: WORKER_ID,
        error: error instanceof Error ? error.message : 'Unknown worker error',
      },
      500,
    )
  }
})

async function claimNextGpuJob(): Promise<ClaimedGpuJob | null> {
  const { data, error } = await supabase.rpc('claim_next_gpu_job', {
    p_worker_id: WORKER_ID,
    p_stage_types: STAGE_TYPES.length > 0 ? STAGE_TYPES : null,
  })

  if (error) {
    throw new Error(`claim_next_gpu_job failed: ${error.message}`)
  }

  if (!Array.isArray(data) || data.length === 0) return null
  return data[0] as ClaimedGpuJob
}

async function heartbeatJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('heartbeat_gpu_job', {
    p_job_id: jobId,
    p_worker_id: WORKER_ID,
  })

  if (error) {
    throw new Error(`heartbeat_gpu_job failed for ${jobId}: ${error.message}`)
  }
}

async function completeJob(
  jobId: string,
  result: { status: 'done' | 'failed'; resultUrl?: string; error?: string },
): Promise<void> {
  const { error } = await supabase.rpc('complete_gpu_job', {
    p_job_id: jobId,
    p_worker_id: WORKER_ID,
    p_status: result.status,
    p_result_url: result.resultUrl ?? null,
    p_error: result.error ?? null,
  })

  if (error) {
    throw new Error(`complete_gpu_job failed for ${jobId}: ${error.message}`)
  }
}

async function executeModelJob(
  job: ClaimedGpuJob,
): Promise<{ status: 'done' | 'failed'; resultUrl?: string; error?: string }> {
  const deployment = await getModelDeployment(job.stage_type, job.model_name)
  if (!deployment) {
    return {
      status: 'failed',
      error: `No active model_deployments row for stage=${job.stage_type}, model=${job.model_name}`,
    }
  }

  const timeoutMs = Math.max(1000, Number(deployment.timeout_ms ?? 300000))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (deployment.auth_mode === 'bearer' && deployment.auth_secret_name) {
      const token = Deno.env.get(deployment.auth_secret_name)
      if (token) headers.authorization = `Bearer ${token}`
    }

    const response = await fetch(String(deployment.endpoint), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        gpuJobId: job.id,
        mediaJobId: job.media_job_id,
        stageType: job.stage_type,
        prompt: job.prompt,
        inputUrls: job.input_urls ?? [],
        modelName: job.model_name,
      }),
    })

    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean
      resultUrl?: string
      error?: string
    }

    if (!response.ok || payload.ok === false) {
      return {
        status: 'failed',
        error: payload.error ?? `Model endpoint failed with ${response.status}`,
      }
    }

    if (!payload.resultUrl) {
      return {
        status: 'failed',
        error: 'Model endpoint did not return resultUrl.',
      }
    }

    return {
      status: 'done',
      resultUrl: payload.resultUrl,
    }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Model execution failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getModelDeployment(stageType: string, modelName: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('model_deployments')
    .select('endpoint, auth_mode, auth_secret_name, timeout_ms')
    .eq('stage_type', stageType)
    .eq('model_name', modelName)
    .eq('active', true)
    .maybeSingle()

  if (error) {
    throw new Error(`model_deployments lookup failed: ${error.message}`)
  }

  return data as Record<string, unknown> | null
}

async function writeWorkerHeartbeat(status: string, metadata: Record<string, unknown>): Promise<void> {
  await supabase.from('gpu_worker_heartbeats').insert({
    worker_id: WORKER_ID,
    status,
    metadata,
    updated_at: new Date().toISOString(),
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
