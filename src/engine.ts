import { Receiver } from './receiver';
import { RxStatus } from './types';

export class Engine {
  private receivers: Map<string, Receiver>;
  private pendingReceivers: Set<string>;

  constructor() {
    this.receivers = new Map<string, Receiver>();
    this.pendingReceivers = new Set<string>();
  }

  async addReceiver(id: string, whepUrl: URL, srtUrl: URL, mockSpawn?: any): Promise<Receiver> {
    // Check if receiver already exists or is being created
    if (this.receivers.has(id)) {
      throw new Error(`A receiver with id ${id} already exists`);
    }
    if (this.pendingReceivers.has(id)) {
      throw new Error(`A receiver with id ${id} is already being created`);
    }

    // Mark this receiver as pending to prevent concurrent creation
    this.pendingReceivers.add(id);

    try {
      // Create new receiver
      const receiver = new Receiver(id, whepUrl, srtUrl, mockSpawn);
      this.receivers.set(id, receiver);
      return receiver;
    } finally {
      // Always remove from pending set, even if creation fails
      this.pendingReceivers.delete(id);
    }
  }

  async removeReceiver(id: string) {
    const rx = this.receivers.get(id);
    if (rx) {
      // Dispose the receiver first - this acquires the mutex and ensures:
      // 1. Any in-progress start/stop operations complete
      // 2. Any pending restart timers are cancelled
      // 3. Any running process is stopped
      // This prevents race conditions where a process could be spawned after deletion
      await rx.dispose();
      this.receivers.delete(id);
    }
  }

  getReceiver(id: string): Receiver | undefined {
    const rx = this.receivers.get(id);
    return rx;
  }

  getAllReceivers(): Receiver[] {
    const receivers: Receiver[] = [];
    this.receivers.forEach((rx) => receivers.push(rx));
    return receivers;
  }

  removeAllReceivers(): void {
    this.receivers.clear();
  }
}
