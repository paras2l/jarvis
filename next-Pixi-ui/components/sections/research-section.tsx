"use client";

import { motion } from "framer-motion";
import { useUiStore } from "@/lib/store";

export function ResearchSection() {
  const discoveries = useUiStore((state) => state.discoveries);

  return (
    <div className="space-y-3">
      {discoveries.map((item, idx) => (
        <motion.article
          key={item.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{item.title}</h3>
            <span className="mono text-xs">{Math.round(item.confidence * 100)}%</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.summary}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Source: {item.source}</p>
        </motion.article>
      ))}
    </div>
  );
}
