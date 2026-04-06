process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = '5e18f55dc731e04ae901a488b87c33444f014d927bcfc751724687f8209cae86';

const { Sequelize, DataTypes } = require('sequelize');

// Use in-memory SQLite with logging disabled
const sequelize = new Sequelize('sqlite::memory:', { logging: false });

// Define models
const TestUser = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    role: { 
        type: DataTypes.STRING(20), 
        allowNull: false, 
        validate: { isIn: [['admin', 'user']] }
    },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'users' });

const TestGroup = sequelize.define("Group", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'groups' });

const TestUserGroup = sequelize.define("UserGroup", {
    user_id: { 
        type: DataTypes.INTEGER, 
        references: { model: TestUser, key: 'id' },
        primaryKey: true 
    },
    group_id: { 
        type: DataTypes.INTEGER, 
        references: { model: TestGroup, key: 'id' },
        primaryKey: true 
    }
}, { tableName: 'user_groups' });

const TestNode = sequelize.define("Node", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: false, unique: true },
    node_type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [["master", "worker"]] },
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: "active",
        validate: { isIn: [["active", "inactive", "failed"]] },
    },
    cpu_count: { type: DataTypes.INTEGER },
    gpu_count: { type: DataTypes.INTEGER },
    total_memory_gb: { type: DataTypes.FLOAT },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
}, { tableName: "nodes" });

const TestResourceLimit = sequelize.define("ResourceLimit", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, references: { model: TestUser, key: 'id' }, allowNull: true },
    group_id: { type: DataTypes.INTEGER, references: { model: TestGroup, key: 'id' }, allowNull: true },
    max_cpu: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_gpu: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_memory: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { 
    tableName: 'resource_limits',
    indexes: [
        { unique: true, fields: ['user_id'], where: { group_id: null } },
        { unique: true, fields: ['group_id'], where: { user_id: null } }
    ]
});

const TestSession = sequelize.define("Session", {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: TestUser, key: 'id' }
    },
    refresh_token_hash: { type: DataTypes.STRING(128), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    last_activity_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    compromised_at: { type: DataTypes.DATE, allowNull: true },
    device_ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(512), allowNull: true }
}, {
    tableName: 'sessions',
    indexes: [
        { fields: ['id'] },
        { fields: ['user_id'] },
        { fields: ['revoked_at'] },
        { fields: ['expires_at'] }
    ]
});

const TestJobFailureNotification = sequelize.define("JobFailureNotification", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    job_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    job_name: { type: DataTypes.STRING(255), allowNull: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: TestUser, key: 'id' }
    },
    username: { type: DataTypes.STRING(50), allowNull: true },
    user_email: { type: DataTypes.STRING(100), allowNull: true },
    last_observed_state: { type: DataTypes.STRING(64), allowNull: true },
    failure_notified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
}, {
    tableName: 'job_failure_notifications',
    indexes: [
        { unique: true, fields: ['job_id'] },
        { fields: ['user_id'] },
        { fields: ['failure_notified_at'] }
    ]
});

// Relationships
TestUser.belongsToMany(TestGroup, { through: TestUserGroup, foreignKey: 'user_id' });
TestGroup.belongsToMany(TestUser, { through: TestUserGroup, foreignKey: 'group_id' });
TestUser.hasOne(TestResourceLimit, { foreignKey: 'user_id' });
TestGroup.hasOne(TestResourceLimit, { foreignKey: 'group_id' });
TestUser.hasMany(TestSession, { foreignKey: 'user_id' });
TestSession.belongsTo(TestUser, { foreignKey: 'user_id' });
TestUser.hasMany(TestJobFailureNotification, { foreignKey: 'user_id' });
TestJobFailureNotification.belongsTo(TestUser, { foreignKey: 'user_id' });

// Export models for tests
global.testDb = {
    sequelize,
    User: TestUser,
    Group: TestGroup,
    UserGroup: TestUserGroup,
    Node: TestNode,
    ResourceLimit: TestResourceLimit,
    Session: TestSession,
    JobFailureNotification: TestJobFailureNotification,
};

// Apply global mock for all tests
jest.mock('../config/db', () => global.testDb);

// Setup and teardown
beforeAll(async () => {
    await sequelize.sync({ force: true });
});

beforeEach(async () => {
    await sequelize.sync({ force: true }); // Reset DB for each test
});

afterAll(async () => {
    await sequelize.close();
});