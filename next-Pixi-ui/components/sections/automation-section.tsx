"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/store";

export function AutomationSection() {
  const workflows = useUiStore((state) => state.workflows);
  const loadWorkflows = useUiStore((state) => state.loadWorkflows);
  const toggleWorkflow = useUiStore((state) => state.toggleWorkflow);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  return (
    <div className="space-y-3">
      {workflows.length === 0 ? (
        <div className="rounded-xl border bg-white/60 p-4 text-sm text-slate-500 dark:bg-slate-900/30">
          No workflows received from automation API.
        </div>
      ) : (
        workflows.map((workflow) => (
          <div key={workflow.id} className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{workflow.name}</h3>
                <p className="mono text-xs text-slate-500">{workflow.status}</p>
              </div>
              <button
                className={`rounded-lg px-3 py-1.5 text-sm ${workflow.enabled ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800"}`}
                onClick={() => void toggleWorkflow(workflow.id, !workflow.enabled)}
              >
                {workflow.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
