const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");

const storagePath = process.env.SQLITE_STORAGE || path.join(__dirname, "..", "data", "database.sqlite");
fs.mkdirSync(path.dirname(storagePath), { recursive: true });

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: storagePath,
    logging: process.env.NODE_ENV === 'test' ? false : console.log  
});

const buildSyncOptions = () => {
    if (process.env.DB_SYNC_FORCE === "true") {
        return { force: true };
    }

    if (process.env.DB_SYNC_ALTER === "true") {
        return { alter: true };
    }

    return {};
};

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
    name: { type: DataTypes.STRING(100), allowNull: false},
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

const Session = sequelize.define("Session", {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: User, key: 'id' }
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

const JobFailureNotification = sequelize.define("JobFailureNotification", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    job_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    job_name: { type: DataTypes.STRING(255), allowNull: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: User, key: 'id' }
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
        { fields: ['failure_notified_at'] },
    ]
});

// Relationships
User.belongsToMany(Group, { through: UserGroup, foreignKey: 'user_id' });
Group.belongsToMany(User, { through: UserGroup, foreignKey: 'group_id' });
User.hasOne(ResourceLimit, { foreignKey: 'user_id' });
Group.hasOne(ResourceLimit, { foreignKey: 'group_id' });
User.hasMany(Session, { foreignKey: 'user_id' });
Session.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(JobFailureNotification, { foreignKey: 'user_id' });
JobFailureNotification.belongsTo(User, { foreignKey: 'user_id' });

const syncDatabase = async () => {
    const syncOptions = buildSyncOptions();

    try {
        await sequelize.sync(syncOptions);
        console.log(`Database & tables ready (sync options: ${JSON.stringify(syncOptions)})`);
    } catch (error) {
        if (syncOptions.alter) {
            console.error("Database alter sync failed, retrying with safe sync() fallback:", error.message);
            await sequelize.sync();
            console.log("Database & tables ready with safe sync() fallback.");
            return;
        }

        throw error;
    }
};

const dbReady = syncDatabase();

module.exports = {
    sequelize,
    User,
    Group,
    UserGroup,
    Node,
    ResourceLimit,
    Session,
    JobFailureNotification,
    dbReady,
};
