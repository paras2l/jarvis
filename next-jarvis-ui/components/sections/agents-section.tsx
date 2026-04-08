"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/lib/store";

export function AgentsSection() {
  const agents = useUiStore((state) => state.agents);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Active Agents</h3>
        <div className="space-y-2">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-lg border px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{agent.role}</p>
                <p className="mono text-xs">{agent.status}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{agent.task}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Swarm Activity</h3>
        <div className="space-y-3 text-sm">
          {[
            "Swarm run started: strategy exploration",
            "Consensus engine comparing outputs",
            "Winner selected: planner-specialist",
            "Result persisted to swarm memory"
          ].map((line, idx) => (
            <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.09 }}>
              • {line}
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
