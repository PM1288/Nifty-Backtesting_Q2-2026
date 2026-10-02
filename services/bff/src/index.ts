import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import * as grafana from './grafana';
import Redis from 'ioredis';
import { createHash, timingSafeEqual } from 'node:crypto';

// Type augmentation
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: any;
    }
}

const fastify = Fastify({ logger: true });

// Env
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;
const LOGIN_USERNAME = process.env.BFF_LOGIN_USERNAME;
const LOGIN_PASSWORD = process.env.BFF_LOGIN_PASSWORD;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required.');
}

if (!N8N_WEBHOOK_SECRET) {
    throw new Error('N8N_WEBHOOK_SECRET is required.');
}
if (!LOGIN_USERNAME || !LOGIN_PASSWORD || LOGIN_PASSWORD.length < 32) {
    throw new Error('BFF_LOGIN_USERNAME and a BFF_LOGIN_PASSWORD of at least 32 characters are required.');
}
const loginDigest = createHash('sha256').update(`${LOGIN_USERNAME}\0${LOGIN_PASSWORD}`).digest();

// Redis
const redis = new Redis(REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 3000 });
redis.on('error', () => fastify.log.warn('Redis cache unavailable'));

// Plugins
fastify.register(cors);
fastify.register(jwt, {
    secret: JWT_SECRET
});

// Auth Decorator
fastify.decorate("authenticate", async function (request: any, reply: any) {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.send(err);
    }
});

// Routes
fastify.get('/health', async () => {
    return { status: 'ok' };
});

// Mobile V1 API
fastify.register(async (api, opts) => {

    // Auth Login
    api.post('/auth/login', async (req: any, reply) => {
        const { username, password } = req.body ?? {};
        if (typeof username !== 'string' || typeof password !== 'string') {
            return reply.code(400).send({ error: 'Username and password are required' });
        }
        const digest = createHash('sha256').update(`${username}\0${password}`).digest();
        if (timingSafeEqual(digest, loginDigest)) {
            const token = api.jwt.sign({ user: username }, { expiresIn: '1h' });
            return { accessToken: token, expiresIn: 3600 };
        }
        reply.code(401).send({ error: 'Invalid credentials' });
    });

    // Search Dashboards
    api.get('/search', { onRequest: [api.authenticate] }, async (req: any, reply) => {
        try {
            const { query, folderUIDs } = req.query as any;
            const data = await grafana.searchDashboards(query, folderUIDs);
            return data;
        } catch (e: any) {
            req.log.error({ msg: "Upstream request failed", status: e.response?.status });
            reply.code(502).send({ error: "Upstream service is unavailable" });
        }
    });

    // Get Dashboard
    api.get('/dashboards/:uid', { onRequest: [api.authenticate] }, async (req: any, reply) => {
        try {
            const { uid } = req.params as any;
            const dashboard = await grafana.getDashboard(uid);
            // Translator logic would go here
            // For MVP, returning raw dashboard model + simplified one
            return dashboard;
        } catch (e: any) {
            req.log.error({ msg: "Upstream request failed", status: e.response?.status });
            reply.code(502).send({ error: "Upstream service is unavailable" });
        }
    });

    // Query Data
    api.post('/query', { onRequest: [api.authenticate] }, async (req: any, reply) => {
        try {
            const body = req.body;
            // Caching logic
            const cacheKey = `query:${JSON.stringify(body)}`;
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            const data = await grafana.queryDataSource(body);

            // Cache for 2 seconds
            await redis.set(cacheKey, JSON.stringify(data), 'EX', 2);

            return data;
        } catch (e: any) {
            req.log.error({ msg: "Upstream request failed", status: e.response?.status });
            reply.code(502).send({ error: "Upstream service is unavailable" });
        }
    });

    // Notifications Ingest (from n8n)
    api.post('/notify/ingest', async (req: any, reply) => {
        const secret = req.headers['x-n8n-secret'];
        if (secret !== N8N_WEBHOOK_SECRET) {
            return reply.code(403).send({ error: 'Unauthorized' });
        }

        const { title, body, severity } = req.body;
        // Trigger FCM here
        // ...
        req.log.info({ msg: "Notification received", title, body });
        return { status: 'queued' };
    });

}, { prefix: '/api/mobile/v1' });

const start = async () => {
    try {
        await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
        console.log(`Server listening on ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
