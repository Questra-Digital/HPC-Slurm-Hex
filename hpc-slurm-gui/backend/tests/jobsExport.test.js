const request = require("supertest");
const express = require("express");
const axios = require("axios");
const jobsRoutes = require("../routes/jobs");
const { Node } = global.testDb;

jest.mock("axios");

const buildApp = (role = "admin") => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: 1,
      username: "tester",
      email: "tester@example.com",
      role,
    };
    next();
  });
  app.use("/jobs", jobsRoutes);
  return app;
};

describe("jobs export-csv route", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.SLURM_PORT = "5000";

    await Node.create({
      name: "master-1",
      ip_address: "10.0.0.5",
      node_type: "master",
      status: "active",
      cpu_count: 8,
      gpu_count: 1,
      total_memory_gb: 64,
    });
  });

  it("returns CSV export for admin users", async () => {
    axios.get.mockResolvedValue({
      data: {
        jobs: [
          {
            jobId: "1001",
            jobName: "model-train",
            userName: "alice",
            partition: "gpu",
            node: "worker-01",
            start: "2026-04-06T09:00:00.000Z",
            end: "2026-04-06T10:00:00.000Z",
            state: "COMPLETED",
            exitCode: "0:0",
            cpu_request: 4,
            gpu_request: 1,
            memory_request: 16,
          },
        ],
      },
    });

    const res = await request(buildApp("admin")).get("/jobs/export-csv?duration=all");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("job_history_all_");
    expect(res.text).toContain("Job ID,Job Name,User");
    expect(res.text).toContain("1001");
    expect(res.text).toContain("model-train");
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("blocks CSV export for non-admin users", async () => {
    const res = await request(buildApp("user")).get("/jobs/export-csv?duration=all");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Admin access required" });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("filters rows using duration window", async () => {
    const now = Date.now();
    const recentDate = new Date(now - 6 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

    axios.get.mockResolvedValue({
      data: {
        jobs: [
          {
            jobId: "1002",
            jobName: "recent-job",
            userName: "alice",
            start: recentDate,
            state: "COMPLETED",
            cpu_request: 2,
            gpu_request: 0,
            memory_request: 4,
          },
          {
            jobId: "1003",
            jobName: "old-job",
            userName: "bob",
            start: oldDate,
            state: "COMPLETED",
            cpu_request: 1,
            gpu_request: 0,
            memory_request: 2,
          },
        ],
      },
    });

    const res = await request(buildApp("admin")).get("/jobs/export-csv?duration=30d");

    expect(res.status).toBe(200);
    expect(res.text).toContain("recent-job");
    expect(res.text).not.toContain("old-job");
  });
});
