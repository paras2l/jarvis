"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/lib/store";

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />;
}

export function RightMonitorPanel() {
  const { metrics, connections, busEvents } = useUiStore((state) => ({
    metrics: state.metrics,
    connections: state.connections,
    busEvents: state.busEvents
  }));

  return (
    <aside className="panel rounded-2xl p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">System Monitor</h2>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span>REST</span>
          <span className="flex items-center gap-2"><Dot ok={connections.restHealthy} />{connections.restHealthy ? "Healthy" : "Degraded"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>WebSocket</span>
          <span className="flex items-center gap-2"><Dot ok={connections.wsConnected} />{connections.wsConnected ? "Connected" : "Disconnected"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Event Stream</span>
          <span className="flex items-center gap-2"><Dot ok={connections.streamConnected} />{connections.streamConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      <div className="my-5 h-px bg-slate-300/30" />

      <div className="space-y-3 text-sm">
        <Metric label="Health Score" value={`${Math.round(metrics.healthScore * 100)}%`} />
        <Metric label="Compute Usage" value={`${metrics.computeUsagePct}%`} />
        <Metric label="API Usage" value={`${metrics.apiUsagePct}%`} />
        <Metric label="Active Tasks" value={`${metrics.activeTasks}`} />
      </div>

      <div className="my-5 h-px bg-slate-300/30" />

      <h3 className="mb-2 text-xs uppercase tracking-wider text-slate-500">Live Bus Events</h3>
      <div className="max-h-72 space-y-2 overflow-auto pr-1 text-xs">
        {busEvents.slice(0, 12).map((event, idx) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            className="rounded-lg border border-slate-300/30 bg-white/40 p-2 dark:bg-slate-900/40"
          >
            <p className="mono text-[11px] text-slate-500">{event.topic}</p>
            <p className="truncate">{event.source}</p>
          </motion.div>
        ))}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-slate-900/40">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="mono text-xs font-semibold">{value}</span>
    </div>
  );
}
