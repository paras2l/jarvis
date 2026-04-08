"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useUiStore } from "@/lib/store";

export function CommandCenterSection() {
  const [input, setInput] = useState("");
  const messages = useUiStore((state) => state.commandMessages);
  const sendCommand = useUiStore((state) => state.sendCommand);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) {
      return;
    }
    setInput("");
    await sendCommand(text);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Natural Language Command Interface</h3>

        <div className="mb-4 max-h-[52vh] space-y-3 overflow-auto pr-1">
          {messages.map((msg) => (
            <motion.article
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-3 ${msg.role === "user" ? "bg-cyan-50 dark:bg-cyan-900/20" : "bg-white dark:bg-slate-950/40"}`}
            >
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{msg.role}</p>
              <p className="text-sm leading-relaxed">{msg.content}</p>
            </motion.article>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jarvis to reason, plan, research, or execute..."
          />
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white" type="submit">
            Send
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
          <h4 className="mb-2 text-sm font-semibold">Reasoning Steps</h4>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {(messages[messages.length - 1]?.reasoningSteps || ["Awaiting new inference cycle"]).map((step, idx) => (
              <li key={idx}>• {step}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
          <h4 className="mb-2 text-sm font-semibold">Agent Activity</h4>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {(messages[messages.length - 1]?.agentActivity || ["No active swarm task"]).map((item, idx) => (
              <li key={idx}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
