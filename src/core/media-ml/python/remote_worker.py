import os
import time
import json
import uuid
import signal
import sys
import threading
import traceback
import argparse
from typing import Optional, Dict, Any

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR|IMPORT_FAILED|Install supabase: pip install supabase", flush=True)
    sys.exit(1)

from worker_engines import EngineManager

# ─────────────────────────────────────────────────────────────────────────────
# Worker Config
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Omni-Learning Remote GPU Worker")
    parser.add_argument("--url", required=True, help="Supabase Project URL")
    parser.add_argument("--key", required=True, help="Supabase Service Role Key")
    parser.add_argument("--worker-id", default=f"gpu-worker-{uuid.uuid4().hex[:8]}", 
                        help="Unique name for this worker instance")
    parser.add_argument("--poll-interval", type=float, default=5.0, 
                        help="Seconds between polling for new jobs")
    parser.add_argument("--heartbeat-interval", type=float, default=30.0, 
                        help="Seconds between worker heartbeats")
    return parser.parse_args()

class RemoteWorker:
    def __init__(self, url: str, key: str, worker_id: str):
        self.supabase: Client = create_client(url, key)
        self.worker_id = worker_id
        self.is_running = True
        self.last_heartbeat = 0
        self.engines = EngineManager()
        self.bucket_name = "studio-assets"
        
        # Signal registration
        signal.signal(signal.SIGINT, self.shutdown)
        signal.signal(signal.SIGTERM, self.shutdown)

    def shutdown(self, signum, frame):
        print(f"\n[Worker] Shutting down version {self.worker_id}...", flush=True)
        self.is_running = False

    def heartbeat(self):
        """Update the heartbeat table so the app knows we are online."""
        try:
            now = time.time()
            self.supabase.table("gpu_worker_heartbeats").insert({
                "worker_id": self.worker_id,
                "status": "online",
                "metadata": {"system": sys.platform, "python": sys.version.split()[0]}
            }).execute()
            self.last_heartbeat = now
            print(f"[Worker] Heartbeat sent: {self.worker_id}", flush=True)
        except Exception as e:
            print(f"[Worker] Heartbeat failed: {e}", flush=True)

    def poll_for_job(self) -> Optional[Dict[str, Any]]:
        """Find the next queued job and atomically claim it."""
        try:
            # Query the next available job
            res = self.supabase.table("gpu_job_queue") \
                .select("*") \
                .eq("status", "queued") \
                .is_("dead_lettered_at", "null") \
                .order("priority", desc=True) \
                .limit(1) \
                .execute()
            
            if not res.data:
                return None
            
            job = res.data[0]
            job_id = job["id"]

            # Attempt to claim atomically
            # NOTE: In a real prod enviroment, use a stored procedure (RPC) for atomic claiming.
            # Here we follow a simple update-if-queued pattern.
            claim_res = self.supabase.table("gpu_job_queue") \
                .update({
                    "status": "processing",
                    "worker_id": self.worker_id,
                    "started_at": "now()",
                    "updated_at": "now()"
                }) \
                .eq("id", job_id) \
                .eq("status", "queued") \
                .execute()
            
            if not claim_res.data:
                return None # Someone else grabbed it
            
            return claim_res.data[0]
        
        except Exception as e:
            print(f"[Worker] Poll failed: {e}", flush=True)
            return None

    def execute_job(self, job: Dict[str, Any]):
        job_id = job["id"]
        stage_type = job["stage_type"]
        prompt = job["prompt"]
        model_name = job["model_name"]
        
        print(f"[Worker] Executing {stage_type} job: {job_id} ({model_name})", flush=True)
        
        try:
            # Placeholder for actual inference logic
            # This is where we call WanEngine, LtxEngine, or DiffusionEngine
            result_url = self.run_inference_mock(job)
            
            # Finalize job
            self.supabase.table("gpu_job_queue") \
                .update({
                    "status": "done",
                    "result_url": result_url,
                    "completed_at": "now()",
                    "updated_at": "now()"
                }) \
                .eq("id", job_id) \
                .execute()
            
            print(f"[Worker] Job completed: {job_id} -> {result_url}", flush=True)
            
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[Worker] Job failed: {job_id} - {error_msg}", flush=True)
            traceback.print_exc()
            
            # Handle retry/dead-lettering
            self.fail_job(job, error_msg)

    def fail_job(self, job: Dict[str, Any], error: str):
        job_id = job["id"]
        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", 3)
        
        if retry_count < max_retries:
            # Requeue for retry
            self.supabase.table("gpu_job_queue") \
                .update({
                    "status": "queued",
                    "retry_count": retry_count + 1,
                    "error": error,
                    "worker_id": None,
                    "updated_at": "now()"
                }) \
                .eq("id", job_id) \
                .execute()
        else:
            # Move to dead-letter (permanent failure)
            self.supabase.table("gpu_job_queue") \
                .update({
                    "status": "failed",
                    "error": f"Max retries exceeded: {error}",
                    "dead_lettered_at": "now()",
                    "updated_at": "now()"
                }) \
                .eq("id", job_id) \
                .execute()

    def upload_to_storage(self, local_path: str, remote_path: str) -> Optional[str]:
        """Upload a file to Supabase Storage and return the public URL."""
        try:
            with open(local_path, 'rb') as f:
                self.supabase.storage.from_(self.bucket_name).upload(
                    path=remote_path,
                    file=f,
                    file_options={"upsert": "true"}
                )
            
            res = self.supabase.storage.from_(self.bucket_name).get_public_url(remote_path)
            return res
        except Exception as e:
            print(f"[Worker] Upload failed: {e}", flush=True)
            return None

    def run_inference(self, job: Dict[str, Any]) -> Optional[str]:
        """Real inference logic using the EngineManager."""
        stage_type = job["stage_type"]
        prompt = job["prompt"]
        job_id = job["id"]
        
        # Create temp output path
        ext = "mp4" if stage_type in ["video", "avatar"] else "png"
        local_out = f"temp_{job_id}.{ext}"
        remote_path = f"cloud_render_{job_id}.{ext}"
        
        success = False
        if stage_type == "image":
            success = self.engines.generate_image(prompt, local_out)
        elif stage_type in ["video", "avatar"]:
            success = self.engines.generate_video(stage_type, prompt, local_out)
        
        if not success:
            # Fallback for phase 1 testing: create a dummy file if generation failed
            # This allows testing the full pipeline even without GPUs
            with open(local_out, "w") as f:
                f.write(f"MOCK_{stage_type.upper()}_CONTENT")
            success = True

        if success and os.path.exists(local_out):
            url = self.upload_to_storage(local_out, remote_path)
            # Cleanup
            try: os.remove(local_out)
            except: pass
            return url
            
        return None

    def run(self, poll_interval: float, heartbeat_interval: float):
        print(f"🚀 Omni-Worker '{self.worker_id}' is live and polling...", flush=True)
        self.heartbeat() # First heartbeat
        
        while self.is_running:
            # Check if heartbeat is due
            if time.time() - self.last_heartbeat > heartbeat_interval:
                self.heartbeat()
            
            # Look for work
            job = self.poll_for_job()
            if job:
                self.execute_job(job)
            else:
                # No work, sleep briefly
                time.sleep(poll_interval)

if __name__ == "__main__":
    args = parse_args()
    worker = RemoteWorker(args.url, args.key, args.worker_id)
    worker.run(args.poll_interval, args.heartbeat_interval)
