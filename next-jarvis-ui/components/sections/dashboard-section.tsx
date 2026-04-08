"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/lib/store";

const cards = [
  { key: "agentCount", label: "Agents" },
  { key: "computeUsagePct", label: "Compute" },
  { key: "apiUsagePct", label: "API Usage" },
  { key: "activeTasks", label: "Active Tasks" }
] as const;

export function DashboardSection() {
  const metrics = useUiStore((state) => state.metrics);
  const agents = useUiStore((state) => state.agents);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {card.key === "computeUsagePct" || card.key === "apiUsagePct"
                ? `${metrics[card.key]}%`
                : metrics[card.key]}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Active Agent Health</h3>
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{agent.role}</span>
              <span className="mono text-xs">{agent.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
