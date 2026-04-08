"use client";

import { ChangeEvent } from "react";
import { reconfigureApiGateway, useUiStore } from "@/lib/store";

export function SettingsSection() {
  const settings = useUiStore((state) => state.settings);
  const setTheme = useUiStore((state) => state.setTheme);

  const update = (field: keyof typeof settings) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    useUiStore.setState((state) => ({
      settings: {
        ...state.settings,
        [field]: value
      }
    }));

    if (field === "apiGatewayUrl") {
      reconfigureApiGateway(value);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Model + API Configuration</h3>
        <div className="space-y-3">
          <Field label="Model">
            <select className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" value={settings.model} onChange={update("model")}>
              <option value="gpt-5.3-codex">gpt-5.3-codex</option>
              <option value="gpt-5.1">gpt-5.1</option>
              <option value="local-llm">local-llm</option>
            </select>
          </Field>
          <Field label="API Gateway URL">
            <input className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" value={settings.apiGatewayUrl} onChange={update("apiGatewayUrl")} />
          </Field>
          <Field label="WebSocket URL">
            <input className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" value={settings.websocketUrl} onChange={update("websocketUrl")} />
          </Field>
          <Field label="Event Stream URL">
            <input className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" value={settings.eventStreamUrl} onChange={update("eventStreamUrl")} />
          </Field>
          <Field label="API Key">
            <input className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm" value={settings.apiKeyMasked} onChange={update("apiKeyMasked")} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Interface Preferences</h3>
        <div className="space-y-3">
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => setTheme(settings.theme === "dark" ? "light" : "dark")}
          >
            Switch to {settings.theme === "dark" ? "Light" : "Dark"} Mode
          </button>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Theme and endpoint settings are applied instantly and keep the panel synchronized with backend services.
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
