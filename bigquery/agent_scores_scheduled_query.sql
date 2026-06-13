-- AgentTrust Finder scheduled refresh.
-- Runner: BigQuery Scheduled Queries, every 15 minutes.
-- Replace PROJECT, DATASET, registry addresses, deployment blocks, signatures,
-- and topic hashes only after confirmation from sponsor materials or Etherscan.

DECLARE identity_registry STRING DEFAULT 'UNCONFIRMED';
DECLARE reputation_registry STRING DEFAULT 'UNCONFIRMED';
DECLARE validation_registry STRING DEFAULT 'UNCONFIRMED';

DECLARE identity_start_block INT64 DEFAULT 0;
DECLARE reputation_start_block INT64 DEFAULT 0;
DECLARE validation_start_block INT64 DEFAULT 0;

DECLARE registered_topic STRING DEFAULT '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
DECLARE new_feedback_topic STRING DEFAULT '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc';
DECLARE feedback_revoked_topic STRING DEFAULT 'UNCONFIRMED';
DECLARE validation_request_topic STRING DEFAULT '0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059';
DECLARE validation_response_topic STRING DEFAULT '0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae';

DECLARE score_version STRING DEFAULT 'agenttrust-v0';

CREATE TEMP FUNCTION strip_0x(value STRING) AS (
  REGEXP_REPLACE(COALESCE(value, ''), r'^0x', '')
);

CREATE TEMP FUNCTION topic_address(topic STRING) AS (
  IF(
    topic IS NULL,
    NULL,
    LOWER(CONCAT('0x', RIGHT(strip_0x(topic), 40)))
  )
);

CREATE TEMP FUNCTION abi_bool(data STRING, slot INT64) AS (
  LOWER(RIGHT(SUBSTR(strip_0x(data), slot * 64 + 1, 64), 1)) = '1'
);

CREATE TEMP FUNCTION abi_string(data STRING, slot INT64)
RETURNS STRING
LANGUAGE js AS r"""
  const clean = (data || '').replace(/^0x/, '');
  const offsetHex = clean.slice(slot * 64, slot * 64 + 64);
  const offsetBytes = Number.parseInt(offsetHex || '0', 16);
  if (!Number.isFinite(offsetBytes) || offsetBytes < 0) return null;

  const lengthStart = offsetBytes * 2;
  const lengthHex = clean.slice(lengthStart, lengthStart + 64);
  const length = Number.parseInt(lengthHex || '0', 16);
  if (!Number.isFinite(length) || length <= 0) return null;

  const payload = clean.slice(lengthStart + 64, lengthStart + 64 + length * 2);
  const escaped = [];
  for (let i = 0; i < payload.length; i += 2) {
    escaped.push('%' + payload.slice(i, i + 2));
  }

  try {
    return decodeURIComponent(escaped.join(''));
  } catch (_error) {
    return null;
  }
""";

