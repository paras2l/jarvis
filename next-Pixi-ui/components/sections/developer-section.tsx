"use client";

import { useUiStore } from "@/lib/store";

export function DeveloperSection() {
  const logs = useUiStore((state) => state.logs);
  const busEvents = useUiStore((state) => state.busEvents);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Runtime Logs</h3>
        <div className="mono max-h-[55vh] space-y-1 overflow-auto rounded-lg border bg-slate-50 p-3 text-xs dark:bg-slate-950/70">
          {logs.map((line, idx) => (
            <p key={`${line}-${idx}`}>{line}</p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">System Bus Traffic</h3>
        <div className="max-h-[55vh] space-y-2 overflow-auto pr-1 text-xs">
          {busEvents.map((event) => (
            <div key={event.id} className="rounded-lg border p-2">
              <p className="mono text-[11px] text-slate-500">{event.timestamp}</p>
              <p>{event.topic}</p>
              <p className="text-slate-500">{event.source}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
