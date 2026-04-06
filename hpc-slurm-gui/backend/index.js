const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const authRoutes = require("./routes/auth");
const resourceRoutes = require("./routes/resources");
const userRoutes = require("./routes/users");
const nodesRoutes = require("./routes/nodes");
const jobsRoutes = require("./routes/jobs");
const emailRoutes = require("./routes/email");
const { requireAuth } = require("./middleware/auth");
const { dbReady } = require("./config/db");
const { startJobFailureMonitor } = require("./services/jobFailureMonitor");

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());
app.use(cookieParser());

// Route handlers
app.use("/api/auth", authRoutes);
app.use("/api/resources", requireAuth(), resourceRoutes);
app.use("/api/users", requireAuth(), userRoutes);
app.use("/api/nodes", requireAuth(), nodesRoutes);
app.use("/api/jobs", requireAuth(), jobsRoutes);
app.use("/api/email", requireAuth(), emailRoutes);

const PORT = process.env.PORT;

dbReady
	.then(() => {
		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Server running on port ${PORT}`);
			startJobFailureMonitor();
		});
	})
	.catch((error) => {
		console.error("Fatal: database initialization failed.", error);
		process.exit(1);
	});
