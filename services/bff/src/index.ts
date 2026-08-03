import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import * as grafana from './grafana';
import Redis from 'ioredis';

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

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required.');
}

if (!N8N_WEBHOOK_SECRET) {
    throw new Error('N8N_WEBHOOK_SECRET is required.');
}

// Redis
const redis = new Redis(REDIS_URL);

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
        // Mock Login: In real world, validate against a DB or LDAP
        const { username, password } = req.body;
        if (username === 'admin' && password === 'admin') { // Simple mock
            const token = api.jwt.sign({ user: username });
            return { accessToken: token, refreshToken: 'mock_refresh_token' };
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
            req.log.error({ msg: "Request failed", err: e.message, response: e.response?.data, status: e.response?.status });
            reply.code(500).send({ error: e.message, details: e.response?.data });
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
            req.log.error({ msg: "Request failed", err: e.message, response: e.response?.data, status: e.response?.status });
            reply.code(500).send({ error: e.message, details: e.response?.data });
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
            req.log.error({ msg: "Request failed", err: e.message, response: e.response?.data, status: e.response?.status });
            reply.code(500).send({ error: e.message, details: e.response?.data });
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
