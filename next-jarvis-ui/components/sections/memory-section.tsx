"use client";

import { useEffect, useState } from "react";
import { MemoryRecord } from "@/lib/types";
import { useUiStore } from "@/lib/store";

export function MemorySection() {
  const records = useUiStore((state) => state.memoryRecords);
  const loadMemory = useUiStore((state) => state.loadMemory);
  const saveMemory = useUiStore((state) => state.saveMemory);
  const [editing, setEditing] = useState<MemoryRecord | null>(null);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Stored Knowledge</h3>
        <div className="space-y-2">
          {records.length === 0 ? (
            <p className="text-sm text-slate-500">No records loaded from memory API.</p>
          ) : (
            records.map((record) => (
              <button
                key={record.id}
                className="w-full rounded-lg border px-3 py-2 text-left"
                onClick={() => setEditing(record)}
              >
                <p className="mono text-xs text-slate-500">{record.namespace}</p>
                <p className="font-medium">{record.key}</p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white/60 p-4 dark:bg-slate-900/30">
        <h3 className="mb-3 text-sm font-semibold">Edit Record</h3>
        {editing ? (
          <MemoryEditor
            record={editing}
            onChange={setEditing}
            onSave={async () => {
              await saveMemory(editing);
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">Select a record to edit.</p>
        )}
      </section>
    </div>
  );
}

function MemoryEditor({
  record,
  onChange,
  onSave
}: {
  record: MemoryRecord;
  onChange: (record: MemoryRecord) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Key
        <input
          className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          value={record.key}
          onChange={(event) => onChange({ ...record, key: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        Value
        <textarea
          className="mt-1 min-h-40 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
          value={record.value}
          onChange={(event) => onChange({ ...record, value: event.target.value })}
        />
      </label>
      <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white" onClick={() => void onSave()}>
        Save to Memory API
      </button>
    </div>
  );
}
