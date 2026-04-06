# Remote Worker Contract (Supabase Cloud Media)

## Purpose
Defines the exact contract between app orchestration and the remote GPU worker.

## Source Tables
1. media_jobs
2. gpu_job_queue
3. storage bucket: studio-assets

## Queue Payload Written By App
Table: gpu_job_queue

Required fields:
1. media_job_id: string
2. stage_type: image | video | voice | avatar | script | camera
3. prompt: string
4. input_urls: string[]
5. model_name: string
6. status: queued

Optional fields (recommended for worker upgrade):
1. quality_profile: cinematic-draft | cinematic-standard | cinematic-premium
2. motion_template: ken-burns-soft | dolly-in | pan-left | pan-right
3. transitions: soft-fade | cross-dissolve | cinematic-cut
3. color_grade: neutral | teal-orange | warm-film
4. max_retries: number
5. retry_count: number

## Worker Status Lifecycle
Worker must update gpu_job_queue.status in this order:
1. queued
2. processing
3. done OR failed

## Worker Result Fields
On done:
1. result_url: public or signed URL of final artifact
2. error: null

On failed:
1. result_url: null
2. error: clear failure reason

## App Polling + Realtime Behavior
1. App subscribes to gpu_job_queue updates by row id.
2. App also polls as fallback if realtime events are delayed.
3. App retries transient poll failures up to 5 times.
4. App stores dead letters in local key: antigravity.media.deadletters

## Media Job Synchronization
For each queued stage:
1. App creates media_jobs row via saveMediaJobStart.
2. On final done: app marks media_jobs.status = completed.
3. On final failed: app marks media_jobs.status = failed with error.

## Worker Responsibilities
1. Claim oldest queued job safely.
2. Lock/mark processing quickly to avoid double work.
3. Emit heartbeat by status updates at least every 30s.
4. Upload artifacts to studio-assets.
5. Write result_url and final status.

## Retry Rules (Current)
1. Transient network/poll issues: app retries with backoff.
2. Hard worker failure: app writes dead letter and stops the stage.
3. Dead-letter replay can be manually triggered in future UI.

## Security Rules
1. Do not use service role key in frontend runtime.
2. Worker or server-only process should perform privileged writes.
3. Frontend should use anon key + RLS-safe operations.
