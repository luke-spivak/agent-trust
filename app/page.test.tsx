import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentScore } from "../src/lib/bigquery/agentScores";
import Loading from "./loading";
import Home from "./page";

const { listAgentScoresMock } = vi.hoisted(() => ({
  listAgentScoresMock: vi.fn()
}));

vi.mock("../src/lib/bigquery/agentScores", () => ({
  listAgentScores: listAgentScoresMock
}));

const baseAgentScore: AgentScore = {
  agent_id: "101",
  owner_address: "0x1111111111111111111111111111111111111111",
  display_name: null,
  agent_uri: "https://example.com/agent.json",
  registered_at_block: 24_339_925,
  registered_at_timestamp: "2026-01-29T10:31:11.000Z",
  identity_registry_address: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
  reputation_registry_address: "0x8004baa17c55a88189ae136b182e5fda19de9b63",
  validation_registry_address: null,
  feedback_events: 12,
  positive_feedback_events: 10,
  negative_feedback_events: 2,
  validation_requests: 0,
  validation_responses: 0,
  successful_validations: 0,
  declared_x402: false,
  verified_x402: false,
  x402_endpoint: null,
  last_x402_verified_at: null,
  trust_score: 68.42,
  trust_score_breakdown: {},
  score_version: "test-v1",
  updated_at: "2026-06-13T14:00:00.000Z"
};

function makeAgentScore(overrides: Partial<AgentScore>): AgentScore {
  return {
    ...baseAgentScore,
    ...overrides
  };
}

type SearchParams = Record<string, string | string[] | undefined>;
type HomeWithSearchParams = (props?: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) => ReturnType<typeof Home>;

async function renderHome(searchParams: SearchParams = {}) {
  render(
    await (Home as unknown as HomeWithSearchParams)({
      searchParams: Promise.resolve(searchParams)
    })
  );
}

describe("leaderboard page", () => {
  afterEach(() => {
    listAgentScoresMock.mockReset();
  });

  it("renders the AgentTrust Finder shell with its scheduling guardrail", async () => {
    listAgentScoresMock.mockResolvedValue([]);

    render(await Home());

    expect(
      screen.getByRole("heading", { name: "AgentTrust Finder" })
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByText("BigQuery Scheduled Queries")).toBeVisible();
    expect(screen.getByText("Materialized agent_scores")).toBeVisible();
  });

  it("renders leaderboard rows with Trust Score and x402 state", async () => {
    listAgentScoresMock.mockResolvedValue([
      makeAgentScore({
        agent_id: "42",
        display_name: "Needle Scout",
        owner_address: "0xabc0000000000000000000000000000000000000",
        agent_uri: "https://needle.example/x402",
        trust_score: 91.25,
        verified_x402: true,
        declared_x402: true,
        feedback_events: 32,
        positive_feedback_events: 31,
        negative_feedback_events: 1
      }),
      makeAgentScore({
        agent_id: "43",
        display_name: null,
        owner_address: "0xdef0000000000000000000000000000000000000",
        agent_uri: "https://quiet.example/agent.json",
        trust_score: 54,
        verified_x402: false,
        declared_x402: false,
        feedback_events: 3,
        positive_feedback_events: 2,
        negative_feedback_events: 1
      })
    ]);

    render(await Home());

    expect(
      screen.getByRole("table", { name: "AgentTrust leaderboard" })
    ).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Trust Score" })).toBeVisible();
    expect(screen.getByText("Needle Scout")).toBeVisible();
    expect(screen.getByText("91.25")).toBeVisible();
    expect(screen.getByText("Verified x402")).toBeVisible();
    expect(screen.getByText("Agent #43")).toBeVisible();
    expect(screen.getByText("No x402 signal")).toBeVisible();
  });

  it("renders a declared x402 state separately from verified x402", async () => {
    listAgentScoresMock.mockResolvedValue([
      makeAgentScore({
        display_name: "Paywall Pilot",
        declared_x402: true,
        verified_x402: false,
        trust_score: 76
      })
    ]);

    render(await Home());

    expect(screen.getByText("Paywall Pilot")).toBeVisible();
    expect(screen.getByText("Declares x402")).toBeVisible();
  });

  it.each([
    [
      "owner exact match",
      "0xabc0000000000000000000000000000000000000",
      { owner_address: "0xabc0000000000000000000000000000000000000" }
    ],
    ["agent ID exact match", "42", { agent_id: "42" }],
    ["display-name substring", "Needle", { display_name: "Needle Scout" }],
    ["URI substring", "needle.example", { agent_uri: "https://needle.example/x402" }]
  ])("passes %s search to the materialized query", async (_label, q, overrides) => {
    listAgentScoresMock.mockResolvedValue([
      makeAgentScore({
        ...overrides,
        display_name: overrides.display_name ?? "Needle Scout"
      })
    ]);

    await renderHome({ q });

    expect(listAgentScoresMock).toHaveBeenCalledWith({
      filters: {
        limit: 50,
        search: q,
        verifiedX402Only: false
      }
    });
    expect(screen.getByLabelText("Search agents")).toHaveValue(q);
  });

  it("passes the verified x402 toggle to the materialized query", async () => {
    listAgentScoresMock.mockResolvedValue([
      makeAgentScore({
        display_name: "Verified Pay Agent",
        declared_x402: true,
        verified_x402: true
      })
    ]);

    await renderHome({
      q: "Verified Pay",
      x402: "verified"
    });

    expect(listAgentScoresMock).toHaveBeenCalledWith({
      filters: {
        limit: 50,
        search: "Verified Pay",
        verifiedX402Only: true
      }
    });
    expect(screen.getByLabelText("Search agents")).toHaveAttribute("name", "q");
    expect(screen.getByLabelText("Search agents")).toHaveValue("Verified Pay");
    expect(screen.getByRole("checkbox", { name: "Verified x402 only" })).toHaveAttribute(
      "name",
      "x402"
    );
    expect(screen.getByRole("checkbox", { name: "Verified x402 only" })).toHaveAttribute(
      "value",
      "verified"
    );
    expect(screen.getByRole("checkbox", { name: "Verified x402 only" })).toBeChecked();
  });

  it("renders a filtered empty state when search filters match no rows", async () => {
    listAgentScoresMock.mockResolvedValue([]);

    await renderHome({ q: "missing-agent" });

    expect(screen.getByText("No matching agents")).toBeVisible();
    expect(
      screen.getByText("Try a different owner, agent ID, name, URI, or x402 filter.")
    ).toBeVisible();
  });

  it("renders the loading state", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading AgentTrust leaderboard"
    );
  });

  it("renders an empty state when there are no leaderboard rows", async () => {
    listAgentScoresMock.mockResolvedValue([]);

    render(await Home());

    expect(screen.getByText("No agents indexed yet")).toBeVisible();
    expect(
      screen.getByText("The scheduled query has not populated agent_scores.")
    ).toBeVisible();
  });

  it("renders an error state when leaderboard rows cannot load", async () => {
    listAgentScoresMock.mockRejectedValue(new Error("BigQuery unavailable"));

    render(await Home());

    expect(screen.getByText("Leaderboard unavailable")).toBeVisible();
    expect(
      screen.getByText("The materialized agent_scores table could not be loaded.")
    ).toBeVisible();
  });
});
