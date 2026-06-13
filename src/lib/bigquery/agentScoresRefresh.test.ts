import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sqlPath = join(repoRoot, "bigquery", "agent_scores_scheduled_query.sql");
const schedulePath = join(repoRoot, "bigquery", "agent_scores_schedule.json");
const docsPath = join(repoRoot, "docs", "bigquery-scheduled-query.md");

const requiredSqlFeatures = [
  {
    name: "topic matching",
    patterns: [
      "DECLARE registered_topic STRING",
      "DECLARE new_feedback_topic STRING",
      "DECLARE feedback_revoked_topic STRING",
      "DECLARE validation_request_topic STRING",
      "DECLARE validation_response_topic STRING",
      "topics[SAFE_OFFSET(0)] IN",
      "LOWER(address) = LOWER(identity_registry)",
      "LOWER(address) = LOWER(reputation_registry)",
      "LOWER(address) = LOWER(validation_registry)"
    ]
  },
  {
    name: "registration decoding",
    patterns: [
      "registrations AS",
      "active_registrations AS",
      "ROW_NUMBER() OVER",
      "registered_at_block",
      "owner_address",
      "display_name",
      "agent_uri"
    ]
  },
  {
    name: "feedback and revocation exclusion",
    patterns: [
      "feedback_events AS",
      "revoked_feedback AS",
      "non_revoked_feedback AS",
      "LEFT JOIN revoked_feedback",
      "revoked.feedback_id IS NULL",
      "positive_feedback_events",
      "negative_feedback_events"
    ]
  },
  {
    name: "validation summaries",
    patterns: [
      "validation_requests AS",
      "validation_responses AS",
      "validation_summary AS",
      "successful_validations",
      "validation_request_events",
      "validation_response_events"
    ]
  },
  {
    name: "declared x402",
    patterns: [
      "declared_x402",
      "x402_endpoint",
      "REGEXP_CONTAINS",
      "LOWER(COALESCE(active.agent_uri, ''))"
    ]
  },
  {
    name: "score ranking",
    patterns: [
      "trust_score",
      "trust_score_breakdown",
      "score_version",
      "ORDER BY trust_score DESC"
    ]
  }
];

const requiredOutputColumns = [
  "agent_id",
  "owner_address",
  "display_name",
  "agent_uri",
  "registered_at_block",
  "registered_at_timestamp",
  "identity_registry_address",
  "reputation_registry_address",
  "validation_registry_address",
  "feedback_events",
  "positive_feedback_events",
  "negative_feedback_events",
  "validation_requests",
  "validation_responses",
  "successful_validations",
  "declared_x402",
  "verified_x402",
  "x402_endpoint",
  "last_x402_verified_at",
  "trust_score",
  "trust_score_breakdown",
  "score_version",
  "updated_at"
];

function readSql(): string {
  return readFileSync(sqlPath, "utf8");
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("agent_scores scheduled query SQL", () => {
  it("materializes PROJECT.DATASET.agent_scores with the required clustering", () => {
    const sql = compactSql(readSql());

    expect(sql).toMatch(
      /CREATE OR REPLACE TABLE `PROJECT\.DATASET\.agent_scores`/i
    );
    expect(sql).toMatch(
      /CLUSTER BY verified_x402,\s*declared_x402,\s*trust_score/i
    );
    expect(sql).toMatch(/AS NUMERIC \) AS trust_score/i);
  });

  it("keeps raw Ethereum log reads inside the scheduled query source scope", () => {
    const sql = readSql();

    expect(sql).toContain(
      "`bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`"
    );
    expect(sql).not.toContain("vercel");
    expect(sql).not.toContain("Cloud Scheduler");
    expect(sql).not.toContain("cloudscheduler");
  });

  it.each(requiredSqlFeatures)("covers $name", ({ patterns }) => {
    const sql = readSql();

    for (const pattern of patterns) {
      expect(sql).toContain(pattern);
    }
  });

  it("selects the complete agent_scores schema", () => {
    const sql = readSql();

    for (const column of requiredOutputColumns) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });
});

describe("agent_scores scheduled query runner", () => {
  it("documents BigQuery Scheduled Queries as the 15-minute runner", () => {
    const schedule = JSON.parse(readFileSync(schedulePath, "utf8")) as {
      runner: string;
      schedule: string;
      sqlFile: string;
      targetTable: string;
    };
    const docs = readFileSync(docsPath, "utf8");

    expect(schedule).toEqual({
      runner: "BigQuery Scheduled Queries",
      schedule: "every 15 minutes",
      sqlFile: "bigquery/agent_scores_scheduled_query.sql",
      targetTable: "PROJECT.DATASET.agent_scores"
    });
    expect(docs).toContain("BigQuery Scheduled Queries");
    expect(docs).toContain("every 15 minutes");
    expect(docs).toContain("bq mk --transfer_config");
  });

  it("does not add Vercel cron or Cloud Scheduler configuration", () => {
    const forbiddenRefreshConfigs = [
      "vercel.json",
      join("app", "api", "cron"),
      join("app", "api", "agent-scores-refresh"),
      "cloudscheduler.yaml",
      "cloud-scheduler.yaml",
      join("terraform", "cloud_scheduler.tf")
    ];

    for (const forbiddenPath of forbiddenRefreshConfigs) {
      expect(existsSync(join(repoRoot, forbiddenPath))).toBe(false);
    }
  });
});
