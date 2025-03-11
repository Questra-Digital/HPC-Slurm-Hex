const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const resourceRoutes = require("./routes/resources");
const userRoutes = require("./routes/users");
const nodesRoutes = require("./routes/nodes");

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());


// Route handlers
app.use("/auth", authRoutes);
app.use("/resources", resourceRoutes);
app.use("/users", userRoutes);
app.use("/nodes", nodesRoutes);

const PORT = process.env.PORT;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));