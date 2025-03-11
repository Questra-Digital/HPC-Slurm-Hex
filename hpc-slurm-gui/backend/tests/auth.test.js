const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');
const { User } = global.testDb;
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Auth Routes', () => {
    it('GET /check-admin returns admin exists', async () => {
        await User.create({
            username: 'admin',
            email: 'admin@test.com',
            password_hash: await bcrypt.hash('Password123!', 10),
            role: 'admin'
        });
        const res = await request(app).get('/auth/check-admin');
        expect(res.status).toBe(200);
        expect(res.body.adminExists).toBe(true);
    });

    it('POST /setup-admin creates admin if none exists', async () => {
        const res = await request(app)
            .post('/auth/setup-admin')
            .send({ email: 'newadmin@test.com', password: 'Password123!' });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Admin user created successfully.');
    });

    it('POST /login with valid credentials returns token', async () => {
        await User.create({
            username: 'admin',
            email: 'admin@test.com',
            password_hash: await bcrypt.hash('Password123!', 10),
            role: 'admin'
        });
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'admin@test.com', password: 'Password123!' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.userId).toBe(1);
    });

    it('POST /signup creates a new user', async () => {
        const res = await request(app)
            .post('/auth/signup')
            .send({ username: 'testuser', email: 'test@test.com', password: 'Password123!' });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('User created successfully');
    });
});