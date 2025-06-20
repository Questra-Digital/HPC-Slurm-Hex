import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import '@testing-library/jest-dom';

import AdminSetup from "../components/AdminSetup"; 
jest.mock("axios");

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("../config", () => ({
  API_BASE_URL: "http://mocked-api.com"
}));

describe("AdminSetup Component", () => {
  beforeEach(() => {
    axios.post.mockReset();
    mockNavigate.mockReset();
  });

  it("renders all fields correctly", () => {
    render(<AdminSetup />, { wrapper: MemoryRouter });

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/administrator email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/administrator password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create administrator account/i })).toBeInTheDocument();
  });

  it("shows and hides the password", () => {
    render(<AdminSetup />, { wrapper: MemoryRouter });

    const toggleButton = screen.getByRole("button", { name: /show/i });
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveTextContent("Hide");

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveTextContent("Show");
  });

  it("submits the form and navigates to /login on success", async () => {
    axios.post.mockResolvedValue({});

    render(<AdminSetup />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/administrator email/i), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText(/administrator password/i), {
      target: { value: "securePassword123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create administrator account/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/auth/setup-admin"),
        {
          username: "admin",
          email: "admin@example.com",
          password: "securePassword123",
        }
      );
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("displays error message on failed request", async () => {
    axios.post.mockRejectedValue({
      response: { data: { message: "Email already exists" } },
    });

    render(<AdminSetup />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/administrator email/i), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText(/administrator password/i), {
      target: { value: "securePassword123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create administrator account/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already exists")).toBeInTheDocument();
    });
  });
});
