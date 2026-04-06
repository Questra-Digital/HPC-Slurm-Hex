const axios = require('axios');
const emailService = require('../services/emailService');
const { pollJobFailureOnce } = require('../services/jobFailureMonitor');

jest.mock('axios');

const { Node, User, JobFailureNotification } = global.testDb;

describe('Job Failure Monitor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.SLURM_PORT = '5050';
    });

    const seedMasterNode = async () => {
        await Node.create({
            name: 'master-node',
            ip_address: '127.0.0.1',
            node_type: 'master',
            status: 'active',
        });
    };

    const seedUser = async () => User.create({
        username: 'alice',
        email: 'alice@example.com',
        password_hash: 'hashed',
        role: 'user',
    });

    test('sends failed-job email and marks notification timestamp', async () => {
        await seedMasterNode();
        const user = await seedUser();

        await JobFailureNotification.create({
            job_id: '101',
            job_name: 'train-model',
            user_id: user.id,
            username: 'alice',
            user_email: 'alice@example.com',
            last_observed_state: 'RUNNING',
        });

        axios.get.mockResolvedValue({
            data: {
                jobs: [{ jobId: '101', jobName: 'train-model', userName: 'alice', state: 'FAILED' }],
            },
        });

        const sendSpy = jest.spyOn(emailService, 'sendJobFailureEmail').mockResolvedValue({ success: true });

        await pollJobFailureOnce();

        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect(sendSpy).toHaveBeenCalledWith(
            'alice@example.com',
            expect.objectContaining({
                jobId: '101',
                jobName: 'train-model',
                jobState: 'FAILED',
            })
        );

        const saved = await JobFailureNotification.findOne({ where: { job_id: '101' } });
        expect(saved.failure_notified_at).toBeTruthy();
    });

    test('does not send duplicate email for already notified failed job', async () => {
        await seedMasterNode();
        const user = await seedUser();

        await JobFailureNotification.create({
            job_id: '202',
            job_name: 'analytics-run',
            user_id: user.id,
            username: 'alice',
            user_email: 'alice@example.com',
            last_observed_state: 'FAILED',
            failure_notified_at: new Date(),
        });

        axios.get.mockResolvedValue({
            data: {
                jobs: [{ jobId: '202', jobName: 'analytics-run', userName: 'alice', state: 'FAILED' }],
            },
        });

        const sendSpy = jest.spyOn(emailService, 'sendJobFailureEmail').mockResolvedValue({ success: true });

        await pollJobFailureOnce();

        expect(sendSpy).not.toHaveBeenCalled();
    });

    test('resolves recipient from username when submission tracking was missing', async () => {
        await seedMasterNode();
        await seedUser();

        axios.get.mockResolvedValue({
            data: {
                jobs: [{ jobId: '303', jobName: 'postprocess', userName: 'alice', state: 'FAILED' }],
            },
        });

        const sendSpy = jest.spyOn(emailService, 'sendJobFailureEmail').mockResolvedValue({ success: true });

        await pollJobFailureOnce();

        expect(sendSpy).toHaveBeenCalledWith(
            'alice@example.com',
            expect.objectContaining({
                jobId: '303',
                jobName: 'postprocess',
            })
        );

        const saved = await JobFailureNotification.findOne({ where: { job_id: '303' } });
        expect(saved).toBeTruthy();
        expect(saved.user_email).toBe('alice@example.com');
        expect(saved.failure_notified_at).toBeTruthy();
    });
});
