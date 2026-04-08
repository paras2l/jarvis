import { BusEvent } from "@/lib/types";

type EventHandler = (event: BusEvent) => void;
type ConnectionHandler = (connected: boolean) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private eventSource: EventSource | null = null;

  constructor(
    private readonly wsUrl: string,
    private readonly streamUrl: string,
    private readonly onEvent: EventHandler,
    private readonly onWsConnection: ConnectionHandler,
    private readonly onStreamConnection: ConnectionHandler
  ) {}

  connect(): void {
    this.connectWebSocket();
    this.connectEventStream();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.onWsConnection(false);
    this.onStreamConnection(false);
  }

  private connectWebSocket(): void {
    try {
      this.socket = new WebSocket(this.wsUrl);
      this.socket.onopen = () => this.onWsConnection(true);
      this.socket.onclose = () => this.onWsConnection(false);
      this.socket.onerror = () => this.onWsConnection(false);
      this.socket.onmessage = (message) => {
        const parsed = JSON.parse(message.data) as BusEvent;
        this.onEvent(parsed);
      };
    } catch {
      this.onWsConnection(false);
    }
  }

  private connectEventStream(): void {
    try {
      this.eventSource = new EventSource(this.streamUrl);
      this.eventSource.onopen = () => this.onStreamConnection(true);
      this.eventSource.onerror = () => this.onStreamConnection(false);
      this.eventSource.onmessage = (message) => {
        const parsed = JSON.parse(message.data) as BusEvent;
        this.onEvent(parsed);
      };
    } catch {
      this.onStreamConnection(false);
    }
  }
}
