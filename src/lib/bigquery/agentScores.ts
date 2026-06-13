import { BigQuery } from "@google-cloud/bigquery";

export type BigQueryEnv = Record<string, string | undefined> & {
  BIGQUERY_PROJECT_ID?: string;
  BIGQUERY_DATASET_ID?: string;
  BIGQUERY_AGENT_SCORES_TABLE?: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
};

export type BigQueryConfig = {
  projectId: string;
  datasetId: string;
  agentScoresTable: string;
  agentScoresTableRef: string;
};

export type AgentScore = {
  agent_id: string;
  owner_address: string;
  display_name: string | null;
  agent_uri: string | null;
  registered_at_block: number;
  registered_at_timestamp: string | null;
  identity_registry_address: string;
  reputation_registry_address: string;
  validation_registry_address: string | null;
  feedback_events: number;
  positive_feedback_events: number;
  negative_feedback_events: number;
  validation_requests: number;
  validation_responses: number;
  successful_validations: number;
  declared_x402: boolean;
  verified_x402: boolean;
  x402_endpoint: string | null;
  last_x402_verified_at: string | null;
  trust_score: number;
  trust_score_breakdown: Record<string, unknown>;
  score_version: string;
  updated_at: string;
};

export type AgentScoreFilters = {
  search?: string | null;
  verifiedX402Only?: boolean;
  limit?: number;
};

export type AgentScoresListQueryOptions = {
  query: string;
  params: {
    search: string | null;
    verifiedX402Only: boolean;
    limit: number;
  };
  types: {
    search: "STRING";
    verifiedX402Only: "BOOL";
    limit: "INT64";
  };
};

export type AgentScoreByIdQueryOptions = {
  query: string;
  params: {
    agentId: string;
  };
  types: {
    agentId: "STRING";
  };
};

export type BigQueryQueryOptions =
  | AgentScoresListQueryOptions
  | AgentScoreByIdQueryOptions;

export type BigQueryQueryClient = {
  query(options: BigQueryQueryOptions): Promise<[AgentScore[]]>;
};

export type ListAgentScoresOptions = {
  client?: BigQueryQueryClient;
  config?: BigQueryConfig;
  env?: BigQueryEnv;
  filters?: AgentScoreFilters;
};

export type GetAgentScoreByIdOptions = {
  agentId: string;
  client?: BigQueryQueryClient;
  config?: BigQueryConfig;
  env?: BigQueryEnv;
};

const DEFAULT_AGENT_SCORES_TABLE = "agent_scores";
const MAX_QUERY_LIMIT = 100;
const AGENT_SCORE_SELECT_FIELDS = `
  agent_id,
  owner_address,
  display_name,
  agent_uri,
  registered_at_block,
  registered_at_timestamp,
  identity_registry_address,
  reputation_registry_address,
  validation_registry_address,
  feedback_events,
  positive_feedback_events,
  negative_feedback_events,
  validation_requests,
  validation_responses,
  successful_validations,
  declared_x402,
  verified_x402,
  x402_endpoint,
  last_x402_verified_at,
  CAST(trust_score AS FLOAT64) AS trust_score,
  trust_score_breakdown,
  score_version,
  updated_at
`.trim();

export function loadBigQueryConfig(env: BigQueryEnv = process.env): BigQueryConfig {
  const projectId = readRequiredEnv("BIGQUERY_PROJECT_ID", env);
  const datasetId = readRequiredEnv("BIGQUERY_DATASET_ID", env);
  const agentScoresTable =
    env.BIGQUERY_AGENT_SCORES_TABLE?.trim() || DEFAULT_AGENT_SCORES_TABLE;

  assertBigQueryIdentifier("BIGQUERY_PROJECT_ID", projectId, "project");
  assertBigQueryIdentifier("BIGQUERY_DATASET_ID", datasetId, "dataset");
  assertBigQueryIdentifier(
    "BIGQUERY_AGENT_SCORES_TABLE",
    agentScoresTable,
    "table"
  );

  return {
    projectId,
    datasetId,
    agentScoresTable,
    agentScoresTableRef: `${projectId}.${datasetId}.${agentScoresTable}`
  };
}

