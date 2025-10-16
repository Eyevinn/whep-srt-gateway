import { Static, Type } from '@sinclair/typebox';

export enum RxStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  STOPPED = 'stopped',
  FAILED = 'failed'
}

export const Rx = Type.Object({
  id: Type.String({ description: 'Receiver ID' }),
  whepUrl: Type.String({ description: 'WHEP url' }),
  srtUrl: Type.String({ description: 'SRT output URL' }),
  status: Type.Enum(RxStatus)
});
export type Rx = Static<typeof Rx>;

export const RxStateChange = Type.Object({
  desired: Type.Enum(RxStatus)
});
export type RxStateChange = Static<typeof RxStateChange>;
