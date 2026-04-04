const request = require('supertest');
const express = require('express');
const userRoutes = require('../routes/users');
const { User, Group, UserGroup } = global.testDb;
const bcrypt = require('bcryptjs');

const buildApp = (auth = null) => {
    const app = express();
    app.use(express.json());

    if (auth) {
        app.use((req, res, next) => {
            req.auth = auth;
            next();
        });
    }

    app.use('/users', userRoutes);
    return app;
};

describe('Users Routes', () => {
    const adminAuth = { userId: 1, role: 'admin' };


    it('POST /groups creates a new group', async () => {
        const app = buildApp(adminAuth);
        const res = await request(app)
            .post('/users/groups')
            .send({ name: 'testgroup' });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('testgroup');
    });

    it('POST /user-groups adds user to group', async () => {
        const app = buildApp(adminAuth);
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        await Group.create({ name: 'testgroup' });
        const res = await request(app)
            .post('/users/user-groups')
            .send({ user_id: 1, group_id: 1 });
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('User added to group successfully');
    });

    it('POST /groups rejects unauthenticated request', async () => {
        const app = buildApp();
        const res = await request(app)
            .post('/users/groups')
            .send({ name: 'testgroup' });

        expect(res.status).toBe(401);
    });
});