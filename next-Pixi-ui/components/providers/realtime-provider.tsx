"use client";

import { useEffect } from "react";
import { RealtimeClient } from "@/lib/realtime-client";
import { useUiStore } from "@/lib/store";

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const settings = useUiStore((state) => state.settings);
  const appendBusEvent = useUiStore((state) => state.appendBusEvent);
  const setConnections = useUiStore((state) => state.setConnections);

  useEffect(() => {
    const realtime = new RealtimeClient(
      settings.websocketUrl,
      settings.eventStreamUrl,
      (event) => appendBusEvent(event),
      (connected) => setConnections({ wsConnected: connected }),
      (connected) => setConnections({ streamConnected: connected })
    );

    realtime.connect();
    return () => realtime.disconnect();
  }, [appendBusEvent, setConnections, settings.eventStreamUrl, settings.websocketUrl]);

  return <>{children}</>;
}
