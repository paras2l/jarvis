"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { AppSection } from "@/lib/types";
import { useUiStore } from "@/lib/store";

const navItems: { label: string; section: AppSection }[] = [
  { label: "Dashboard", section: "dashboard" },
  { label: "Command Center", section: "command-center" },
  { label: "Agents", section: "agents" },
  { label: "Research", section: "research" },
  { label: "Memory", section: "memory" },
  { label: "Automation", section: "automation" },
  { label: "Developer", section: "developer" },
  { label: "Settings", section: "settings" }
];

export function LeftSidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside
      className={`panel fixed inset-y-3 left-3 z-30 w-64 rounded-2xl p-4 transition-transform lg:static lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-[115%] lg:translate-x-0"
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Jarvis OS</p>
          <h1 className="text-xl font-semibold">Control Plane</h1>
        </div>
        <button className="rounded-lg px-2 py-1 text-sm lg:hidden" onClick={toggleSidebar}>
          Close
        </button>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const href = `/${item.section}`;
          const active = pathname === href;
          return (
            <a key={item.section} href={href} className="block">
              <motion.div
                whileHover={{ x: 4 }}
                className={`rounded-xl px-3 py-2 text-sm ${
                  active
                    ? "bg-accent/20 text-accent-strong dark:text-teal-200"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {item.label}
              </motion.div>
            </a>
          );
        })}
      </nav>

      <div className="mt-6 rounded-xl border border-dashed border-slate-400/40 p-3 text-xs text-slate-600 dark:text-slate-300">
        Routes through API Gateway and System Bus with real-time synchronization.
      </div>
    </aside>
  );
}
