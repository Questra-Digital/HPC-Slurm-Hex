const request = require('supertest');
const express = require('express');
const nodesRoutes = require('../routes/nodes');
const { Node } = global.testDb;
const axios = require('axios');

jest.mock('axios'); 

const app = express();
app.use(express.json());
app.use('/nodes', nodesRoutes);

describe('Nodes Routes', () => {
    it('POST /connect creates a new node', async () => {
        axios.get.mockResolvedValue({
            status: 200,
            data: { status: 'active', cpu_count: 4, gpu_count: 1, total_memory_gb: 16 }
        });
        const res = await request(app)
            .post('/nodes/connect')
            .send({ name: 'node1', ip: '192.168.1.1', type: 'master' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('Node created');
        expect(res.body.node.name).toBe('node1');
    });

    it('POST /reset-nodes clears the node table', async () => {
        await Node.create({ name: 'node1', ip_address: '192.168.1.1', node_type: 'master' });
        const res = await request(app).post('/nodes/reset-nodes');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Node table has been reset successfully');
        expect(await Node.count()).toBe(0);
    });

    it('GET /get-nodes-list returns all nodes', async () => {
        await Node.create({ name: 'node1', ip_address: '192.168.1.1', node_type: 'master' });
        const res = await request(app).get('/nodes/get-nodes-list');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].name).toBe('node1');
    });
});