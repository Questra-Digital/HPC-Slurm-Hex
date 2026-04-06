import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import Swal from "sweetalert2";
import JobsPage from "../components/JobsPage";
import "@testing-library/jest-dom";

jest.mock("axios");
jest.mock("sweetalert2", () => ({
  fire: jest.fn(() => Promise.resolve({ isConfirmed: true })),
  showLoading: jest.fn(),
  close: jest.fn(),
}));

describe("JobsPage Component", () => {
  const authUser = {
    id: 123,
    username: "testuser",
    role: "user",
    email: "test@example.com",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = jest.fn(() => "blob:test");
    } else {
      window.URL.createObjectURL = jest.fn(() => "blob:test");
    }

    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = jest.fn();
    } else {
      window.URL.revokeObjectURL = jest.fn();
    }

    axios.get.mockImplementation((url) => {
      if (url === "/nodes/get-nodes-list") {
        return Promise.resolve({
          data: [
            { id: 1, node_type: "master", ip_address: "192.168.1.1" },
            { id: 2, node_type: "worker", status: "active", cpu_count: 8, gpu_count: 2, total_memory_gb: 32 },
          ],
        });
      }

      if (url === "/users/users/123/groups") {
        return Promise.resolve({ data: [{ id: 1, name: "Group A" }] });
      }

      if (url.includes("/resources/resource-limits")) {
        return Promise.resolve({
          data: { max_cpu: 16, max_gpu: 4, max_memory: 64 },
        });
      }

      if (url === "/jobs/slurm-jobs") {
        return Promise.resolve({
          data: {
            jobs: [
              {
                jobId: "1",
                jobName: "Test Job",
                userName: "testuser",
                state: "RUNNING",
                start: new Date().toISOString(),
                cpu_request: 2,
                gpu_request: 0,
                memory_request: 4,
              },
              {
                jobId: "2",
                jobName: "Completed Job",
                userName: "testuser",
                state: "COMPLETED",
                start: new Date().toISOString(),
                end: new Date().toISOString(),
                download_link: "http://example.com/download",
                cpu_request: 4,
                gpu_request: 1,
                memory_request: 8,
              },
            ],
          },
        });
      }

      if (url.startsWith("/jobs/export-csv")) {
        return Promise.resolve({
          data: new Blob(["Job ID,Job Name\n1,Example"], { type: "text/csv" }),
        });
      }

      return Promise.reject(new Error("Unhandled axios.get URL"));
    });

    axios.post.mockResolvedValue({ data: { message: "ok" } });
  });

  it("renders jobs page content", async () => {
    render(<JobsPage authUser={authUser} />);

    await waitFor(() => {
      expect(screen.getByText("Jobs Management")).toBeInTheDocument();
      expect(screen.getByText("Test Job")).toBeInTheDocument();
    });
  });

  it("switches to completed tab and shows completed jobs", async () => {
    render(<JobsPage authUser={authUser} />);

    await waitFor(() => {
      const completedTabs = screen.getAllByText("COMPLETED");
      fireEvent.click(completedTabs[0]);
      expect(screen.getByText("Completed Job")).toBeInTheDocument();
    });
  });

  it("validates required fields before job submission", async () => {
    render(<JobsPage authUser={authUser} />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("Submit Job"));
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: "warning",
        title: "Incomplete Form",
        text: "Please fill out all required fields (Job Name, Source, CPU, Memory).",
        confirmButtonColor: "#1e3a8a",
        confirmButtonText: "OK",
      });
    });
  });

  it("shows export controls for admin and calls export endpoint", async () => {
    const adminUser = {
      ...authUser,
      role: "admin",
    };

    render(<JobsPage authUser={adminUser} />);

    const exportButton = await screen.findByRole("button", { name: "Export CSV" });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        "/jobs/export-csv?duration=all",
        expect.objectContaining({
          responseType: "blob",
          retrySafe: true,
        })
      );
      expect(Swal.fire).toHaveBeenCalledWith({
        icon: "success",
        title: "Export Complete",
        text: "Job history CSV downloaded successfully.",
        confirmButtonColor: "#1e3a8a",
        confirmButtonText: "OK",
      });
    });
  });
});
