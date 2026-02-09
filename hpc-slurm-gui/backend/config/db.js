const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: process.env.NODE_ENV === 'test' ? false : console.log
});

// Models
const User = sequelize.define("User", {
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

const Group = sequelize.define("Group", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    // NEW: Add permissions column to store allowed tabs
    permissions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: ["dashboard", "jobs", "settings"]
    },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'groups' });

const UserGroup = sequelize.define("UserGroup", {
    user_id: {
        type: DataTypes.INTEGER,
        references: { model: User, key: 'id' },
        primaryKey: true
    },
    group_id: {
        type: DataTypes.INTEGER,
        references: { model: Group, key: 'id' },
        primaryKey: true
    }
}, { tableName: 'user_groups' });

const Node = sequelize.define("Node", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
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

const ResourceLimit = sequelize.define("ResourceLimit", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' }, allowNull: true },
    group_id: { type: DataTypes.INTEGER, references: { model: Group, key: 'id' }, allowNull: true },
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

// Notebook Session - tracks active Jupyter notebook sessions
const NotebookSession = sequelize.define("NotebookSession", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' }, allowNull: false },
    worker_ip: { type: DataTypes.STRING(45), allowNull: false },
    worker_port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8888 },
    token: { type: DataTypes.STRING(64), allowNull: false },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: "starting",
        validate: { isIn: [["starting", "running", "stopped", "error"]] }
    },
    pid: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    stopped_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'notebook_sessions' });

// Notebook Permission - admin controls who can access notebooks and on which workers
const NotebookPermission = sequelize.define("NotebookPermission", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' }, allowNull: true },
    group_id: { type: DataTypes.INTEGER, references: { model: Group, key: 'id' }, allowNull: true },
    allowed: { type: DataTypes.BOOLEAN, defaultValue: false },
    allowed_workers: { type: DataTypes.JSON, defaultValue: [] },  // Array of worker IPs user can use
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, {
    tableName: 'notebook_permissions',
    indexes: [
        { unique: true, fields: ['user_id'], where: { group_id: null } },
        { unique: true, fields: ['group_id'], where: { user_id: null } }
    ]
});

// Relationships
User.belongsToMany(Group, { through: UserGroup, foreignKey: 'user_id' });
Group.belongsToMany(User, { through: UserGroup, foreignKey: 'group_id' });
User.hasOne(ResourceLimit, { foreignKey: 'user_id' });
Group.hasOne(ResourceLimit, { foreignKey: 'group_id' });
User.hasMany(NotebookSession, { foreignKey: 'user_id' });
User.hasOne(NotebookPermission, { foreignKey: 'user_id' });
Group.hasOne(NotebookPermission, { foreignKey: 'group_id' });

// Sync database
sequelize.sync({ alter: true }).then(() => console.log("Database & tables updated!"));

module.exports = { sequelize, User, Group, UserGroup, Node, ResourceLimit, NotebookSession, NotebookPermission };

