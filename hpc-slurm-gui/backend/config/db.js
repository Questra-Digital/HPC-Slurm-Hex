const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite"
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

// Relationships
User.belongsToMany(Group, { through: UserGroup, foreignKey: 'user_id' });
Group.belongsToMany(User, { through: UserGroup, foreignKey: 'group_id' });
User.hasOne(ResourceLimit, { foreignKey: 'user_id' });
Group.hasOne(ResourceLimit, { foreignKey: 'group_id' });

// Sync database
sequelize.sync().then(() => console.log("Database & tables created!"));

module.exports = { sequelize, User, Group, UserGroup, Node, ResourceLimit };