export function buildAgentScoresQuery(
  filters: AgentScoreFilters = {},
  config: BigQueryConfig = loadBigQueryConfig()
): BigQueryQueryOptions {
  const search = normalizeSearch(filters.search);
  const verifiedX402Only = filters.verifiedX402Only ?? false;
  const limit = normalizeLimit(filters.limit);

  return {
    query: `
SELECT
  ${AGENT_SCORE_SELECT_FIELDS}
FROM \`${config.agentScoresTableRef}\`
WHERE (
  @search IS NULL
  OR @search = ''
  OR LOWER(owner_address) = LOWER(@search)
  OR CAST(agent_id AS STRING) = @search
  OR LOWER(COALESCE(display_name, '')) LIKE CONCAT('%', LOWER(@search), '%')
  OR LOWER(COALESCE(agent_uri, '')) LIKE CONCAT('%', LOWER(@search), '%')
)
AND (@verifiedX402Only = FALSE OR verified_x402 = TRUE)
ORDER BY trust_score DESC
LIMIT @limit
`.trim(),
    params: {
      search,
      verifiedX402Only,
      limit
    },
    types: {
      search: "STRING",
      verifiedX402Only: "BOOL",
      limit: "INT64"
    }
  };
}

export function buildAgentScoreByIdQuery(
  agentId: string,
  config: BigQueryConfig = loadBigQueryConfig()
): AgentScoreByIdQueryOptions {
  const normalizedAgentId = normalizeAgentId(agentId);

  return {
    query: `
SELECT
  ${AGENT_SCORE_SELECT_FIELDS}
FROM \`${config.agentScoresTableRef}\`
WHERE agent_id = @agentId
LIMIT 1
`.trim(),
    params: {
      agentId: normalizedAgentId
    },
    types: {
      agentId: "STRING"
    }
  };
}

export function createBigQueryClient(
  env: BigQueryEnv = process.env,
  config: BigQueryConfig = loadBigQueryConfig(env)
): BigQueryQueryClient {
  const clientEmail = env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(env.GOOGLE_PRIVATE_KEY);
  const bigQuery = new BigQuery(
    clientEmail && privateKey
      ? {
          projectId: config.projectId,
          credentials: {
            client_email: clientEmail,
            private_key: privateKey
          }
        }
      : {
          projectId: config.projectId
        }
  );

  return {
    async query(options) {
      const [rows] = await bigQuery.query(options);

      return [rows as AgentScore[]];
    }
  };
}

export async function listAgentScores({
  client,
  config,
  env,
  filters
}: ListAgentScoresOptions = {}): Promise<AgentScore[]> {
  const resolvedConfig = config ?? loadBigQueryConfig(env);
  const resolvedClient = client ?? createBigQueryClient(env, resolvedConfig);
  const query = buildAgentScoresQuery(filters, resolvedConfig);
  const [rows] = await resolvedClient.query(query);

  return rows;
}

export async function getAgentScoreById({
  agentId,
  client,
  config,
  env
}: GetAgentScoreByIdOptions): Promise<AgentScore | null> {
  const resolvedConfig = config ?? loadBigQueryConfig(env);
  const resolvedClient = client ?? createBigQueryClient(env, resolvedConfig);
  const query = buildAgentScoreByIdQuery(agentId, resolvedConfig);
  const [rows] = await resolvedClient.query(query);

  return rows[0] ?? null;
}

function readRequiredEnv(name: keyof BigQueryEnv, env: BigQueryEnv): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required BigQuery environment variables: ${name}`);
  }

  return value;
}

function normalizeSearch(search: AgentScoreFilters["search"]): string | null {
  if (search === undefined || search === null) {
    return null;
  }

  return search.trim();
}

function normalizeAgentId(agentId: string): string {
  const normalizedAgentId = agentId.trim();

  if (!normalizedAgentId) {
    throw new Error("agentId is required");
  }

  return normalizedAgentId;
}

function normalizeLimit(limit: AgentScoreFilters["limit"]): number {
  if (limit === undefined) {
    return 50;
  }

  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_QUERY_LIMIT);
}

function normalizePrivateKey(privateKey: string | undefined): string | undefined {
  return privateKey?.replace(/\\n/g, "\n").trim();
}

function assertBigQueryIdentifier(
  envName: string,
  value: string,
  kind: "dataset" | "project" | "table"
): void {
  const pattern =
    kind === "project" ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/;

  if (!pattern.test(value)) {
    throw new Error(`${envName} must be a simple BigQuery identifier`);
  }
}
