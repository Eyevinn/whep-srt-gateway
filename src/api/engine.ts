import { FastifyPluginCallback } from 'fastify';
import { Type } from '@sinclair/typebox';

import { Engine } from '../engine';
import { Rx, RxStatus, RxStateChange } from '../types';

export interface ApiEngineOpts {
  engine: Engine;
  apiKey?: string;
}

const ParamsId = Type.Object({
  id: Type.String({
    description: 'Receiver ID'
  })
});

const apiEngine: FastifyPluginCallback<ApiEngineOpts> = (fastify, opts, next) => {
  let apiKey = '';
  if (opts.apiKey) {
    apiKey = opts.apiKey;
  }

  fastify.addHook('preHandler', async (request, reply) => {
    if (apiKey) {
      if (request.headers['x-api-key'] !== apiKey) {
        reply.code(403).send({ message: 'Invalid API-key provided' });
      }
    }
  });

  fastify.get<{ Reply: Rx[] | string }>(
    '/rx',
    {
      schema: {
        description: 'List all available receivers',
        response: {
          200: Type.Array(Rx),
          500: Type.String({ description: 'Error message' })
        }
      }
    },
    async (request, reply) => {
      try {
        const receivers = opts.engine.getAllReceivers();
        const body: Rx[] = [];
        receivers.forEach((rx) => {
          body.push(rx.getObject());
        });
        reply.status(200).send(body);
      } catch (e) {
        console.error(e);
        reply.code(500).send('Exception thrown when trying to list all receivers');
      }
    }
  );

  fastify.get<{ Params: { id: string }; Reply: Rx | string }>(
    '/rx/:id',
    {
      schema: {
        description: 'Obtain a receiver resource for an ID',
        params: ParamsId,
        response: {
          200: Rx,
          500: Type.String({ description: 'Error message' })
        }
      }
    },
    async (request, reply) => {
      try {
        const id = request.params.id;
        const rx = opts.engine.getReceiver(id);
        if (!rx) {
          reply.code(404).send(`No receiver with id ${id} was found`);
          return;
        }
        reply.code(200).send(rx.getObject());
      } catch (e) {
        console.error(e);
        reply.code(500).send('Exception thrown when trying to get a receiver');
      }
    }
  );

  fastify.delete<{ Params: { id: string }; Reply: string }>(
    '/rx/:id',
    {
      schema: {
        description: 'Remove a receiver for an ID',
        params: ParamsId,
        response: {
          500: Type.String({ description: 'Error message' })
        }
      }
    },
    async (request, reply) => {
      try {
        const id = request.params.id;
        await opts.engine.removeReceiver(id);
        reply.code(204).send();
      } catch (e) {
        const error = e as Error;
        console.error(e);
        reply.code(400).send(error.message || 'Exception thrown when trying to delete a receiver');
      }
    }
  );

  fastify.post<{ Body: Rx; Reply: string }>(
    '/rx',
    {
      schema: {
        description: 'Create a receiver',
        body: Rx,
        response: {
          201: Type.String(),
          500: Type.String({ description: 'Error message' })
        }
      }
    },
    async (request, reply) => {
      try {
        const rxObject = request.body;
        await opts.engine.addReceiver(
          rxObject.id,
          new URL(rxObject.whepUrl),
          new URL(rxObject.srtUrl)
        );

        reply.code(201).send('created');
      } catch (e) {
        console.error(e);
        reply.code(500).send('Exception thrown when trying to add a new receiver');
      }
    }
  );

  fastify.put<{ Params: { id: string }; Body: RxStateChange; Reply: string }>(
    '/rx/:id/state',
    {
      schema: {
        description: 'Change state of a receiver',
        params: ParamsId,
        body: RxStateChange,
        response: {
          200: Type.String(),
          400: Type.String({ description: 'bad request message' }),
          500: Type.String()
        }
      }
    },
    async (request, reply) => {
      try {
        const id = request.params.id;
        const rx = opts.engine.getReceiver(id);
        if (!rx) {
          reply.code(404).send(`No receiver with id ${id} was found`);
          return;
        }
        if (request.body.desired === RxStatus.RUNNING) {
          await rx.start();
          reply.code(200).send('Receiver started');
        } else if (request.body.desired === RxStatus.STOPPED) {
          await rx.stop({ doAwait: true });
          reply.code(200).send('Receiver stopped');
        } else {
          reply.code(400).send('Invalid desired state provided');
        }
      } catch (e) {
        console.error(e);
        reply.code(500).send('Exception thrown when trying to change state of a receiver');
      }
    }
  );

  next();
};

export default apiEngine;
