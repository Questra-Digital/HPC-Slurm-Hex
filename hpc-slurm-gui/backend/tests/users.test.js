const request = require('supertest');
const express = require('express');
const userRoutes = require('../routes/users');
const { User, Group, UserGroup } = global.testDb;
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use('/users', userRoutes);

describe('Users Routes', () => {


    it('POST /groups creates a new group', async () => {
        const res = await request(app)
            .post('/users/groups')
            .send({ name: 'testgroup' });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('testgroup');
    });

    it('POST /user-groups adds user to group', async () => {
        await User.create({ username: 'test', email: 'test@test.com', password_hash: 'hash', role: 'user' });
        await Group.create({ name: 'testgroup' });
        const res = await request(app)
            .post('/users/user-groups')
            .send({ user_id: 1, group_id: 1 });
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('User added to group successfully');
    });
});