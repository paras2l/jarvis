# gpu-worker Edge Function

This function runs worker logic for `gpu_job_queue` in Supabase.

## What it does

1. Claims one or more queued jobs using `claim_next_gpu_job`.
2. Sends heartbeats via `heartbeat_gpu_job` and `gpu_worker_heartbeats` inserts.
3. Resolves model endpoint config from `model_deployments`.
4. Calls model endpoint and marks result with `complete_gpu_job`.
5. Retries/dead-letters are controlled by SQL function logic.

## Required environment variables

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- WORKER_ID (optional)
- GPU_WORKER_STAGE_TYPES (optional, comma separated)
- Additional endpoint tokens referenced by `model_deployments.auth_secret_name`

## Deploy

1. Apply `SUPABASE_PHASE3_SCHEMA.sql` in SQL editor.
2. Deploy function:

```bash
supabase functions deploy gpu-worker
```

3. Set secrets:

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKER_ID=worker-a
```

4. Invoke run-once:

```bash
supabase functions invoke gpu-worker --body '{"action":"run-once","maxJobs":1}'
```

5. Invoke drain mode:

```bash
supabase functions invoke gpu-worker --body '{"action":"drain","maxJobs":10}'
```

## Expected model endpoint contract

Input body:

```json
{
  "gpuJobId": "...",
  "mediaJobId": "...",
  "stageType": "video",
  "prompt": "...",
  "inputUrls": [],
  "modelName": "wan-v1"
}
```

Output body:

```json
{
  "ok": true,
  "resultUrl": "https://.../artifact.mp4"
}
```
