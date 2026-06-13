import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentScore } from "../../../src/lib/bigquery/agentScores";
import AgentDetailPage from "./page";

const { getAgentScoreByIdMock, resolveAgentUriPreviewMock } = vi.hoisted(() => ({
  getAgentScoreByIdMock: vi.fn(),
  resolveAgentUriPreviewMock: vi.fn()
}));

vi.mock("../../../src/lib/bigquery/agentScores", () => ({
  getAgentScoreById: getAgentScoreByIdMock
}));

vi.mock("../../../src/lib/agentUriPreview", () => ({
  resolveAgentUriPreview: resolveAgentUriPreviewMock
}));

const baseAgentScore: AgentScore = {
  agent_id: "42",
  owner_address: "0xabc0000000000000000000000000000000000000",
  display_name: "Needle Scout",
  agent_uri: "data:application/json,%7B%22name%22%3A%22Needle%20Scout%22%7D",
  registered_at_block: 24_339_925,
  registered_at_timestamp: "2026-01-29T10:31:11.000Z",
  identity_registry_address: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
  reputation_registry_address: "0x8004baa17c55a88189ae136b182e5fda19de9b63",
  validation_registry_address: null,
  feedback_events: 32,
  positive_feedback_events: 31,
  negative_feedback_events: 1,
  validation_requests: 7,
  validation_responses: 6,
  successful_validations: 5,
  declared_x402: true,
  verified_x402: false,
  x402_endpoint: "https://needle.example/x402",
  last_x402_verified_at: null,
  trust_score: 91.25,
  trust_score_breakdown: {
    base: 20,
    feedback_events: 32,
    positive_feedback_events: 31,
    negative_feedback_events: 1,
    successful_validations: 5,
    declared_x402_bonus: 10,
    verified_x402_bonus: 0
  },
  score_version: "erc8004-mainnet-v1",
  updated_at: "2026-06-13T14:00:00.000Z"
};

type DetailPageWithParams = (props: {
  params: Promise<{ agentId: string }> | { agentId: string };
}) => ReturnType<typeof AgentDetailPage>;

function makeAgentScore(overrides: Partial<AgentScore> = {}): AgentScore {
  return {
    ...baseAgentScore,
    ...overrides
  };
}

async function renderDetail(agentId = "42") {
  render(
    await (AgentDetailPage as unknown as DetailPageWithParams)({
      params: Promise.resolve({ agentId })
    })
  );
}

describe("agent detail page", () => {
  afterEach(() => {
    getAgentScoreByIdMock.mockReset();
    resolveAgentUriPreviewMock.mockReset();
  });

  it("shows on-chain fields, score explanation, reputation and validation breakdown, and URI preview state", async () => {
    getAgentScoreByIdMock.mockResolvedValue(makeAgentScore());
    resolveAgentUriPreviewMock.mockResolvedValue({
      state: "ready",
      sourceUri: baseAgentScore.agent_uri,
      resolvedUri: baseAgentScore.agent_uri,
      title: "Needle Scout metadata",
      description: "Finds payable ERC-8004 agents.",
      rawSnippet: '{"name":"Needle Scout metadata"}'
    });

    await renderDetail("42");

    expect(getAgentScoreByIdMock).toHaveBeenCalledWith({ agentId: "42" });
    expect(resolveAgentUriPreviewMock).toHaveBeenCalledWith(baseAgentScore.agent_uri);
    expect(screen.getByRole("heading", { name: "Needle Scout" })).toBeVisible();
    expect(screen.getByText("Agent ID")).toBeVisible();
    expect(screen.getByText("42")).toBeVisible();
    expect(screen.getByText("Owner")).toBeVisible();
    expect(screen.getByText(baseAgentScore.owner_address)).toBeVisible();
    expect(screen.getByText("Identity registry")).toBeVisible();
    expect(screen.getByText(baseAgentScore.identity_registry_address)).toBeVisible();
    expect(screen.getByText("Reputation registry")).toBeVisible();
    expect(screen.getByText(baseAgentScore.reputation_registry_address)).toBeVisible();
    expect(screen.getByText("Validation registry")).toBeVisible();
    expect(screen.getByText("Not deployed")).toBeVisible();
    expect(screen.getByText("Registered block")).toBeVisible();
    expect(screen.getByText("24,339,925")).toBeVisible();

    expect(screen.getByRole("heading", { name: "Trust Score" })).toBeVisible();
    expect(screen.getAllByText("91.25").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Trust Score combines a base score with reputation events, validation outcomes, and x402 signals."
      )
    ).toBeVisible();
    expect(screen.getByText("erc8004-mainnet-v1")).toBeVisible();
    expect(screen.getByText("Base")).toBeVisible();
    expect(screen.getAllByText("20").length).toBeGreaterThan(0);
    expect(screen.getByText("Declared x402 bonus")).toBeVisible();
    expect(screen.getByText("+10")).toBeVisible();

    expect(screen.getByRole("heading", { name: "Reputation" })).toBeVisible();
    expect(screen.getAllByText("Feedback events").length).toBeGreaterThan(0);
    expect(screen.getAllByText("32").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Positive feedback").length).toBeGreaterThan(0);
    expect(screen.getAllByText("31").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Negative feedback").length).toBeGreaterThan(0);

    expect(screen.getByRole("heading", { name: "Validation" })).toBeVisible();
    expect(screen.getByText("Validation requests")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText("Validation responses")).toBeVisible();
    expect(screen.getByText("6")).toBeVisible();
    expect(screen.getAllByText("Successful validations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);

    expect(screen.getByRole("heading", { name: "URI Preview" })).toBeVisible();
    expect(screen.getByText("Needle Scout metadata")).toBeVisible();
    expect(screen.getByText("Finds payable ERC-8004 agents.")).toBeVisible();
  });

  it("shows a URI preview unavailable state", async () => {
    getAgentScoreByIdMock.mockResolvedValue(
      makeAgentScore({
        agent_id: "101",
        display_name: null,
        agent_uri: null
      })
    );
    resolveAgentUriPreviewMock.mockResolvedValue({
      state: "missing",
      title: "No URI provided",
      message: "This agent has no on-chain URI to preview."
    });

    await renderDetail("101");

    expect(screen.getByRole("heading", { name: "Agent #101" })).toBeVisible();
    expect(screen.getByText("No URI provided")).toBeVisible();
    expect(screen.getByText("This agent has no on-chain URI to preview.")).toBeVisible();
  });
});