CREATE OR REPLACE TABLE `PROJECT.DATASET.agent_scores`
CLUSTER BY verified_x402, declared_x402, trust_score
AS
WITH scoped_logs AS (
  SELECT
    transaction_hash,
    log_index,
    block_number,
    block_timestamp,
    LOWER(address) AS address,
    topics,
    data
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`
  WHERE (
    (LOWER(address) = LOWER(identity_registry) AND block_number >= identity_start_block)
    OR (LOWER(address) = LOWER(reputation_registry) AND block_number >= reputation_start_block)
    OR (LOWER(address) = LOWER(validation_registry) AND block_number >= validation_start_block)
  )
  AND topics[SAFE_OFFSET(0)] IN (
    registered_topic,
    new_feedback_topic,
    feedback_revoked_topic,
    validation_request_topic,
    validation_response_topic
  )
),
registrations AS (
  SELECT
    LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING)))) AS agent_id,
    topic_address(topics[SAFE_OFFSET(2)]) AS owner_address,
    NULLIF(abi_string(data, 0), '') AS display_name,
    NULLIF(abi_string(data, 1), '') AS agent_uri,
    block_number AS registered_at_block,
    block_timestamp AS registered_at_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING))))
      ORDER BY block_number DESC, log_index DESC
    ) AS registration_rank
  FROM scoped_logs
  WHERE address = LOWER(identity_registry)
    AND topics[SAFE_OFFSET(0)] = registered_topic
),
active_registrations AS (
  SELECT
    agent_id,
    owner_address,
    display_name,
    agent_uri,
    registered_at_block,
    registered_at_timestamp
  FROM registrations
  WHERE registration_rank = 1
),
feedback_events AS (
  SELECT
    LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING)))) AS feedback_id,
    LOWER(COALESCE(topics[SAFE_OFFSET(2)], topics[SAFE_OFFSET(1)])) AS agent_id,
    COALESCE(abi_bool(data, 0), TRUE) AS is_positive,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(reputation_registry)
    AND topics[SAFE_OFFSET(0)] = new_feedback_topic
),
revoked_feedback AS (
  SELECT DISTINCT
    LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING)))) AS feedback_id
  FROM scoped_logs
  WHERE address = LOWER(reputation_registry)
    AND topics[SAFE_OFFSET(0)] = feedback_revoked_topic
),
non_revoked_feedback AS (
  SELECT feedback_events.*
  FROM feedback_events
  LEFT JOIN revoked_feedback AS revoked
    ON revoked.feedback_id = feedback_events.feedback_id
  WHERE revoked.feedback_id IS NULL
),
feedback_summary AS (
  SELECT
    agent_id,
    COUNT(*) AS feedback_events,
    COUNTIF(is_positive) AS positive_feedback_events,
    COUNTIF(NOT is_positive) AS negative_feedback_events
  FROM non_revoked_feedback
  GROUP BY agent_id
),
validation_requests AS (
  SELECT
    LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING)))) AS request_id,
    LOWER(COALESCE(topics[SAFE_OFFSET(2)], topics[SAFE_OFFSET(1)])) AS agent_id,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(validation_registry)
    AND topics[SAFE_OFFSET(0)] = validation_request_topic
),
validation_responses AS (
  SELECT
    LOWER(COALESCE(topics[SAFE_OFFSET(1)], CONCAT(transaction_hash, '-', CAST(log_index AS STRING)))) AS request_id,
    LOWER(COALESCE(topics[SAFE_OFFSET(2)], topics[SAFE_OFFSET(1)])) AS agent_id,
    COALESCE(abi_bool(data, 0), FALSE) AS successful,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(validation_registry)
    AND topics[SAFE_OFFSET(0)] = validation_response_topic
),
validation_summary AS (
  SELECT
    agent_id,
    SUM(validation_request_events) AS validation_request_events,
    SUM(validation_response_events) AS validation_response_events,
    SUM(successful_validation_events) AS successful_validations
  FROM (
    SELECT
      agent_id,
      COUNT(*) AS validation_request_events,
      0 AS validation_response_events,
      0 AS successful_validation_events
    FROM validation_requests
    GROUP BY agent_id

    UNION ALL

    SELECT
      agent_id,
      0 AS validation_request_events,
      COUNT(*) AS validation_response_events,
      COUNTIF(successful) AS successful_validation_events
    FROM validation_responses
    GROUP BY agent_id
  )
  GROUP BY agent_id
),
scored_agents AS (
  SELECT
    active.agent_id,
    COALESCE(active.owner_address, '0x0000000000000000000000000000000000000000') AS owner_address,
    active.display_name,
    active.agent_uri,
    active.registered_at_block,
    active.registered_at_timestamp,
    LOWER(identity_registry) AS identity_registry_address,
    LOWER(reputation_registry) AS reputation_registry_address,
    LOWER(validation_registry) AS validation_registry_address,
    COALESCE(feedback_summary.feedback_events, 0) AS feedback_events,
    COALESCE(feedback_summary.positive_feedback_events, 0) AS positive_feedback_events,
    COALESCE(feedback_summary.negative_feedback_events, 0) AS negative_feedback_events,
    COALESCE(validation_summary.validation_request_events, 0) AS validation_requests,
    COALESCE(validation_summary.validation_response_events, 0) AS validation_responses,
    COALESCE(validation_summary.successful_validations, 0) AS successful_validations,
    (
      REGEXP_CONTAINS(LOWER(COALESCE(active.display_name, '')), r'(^|[^a-z0-9])x402([^a-z0-9]|$)')
      OR REGEXP_CONTAINS(LOWER(COALESCE(active.agent_uri, '')), r'(^|[^a-z0-9])x402([^a-z0-9]|$)')
    ) AS declared_x402,
    FALSE AS verified_x402,
    IF(
      REGEXP_CONTAINS(LOWER(COALESCE(active.agent_uri, '')), r'^https?://')
      AND REGEXP_CONTAINS(LOWER(COALESCE(active.agent_uri, '')), r'x402'),
      active.agent_uri,
      NULL
    ) AS x402_endpoint,
    CAST(NULL AS TIMESTAMP) AS last_x402_verified_at
  FROM active_registrations AS active
  LEFT JOIN feedback_summary
    ON feedback_summary.agent_id = active.agent_id
  LEFT JOIN validation_summary
    ON validation_summary.agent_id = active.agent_id
),
ranked_agents AS (
  SELECT
    *,
    CAST(
      LEAST(
        100,
        ROUND(
          20
          + LEAST(35, LOG(1 + feedback_events) * 12)
          + LEAST(15, positive_feedback_events * 3)
          - LEAST(20, negative_feedback_events * 5)
          + LEAST(20, successful_validations * 5)
          + IF(declared_x402, 10, 0)
          + IF(verified_x402, 15, 0),
          2
        )
      ) AS NUMERIC
    ) AS trust_score
  FROM scored_agents
),
final_agents AS (
  SELECT
    *,
    ROW_NUMBER() OVER (ORDER BY trust_score DESC) AS score_rank
  FROM ranked_agents
)
SELECT
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
  trust_score,
  JSON_OBJECT(
    'base', 20,
    'feedback_events', feedback_events,
    'positive_feedback_events', positive_feedback_events,
    'negative_feedback_events', negative_feedback_events,
    'successful_validations', successful_validations,
    'declared_x402_bonus', IF(declared_x402, 10, 0),
    'verified_x402_bonus', IF(verified_x402, 15, 0)
  ) AS trust_score_breakdown,
  score_version,
  CURRENT_TIMESTAMP() AS updated_at
FROM final_agents;
