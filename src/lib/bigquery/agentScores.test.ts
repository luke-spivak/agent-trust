import { describe, expect, it, vi } from "vitest";
import {
  buildAgentScoreByIdQuery,
  buildAgentScoresQuery,
  getAgentScoreById,
  listAgentScores,
  loadBigQueryConfig,
  type AgentScore,
  type BigQueryQueryClient
} from "./agentScores";

const env = {
  BIGQUERY_PROJECT_ID: "PROJECT",
  BIGQUERY_DATASET_ID: "DATASET",
  BIGQUERY_AGENT_SCORES_TABLE: "agent_scores"
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("loadBigQueryConfig", () => {
  it("rejects missing required BigQuery environment values", () => {
    expect(() =>
      loadBigQueryConfig({
        BIGQUERY_DATASET_ID: "DATASET",
        BIGQUERY_AGENT_SCORES_TABLE: "agent_scores"
      })
    ).toThrow("Missing required BigQuery environment variables: BIGQUERY_PROJECT_ID");

    expect(() =>
      loadBigQueryConfig({
        BIGQUERY_PROJECT_ID: "PROJECT",
        BIGQUERY_AGENT_SCORES_TABLE: "agent_scores"
      })
    ).toThrow("Missing required BigQuery environment variables: BIGQUERY_DATASET_ID");
  });

  it("rejects table identifier values that could break out of the table reference", () => {
    expect(() =>
      loadBigQueryConfig({
        BIGQUERY_PROJECT_ID: "PROJECT",
        BIGQUERY_DATASET_ID: "DATASET",
        BIGQUERY_AGENT_SCORES_TABLE: "agent_scores; DROP TABLE raw_logs"
      })
    ).toThrow("BIGQUERY_AGENT_SCORES_TABLE must be a simple BigQuery identifier");
  });
});

describe("buildAgentScoresQuery", () => {
  it("targets only the materialized PROJECT.DATASET.agent_scores table", () => {
    const query = buildAgentScoresQuery(
      {
        limit: 50,
        search: "alpha",
        verifiedX402Only: false
      },
      loadBigQueryConfig(env)
    );

    expect(query.query).toContain("FROM `PROJECT.DATASET.agent_scores`");
    expect(query.query).toContain("CAST(trust_score AS FLOAT64) AS trust_score");
    expect(query.query).not.toContain("goog_blockchain_ethereum_mainnet_us.logs");
    expect(query.query).not.toContain("raw_logs");
    expect(query.query).not.toContain("CREATE OR REPLACE TABLE");
  });

  it("binds search and filter values as parameters instead of interpolating them", () => {
    const injection = "owner' OR TRUE --";
    const query = buildAgentScoresQuery(
      {
        limit: 25,
        search: injection,
        verifiedX402Only: true
      },
      loadBigQueryConfig(env)
    );

    expect(query.query).toContain("@search");
    expect(query.query).toContain("@verifiedX402Only");
    expect(query.query).toContain("@limit");
    expect(query.query).not.toContain(injection);
    expect(query.params).toEqual({
      limit: 25,
      search: injection,
      verifiedX402Only: true
    });
    expect(query.types).toEqual({
      limit: "INT64",
      search: "STRING",
      verifiedX402Only: "BOOL"
    });
  });

  it("searches the materialized table by exact owner and exact agent ID", () => {
    const query = buildAgentScoresQuery(
      {
        limit: 50,
        search: "0x1111111111111111111111111111111111111111",
        verifiedX402Only: false
      },
      loadBigQueryConfig(env)
    );
    const sql = normalizeSql(query.query);

    expect(sql).toContain("LOWER(owner_address) = LOWER(@search)");
    expect(sql).toContain("CAST(agent_id AS STRING) = @search");
  });

  it("searches the materialized table by display-name and URI substrings", () => {
    const query = buildAgentScoresQuery(
      {
        limit: 50,
        search: "needle",
        verifiedX402Only: false
      },
      loadBigQueryConfig(env)
    );
    const sql = normalizeSql(query.query);

    expect(sql).toContain(
      "LOWER(COALESCE(display_name, '')) LIKE CONCAT('%', LOWER(@search), '%')"
    );
    expect(sql).toContain(
      "LOWER(COALESCE(agent_uri, '')) LIKE CONCAT('%', LOWER(@search), '%')"
    );
  });

  it("applies the verified x402 toggle through a bound boolean parameter", () => {
    const query = buildAgentScoresQuery(
      {
        limit: 50,
        search: null,
        verifiedX402Only: true
      },
      loadBigQueryConfig(env)
    );

    expect(normalizeSql(query.query)).toContain(
      "AND (@verifiedX402Only = FALSE OR verified_x402 = TRUE)"
    );
    expect(query.params.verifiedX402Only).toBe(true);
    expect(query.types.verifiedX402Only).toBe("BOOL");
  });
});

describe("buildAgentScoreByIdQuery", () => {
  it("targets one agent by exact ID in only the materialized agent_scores table", () => {
    const query = buildAgentScoreByIdQuery("42", loadBigQueryConfig(env));
    const sql = normalizeSql(query.query);

    expect(sql).toContain("FROM `PROJECT.DATASET.agent_scores`");
    expect(sql).toContain("WHERE agent_id = @agentId");
    expect(sql).toContain("LIMIT 1");
    expect(sql).not.toContain("goog_blockchain_ethereum_mainnet_us.logs");
    expect(sql).not.toContain("raw_logs");
    expect(sql).not.toContain("CREATE OR REPLACE TABLE");
  });

  it("binds the agent ID instead of interpolating it", () => {
    const injection = "42' OR TRUE --";
    const query = buildAgentScoreByIdQuery(injection, loadBigQueryConfig(env));

    expect(query.query).toContain("@agentId");
    expect(query.query).not.toContain(injection);
    expect(query.params).toEqual({ agentId: injection });
    expect(query.types).toEqual({ agentId: "STRING" });
  });
});

describe("listAgentScores", () => {
  it("runs the parameterized agent_scores query and returns typed rows", async () => {
    const rows: AgentScore[] = [
      {
        agent_id: "42",
        owner_address: "0x1111111111111111111111111111111111111111",
        display_name: "Demo Agent",
        agent_uri: "https://example.com/agent.json",
        registered_at_block: 19_000_001,
        registered_at_timestamp: null,
        identity_registry_address: "0x2222222222222222222222222222222222222222",
        reputation_registry_address: "0x3333333333333333333333333333333333333333",
        validation_registry_address: null,
        feedback_events: 4,
        positive_feedback_events: 3,
        negative_feedback_events: 1,
        validation_requests: 2,
        validation_responses: 2,
        successful_validations: 1,
        declared_x402: true,
        verified_x402: false,
        x402_endpoint: "https://example.com/pay",
        last_x402_verified_at: null,
        trust_score: 72.5,
        trust_score_breakdown: { feedback: 40, validation: 20, x402: 12.5 },
        score_version: "test-v1",
        updated_at: "2026-06-13T12:00:00.000Z"
      }
    ];
    const client: BigQueryQueryClient = {
      query: vi.fn().mockResolvedValue([rows])
    };

    await expect(
      listAgentScores({
        client,
        config: loadBigQueryConfig(env),
        filters: {
          limit: 10,
          search: "Demo",
          verifiedX402Only: true
        }
      })
    ).resolves.toEqual(rows);

    expect(client.query).toHaveBeenCalledWith({
      query: expect.stringContaining("FROM `PROJECT.DATASET.agent_scores`"),
      params: {
        limit: 10,
        search: "Demo",
        verifiedX402Only: true
      },
      types: {
        limit: "INT64",
        search: "STRING",
        verifiedX402Only: "BOOL"
      }
    });
  });
});

describe("getAgentScoreById", () => {
  it("returns the first matching materialized agent row", async () => {
    const row = makeAgentScore({
      agent_id: "42",
      display_name: "Detail Agent"
    });
    const client: BigQueryQueryClient = {
      query: vi.fn().mockResolvedValue([[row]])
    };

    await expect(
      getAgentScoreById({
        agentId: "42",
        client,
        config: loadBigQueryConfig(env)
      })
    ).resolves.toEqual(row);

    expect(client.query).toHaveBeenCalledWith({
      query: expect.stringContaining("WHERE agent_id = @agentId"),
      params: { agentId: "42" },
      types: { agentId: "STRING" }
    });
  });

  it("returns null when the materialized table has no matching agent", async () => {
    const client: BigQueryQueryClient = {
      query: vi.fn().mockResolvedValue([[]])
    };

    await expect(
      getAgentScoreById({
        agentId: "404",
        client,
        config: loadBigQueryConfig(env)
      })
    ).resolves.toBeNull();
  });
});

function makeAgentScore(overrides: Partial<AgentScore>): AgentScore {
  return {
    agent_id: "101",
    owner_address: "0x1111111111111111111111111111111111111111",
    display_name: null,
    agent_uri: "https://example.com/agent.json",
    registered_at_block: 19_000_001,
    registered_at_timestamp: null,
    identity_registry_address: "0x2222222222222222222222222222222222222222",
    reputation_registry_address: "0x3333333333333333333333333333333333333333",
    validation_registry_address: null,
    feedback_events: 4,
    positive_feedback_events: 3,
    negative_feedback_events: 1,
    validation_requests: 2,
    validation_responses: 2,
    successful_validations: 1,
    declared_x402: true,
    verified_x402: false,
    x402_endpoint: "https://example.com/pay",
    last_x402_verified_at: null,
    trust_score: 72.5,
    trust_score_breakdown: { feedback: 40, validation: 20, x402: 12.5 },
    score_version: "test-v1",
    updated_at: "2026-06-13T12:00:00.000Z",
    ...overrides
  };
}
