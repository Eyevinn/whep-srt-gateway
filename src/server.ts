import path from 'path';
import fastifyStatic from '@fastify/static';
import { Engine } from './engine';
import { logger } from './util/logger';
import Api from './api';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const API_KEY = process.env.API_KEY;

async function main() {
  const engine = new Engine();

  const api = Api({
    engine,
    apiKey: API_KEY
  });

  api.register(fastifyStatic, {
    root: path.join(__dirname, 'ui'),
    prefix: '/ui/'
  });

  api.get('/ui/', (req, reply) => {
    reply.sendFile('index.html');
  });

  try {
    await api.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`WHEP SRT Gateway is listening on port ${PORT}`);
    logger.info(`API documentation available at http://localhost:${PORT}/api/docs`);
    logger.info(`Web UI available at http://localhost:${PORT}/ui`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
