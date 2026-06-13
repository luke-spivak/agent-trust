import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("app shell", () => {
  it("renders the AgentTrust Finder shell with its scheduling guardrail", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "AgentTrust Finder" })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByText("BigQuery Scheduled Queries")).toBeVisible();
    expect(screen.getByText("Materialized agent_scores")).toBeVisible();
  });
});
