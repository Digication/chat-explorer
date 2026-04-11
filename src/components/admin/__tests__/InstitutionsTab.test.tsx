import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router";
import { GET_INSTITUTIONS } from "@/lib/queries/admin";

import InstitutionsTab from "../InstitutionsTab";

const MOCK_INSTITUTIONS = [
  { id: "inst-1", name: "Test University", domain: "test.edu", slug: "test-u" },
  { id: "inst-2", name: "Demo College", domain: "demo.edu", slug: "demo" },
];

function getInstitutionsMock(
  institutions = MOCK_INSTITUTIONS
): MockedResponse {
  return {
    request: { query: GET_INSTITUTIONS },
    result: { data: { institutions } },
  };
}

function renderInstitutionsTab(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter>
        <InstitutionsTab />
      </MemoryRouter>
    </MockedProvider>
  );
}

describe("InstitutionsTab", () => {
  it("renders institutions table with data", async () => {
    renderInstitutionsTab([getInstitutionsMock()]);

    await waitFor(() => {
      expect(screen.getByText("Test University")).toBeInTheDocument();
      expect(screen.getByText("Demo College")).toBeInTheDocument();
    });
  });

  it("shows empty state when no institutions", async () => {
    renderInstitutionsTab([getInstitutionsMock([])]);

    await waitFor(() => {
      expect(screen.getByText("No institutions yet.")).toBeInTheDocument();
    });
  });

  it("shows Create Institution button", () => {
    renderInstitutionsTab([getInstitutionsMock()]);
    expect(screen.getByText("Create Institution")).toBeInTheDocument();
  });

  it("opens create dialog when button is clicked", async () => {
    renderInstitutionsTab([getInstitutionsMock()]);
    fireEvent.click(screen.getByText("Create Institution"));

    await waitFor(() => {
      // The dialog title for create mode
      expect(screen.getByText("Create Institution", { selector: "h2" })).toBeInTheDocument();
    });
  });
});
