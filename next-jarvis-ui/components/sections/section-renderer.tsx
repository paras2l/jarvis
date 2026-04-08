"use client";

import { DashboardSection } from "@/components/sections/dashboard-section";
import { CommandCenterSection } from "@/components/sections/command-center-section";
import { AgentsSection } from "@/components/sections/agents-section";
import { ResearchSection } from "@/components/sections/research-section";
import { MemorySection } from "@/components/sections/memory-section";
import { AutomationSection } from "@/components/sections/automation-section";
import { DeveloperSection } from "@/components/sections/developer-section";
import { SettingsSection } from "@/components/sections/settings-section";
import { AppSection } from "@/lib/types";

export function SectionRenderer({ section }: { section: AppSection }) {
  if (section === "dashboard") return <DashboardSection />;
  if (section === "command-center") return <CommandCenterSection />;
  if (section === "agents") return <AgentsSection />;
  if (section === "research") return <ResearchSection />;
  if (section === "memory") return <MemorySection />;
  if (section === "automation") return <AutomationSection />;
  if (section === "developer") return <DeveloperSection />;
  return <SettingsSection />;
}
