import { Receiver } from './receiver';
import { RxStatus } from './types';

export class Engine {
  private receivers: Map<string, Receiver>;

  constructor() {
    this.receivers = new Map<string, Receiver>();
  }

  async addReceiver(
    id: string,
    whepUrl: URL,
    srtUrl: URL,
    mockSpawn?: any
  ): Promise<Receiver> {
    if (this.receivers.get(id)) {
      throw new Error(`A receiver with id ${id} already exists`);
    }
    const receiver = new Receiver(id, whepUrl, srtUrl, mockSpawn);
    this.receivers.set(id, receiver);
    return receiver;
  }

  async removeReceiver(id: string) {
    const rx = this.receivers.get(id);
    if (rx) {
      if ([RxStatus.STOPPED, RxStatus.FAILED, RxStatus.IDLE].includes(rx.getStatus())) {
        this.receivers.delete(id);
      } else {
        throw new Error(`Failed to remove receiver ${id} as it is active`);
      }
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
