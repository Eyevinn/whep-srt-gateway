import { FastifyPluginCallback } from 'fastify';
import { Type } from '@sinclair/typebox';

const apiHealthcheck: FastifyPluginCallback = (fastify, opts, next) => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Health check',
        response: {
          200: Type.Object({
            health: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      reply.code(200).send({ health: 'ok' });
    }
  );
  next();
};

export default apiHealthcheck;
