const request = require('supertest');
const express = require('express');
const resourceRoutes = require('../routes/resources');
const { ResourceLimit, User } = global.testDb;

jest.mock('../config/db', () => global.testDb);

const app = express();
app.use(express.json());
app.use('/resources', resourceRoutes);

describe('Resources Routes', () => {
    it('GET /resource-limits returns defaults if none exist', async () => {
        const res = await request(app).get('/resources/resource-limits').query({ user_id: 1 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ max_cpu: 0, max_gpu: 0, max_memory: 0 });
    });

    it('POST /resource-limits creates a new limit', async () => {
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        const res = await request(app)
            .post('/resources/resource-limits')
            .send({ user_id: 1, max_cpu: 4, max_gpu: 1, max_memory: 16 });
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Resource limit created');
        expect(res.body.resourceLimit.max_cpu).toBe(4);
    });

    it('DELETE /resource-limits removes a limit', async () => {
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        await ResourceLimit.create({ user_id: 1, max_cpu: 4 });
        const res = await request(app)
            .delete('/resources/resource-limits')
            .query({ user_id: 1 });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Resource limit deleted successfully');
    });
});