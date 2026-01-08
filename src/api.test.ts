import MockSpawn from 'mock-spawn';

import api from './api';
import { Engine } from './engine';
import { RxStatus } from './types';

describe('API', () => {
  // Track all timers for cleanup
  const timers: NodeJS.Timeout[] = [];

  afterEach(() => {
    // Clear all timers
    timers.forEach((t) => clearTimeout(t));
    timers.length = 0;
  });
  test('returns healthcheck response on /health', async () => {
    const engine = new Engine();
    const app = api({ engine });
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(response.statusCode).toEqual(200);
    const body = await response.json();
    expect(body.health).toEqual('ok');
  });

  test('can return a list of all receivers', async () => {
    const engine = new Engine();
    const app = api({ engine });
    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/rx'
    });
    expect(response.statusCode).toEqual(200);
    let body = await response.json();
    expect(body).toEqual([]);

    await engine.addReceiver(
      'test-rx',
      new URL('http://whep/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener')
    );
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/rx'
    });
    expect(response.statusCode).toEqual(200);
    body = await response.json();
    expect(body.length).toEqual(1);
    expect(body[0].id).toEqual('test-rx');
    expect(body[0].whepUrl).toEqual('http://whep/dummy');
    expect(body[0].srtUrl).toEqual('srt://0.0.0.0:9000?mode=listener');
    expect(body[0].status).toEqual(RxStatus.IDLE);
  });

  test('can create a new receiver', async () => {
    const engine = new Engine();
    const mockSpawn = MockSpawn();
    mockSpawn.setDefault((cb: (code: number) => void) => {
      const t = setTimeout(() => {
        return cb(1);
      }, 10000);
      timers.push(t);
      return t;
    });
    mockSpawn.setSignals({ SIGKILL: true });

    // Add receiver with mock spawner first
    await engine.addReceiver(
      'rx-1',
      new URL('http://whep/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener'),
      mockSpawn
    );

    expect(engine.getAllReceivers().length).toEqual(1);

    // Clean up
    const rx = engine.getReceiver('rx-1');
    if (rx) {
      await rx.stop({ doAwait: true });
    }
  });

  test('can return a specific receiver', async () => {
    const engine = new Engine();
    const app = api({ engine });
    await engine.addReceiver(
      'rx-test',
      new URL('http://whep/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener')
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/rx/rx-test'
    });
    expect(response.statusCode).toEqual(200);
    const body = await response.json();
    expect(body.id).toEqual('rx-test');
    expect(body.whepUrl).toEqual('http://whep/dummy');
    expect(body.srtUrl).toEqual('srt://0.0.0.0:9000?mode=listener');
  });

  test('can delete a receiver', async () => {
    const engine = new Engine();
    const app = api({ engine });
    await engine.addReceiver(
      'rx-delete',
      new URL('http://whep/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener')
    );
    expect(engine.getReceiver('rx-delete')).toBeDefined();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/rx/rx-delete'
    });
    expect(response.statusCode).toEqual(204);
    const rx = engine.getReceiver('rx-delete');
    expect(rx).toBeUndefined();
  });

  test('provides swagger documentation', async () => {
    const engine = new Engine();
    const app = api({ engine });
    const response = await app.inject({
      method: 'GET',
      url: '/api/docs'
    });
    expect(response.statusCode).toEqual(302);
  });

  test('can start a receiver', async () => {
    const engine = new Engine();
    const app = api({ engine });
    const mockSpawn = MockSpawn();
    mockSpawn.setDefault((cb: (code: number) => void) => {
      // Exit 1 after 2 sec
      const t = setTimeout(() => {
        return cb(1);
      }, 2000);
      timers.push(t);
      return t;
    });
    mockSpawn.setSignals({ SIGKILL: true });
    await engine.addReceiver(
      'rx-start',
      new URL('https://whep/channel/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener'),
      mockSpawn
    );
    let response = await app.inject({
      method: 'PUT',
      url: '/api/v1/rx/rx-start/state',
      payload: {
        desired: RxStatus.RUNNING
      }
    });
    expect(response.statusCode).toEqual(200);
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/rx/rx-start'
    });
    const body = await response.json();
    expect(body.status).toEqual(RxStatus.RUNNING);

    // Clean up
    const rx = engine.getReceiver('rx-start');
    if (rx) {
      await rx.stop({ doAwait: true });
    }
  });

  test('can stop a receiver that is active', async () => {
    const engine = new Engine();
    const app = api({ engine });
    const mockSpawn = MockSpawn();
    mockSpawn.setDefault((cb: (code: number) => void) => {
      // Exit 1 after 2 sec
      const t = setTimeout(() => {
        return cb(1);
      }, 2000);
      timers.push(t);
      return t;
    });
    mockSpawn.setSignals({ SIGKILL: true });
    const rx = await engine.addReceiver(
      'rx-stop',
      new URL('https://whep/channel/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener'),
      mockSpawn
    );
    await rx.start();
    let response = await app.inject({
      method: 'PUT',
      url: '/api/v1/rx/rx-stop/state',
      payload: {
        desired: RxStatus.STOPPED
      }
    });
    expect(response.statusCode).toEqual(200);
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/rx/rx-stop'
    });
    const body = await response.json();
    expect(body.status).toEqual(RxStatus.STOPPED);
  });

  test('can delete a receiver that is running (it stops it first)', async () => {
    const engine = new Engine();
    const app = api({ engine });
    const mockSpawn = MockSpawn();
    mockSpawn.setDefault((cb: (code: number) => void) => {
      const t = setTimeout(() => {
        return cb(1);
      }, 2000);
      timers.push(t);
      return t;
    });
    mockSpawn.setSignals({ SIGINT: true, SIGKILL: true });
    const rx = await engine.addReceiver(
      'rx-active',
      new URL('https://whep/channel/dummy'),
      new URL('srt://0.0.0.0:9000?mode=listener'),
      mockSpawn
    );
    await rx.start();
    expect(rx.getStatus()).toEqual('running');

    // Delete should now succeed by stopping the receiver first
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/rx/rx-active'
    });
    expect(response.statusCode).toEqual(204);

    // Receiver should be removed from the engine
    expect(engine.getReceiver('rx-active')).toBeUndefined();
  });
});
