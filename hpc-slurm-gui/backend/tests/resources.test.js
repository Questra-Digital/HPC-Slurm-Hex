const request = require('supertest');
const express = require('express');
const resourceRoutes = require('../routes/resources');
const { ResourceLimit, User } = global.testDb;

jest.mock('../config/db', () => global.testDb);

const buildApp = (auth = null) => {
    const app = express();
    app.use(express.json());

    if (auth) {
        app.use((req, res, next) => {
            req.auth = auth;
            next();
        });
    }

    app.use('/resources', resourceRoutes);
    return app;
};

describe('Resources Routes', () => {
    const adminAuth = { userId: 1, role: 'admin' };
    const userAuth = { userId: 1, role: 'user' };

    it('GET /resource-limits returns defaults if none exist', async () => {
        const app = buildApp(userAuth);
        const res = await request(app).get('/resources/resource-limits').query({ user_id: 1 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ max_cpu: 0, max_gpu: 0, max_memory: 0 });
    });

    it('POST /resource-limits creates a new limit', async () => {
        const app = buildApp(adminAuth);
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        const res = await request(app)
            .post('/resources/resource-limits')
            .send({ user_id: 1, max_cpu: 4, max_gpu: 1, max_memory: 16 });
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Resource limit created');
        expect(res.body.resourceLimit.max_cpu).toBe(4);
    });

    it('DELETE /resource-limits removes a limit', async () => {
        const app = buildApp(adminAuth);
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        await ResourceLimit.create({ user_id: 1, max_cpu: 4 });
        const res = await request(app)
            .delete('/resources/resource-limits')
            .query({ user_id: 1 });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Resource limit deleted successfully');
    });

    it('POST /resource-limits blocks non-admin users', async () => {
        const app = buildApp(userAuth);
        const res = await request(app)
            .post('/resources/resource-limits')
            .send({ user_id: 1, max_cpu: 4, max_gpu: 1, max_memory: 16 });

        expect(res.status).toBe(403);
    });
});