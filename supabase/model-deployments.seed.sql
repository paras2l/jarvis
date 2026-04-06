-- Seed example model deployment rows for gpu-worker function.
-- Replace endpoint URLs and secret names with your real deployment values.

insert into public.model_deployments (
  stage_type,
  model_name,
  endpoint,
  auth_mode,
  auth_secret_name,
  concurrency_limit,
  timeout_ms,
  active,
  metadata
)
values
  (
    'image',
    'sdxl-turbo',
    'https://your-image-worker.example.com/run',
    'bearer',
    'IMAGE_WORKER_BEARER_TOKEN',
    4,
    180000,
    true,
    jsonb_build_object('provider', 'runpod', 'tier', 'draft')
  ),
  (
    'video',
    'ltx-video-fast',
    'https://your-video-worker.example.com/run',
    'bearer',
    'VIDEO_WORKER_BEARER_TOKEN',
    2,
    240000,
    true,
    jsonb_build_object('provider', 'fal', 'tier', 'draft')
  ),
  (
    'video',
    'wan-v1',
    'https://your-video-worker.example.com/run',
    'bearer',
    'VIDEO_WORKER_BEARER_TOKEN',
    2,
    420000,
    true,
    jsonb_build_object('provider', 'runpod', 'tier', 'standard')
  ),
  (
    'video',
    'wan-v2',
    'https://your-video-worker.example.com/run',
    'bearer',
    'VIDEO_WORKER_BEARER_TOKEN',
    1,
    600000,
    true,
    jsonb_build_object('provider', 'runpod', 'tier', 'premium')
  )
on conflict do nothing;
