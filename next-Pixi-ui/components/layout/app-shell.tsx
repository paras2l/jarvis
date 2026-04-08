"use client";

import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { RightMonitorPanel } from "@/components/layout/right-monitor-panel";
import { AppSection } from "@/lib/types";
import { useUiStore } from "@/lib/store";
import { SectionRenderer } from "@/components/sections/section-renderer";

export function AppShell({ section }: { section: AppSection }) {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleRightPanel = useUiStore((state) => state.toggleRightPanel);
  const rightPanelOpen = useUiStore((state) => state.rightPanelOpen);

  return (
    <RealtimeProvider>
      <div className="min-h-screen p-3 lg:p-4">
        <LeftSidebar />

        <div className="mx-auto grid max-w-[1800px] gap-3 lg:grid-cols-[250px_1fr_330px]">
          <div className="hidden lg:block" />

          <main className="panel rounded-2xl p-4 sm:p-6">
            <header className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pixi Interface</p>
                <h2 className="text-xl font-semibold">{section.replace("-", " ")}</h2>
              </div>
              <div className="flex gap-2 lg:hidden">
                <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={toggleSidebar}>
                  Menu
                </button>
                <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={toggleRightPanel}>
                  Monitor
                </button>
              </div>
            </header>
            <SectionRenderer section={section} />
          </main>

          <div className={`${rightPanelOpen ? "block" : "hidden"} lg:block`}>
            <RightMonitorPanel />
          </div>
        </div>
      </div>
    </RealtimeProvider>
  );
}

