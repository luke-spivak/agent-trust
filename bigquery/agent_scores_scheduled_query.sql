-- AgentTrust Finder scheduled refresh.
-- Runner: BigQuery Scheduled Queries, every 15 minutes.
-- Validation Registry is not yet available, so this query does not scan
-- validation logs until an official deployment address exists.

DECLARE identity_registry STRING DEFAULT '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432';
DECLARE reputation_registry STRING DEFAULT '0x8004baa17c55a88189ae136b182e5fda19de9b63';

DECLARE identity_start_block INT64 DEFAULT 24339871;
DECLARE reputation_start_block INT64 DEFAULT 24339873;
DECLARE earliest_registry_timestamp TIMESTAMP DEFAULT TIMESTAMP('2026-01-29 10:20:23 UTC');

DECLARE registered_topic STRING DEFAULT '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
DECLARE uri_updated_topic STRING DEFAULT '0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb';
DECLARE transfer_topic STRING DEFAULT '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
DECLARE new_feedback_topic STRING DEFAULT '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc';
DECLARE feedback_revoked_topic STRING DEFAULT '0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d';

DECLARE reorg_buffer_blocks INT64 DEFAULT 128;
DECLARE reorg_buffer_hours INT64 DEFAULT 2;
DECLARE refresh_from_block INT64 DEFAULT LEAST(identity_start_block, reputation_start_block);
DECLARE refresh_from_timestamp TIMESTAMP DEFAULT earliest_registry_timestamp;
DECLARE score_version STRING DEFAULT 'agenttrust-v1';

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

CREATE TEMP FUNCTION topic_uint256(topic STRING)
RETURNS STRING
LANGUAGE js AS r"""
  function hexToDecimal(hex) {
    const digits = [0];
    for (let i = 0; i < hex.length; i++) {
      let carry = Number.parseInt(hex[i], 16);
      if (!Number.isFinite(carry)) return null;

      for (let j = digits.length - 1; j >= 0; j--) {
        const value = digits[j] * 16 + carry;
        digits[j] = value % 10;
        carry = Math.floor(value / 10);
      }

      while (carry > 0) {
        digits.unshift(carry % 10);
        carry = Math.floor(carry / 10);
      }
    }

    return digits.join('').replace(/^0+(?=\d)/, '');
  }

  const clean = (topic || '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return hexToDecimal(clean);
""";

CREATE TEMP FUNCTION abi_uint_to_string(data STRING, slot INT64)
RETURNS STRING
LANGUAGE js AS r"""
  function hexToDecimal(hex) {
    const digits = [0];
    for (let i = 0; i < hex.length; i++) {
      let carry = Number.parseInt(hex[i], 16);
      if (!Number.isFinite(carry)) return null;

      for (let j = digits.length - 1; j >= 0; j--) {
        const value = digits[j] * 16 + carry;
        digits[j] = value % 10;
        carry = Math.floor(value / 10);
      }

      while (carry > 0) {
        digits.unshift(carry % 10);
        carry = Math.floor(carry / 10);
      }
    }

    return digits.join('').replace(/^0+(?=\d)/, '');
  }

  const clean = (data || '').replace(/^0x/, '');
  const word = clean.slice(slot * 64, slot * 64 + 64);
  if (!/^[0-9a-fA-F]{64}$/.test(word)) return null;
  return hexToDecimal(word);
""";

CREATE TEMP FUNCTION abi_int_to_float(data STRING, slot INT64)
RETURNS FLOAT64
LANGUAGE js AS r"""
  const clean = (data || '').replace(/^0x/, '');
  const word = clean.slice(slot * 64, slot * 64 + 64);
  if (!/^[0-9a-fA-F]{64}$/.test(word)) return null;
  if (/^0+$/.test(word)) return 0;

  const highNibble = Number.parseInt(word[0], 16);
  if (highNibble >= 8) return -1;
  return 1;
""";

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

CREATE TABLE IF NOT EXISTS `PROJECT.DATASET.agent_score_raw_events` (
  transaction_hash STRING NOT NULL,
  log_index INT64 NOT NULL,
  block_number INT64 NOT NULL,
  block_timestamp TIMESTAMP NOT NULL,
  address STRING NOT NULL,
  topic0 STRING NOT NULL,
  topic1 STRING,
  topic2 STRING,
  topic3 STRING,
  data STRING
)
PARTITION BY DATE(block_timestamp)
CLUSTER BY address, topic0, block_number
OPTIONS (
  expiration_timestamp = NULL
);

SET refresh_from_block = (
  SELECT
    GREATEST(
      LEAST(identity_start_block, reputation_start_block),
      COALESCE(MAX(block_number) - reorg_buffer_blocks, LEAST(identity_start_block, reputation_start_block))
    )
  FROM `PROJECT.DATASET.agent_score_raw_events`
);

SET refresh_from_timestamp = (
  SELECT
    COALESCE(
      TIMESTAMP_SUB(MAX(block_timestamp), INTERVAL reorg_buffer_hours HOUR),
      earliest_registry_timestamp
    )
  FROM `PROJECT.DATASET.agent_score_raw_events`
);

MERGE `PROJECT.DATASET.agent_score_raw_events` AS target
USING (
  SELECT
    transaction_hash,
    log_index,
    block_number,
    block_timestamp,
    LOWER(address) AS address,
    topics[SAFE_OFFSET(0)] AS topic0,
    topics[SAFE_OFFSET(1)] AS topic1,
    topics[SAFE_OFFSET(2)] AS topic2,
    topics[SAFE_OFFSET(3)] AS topic3,
    data
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`
  WHERE block_timestamp >= refresh_from_timestamp
    AND block_number >= refresh_from_block
    AND (
      (LOWER(address) = LOWER(identity_registry) AND block_number >= identity_start_block)
      OR (LOWER(address) = LOWER(reputation_registry) AND block_number >= reputation_start_block)
    )
    AND topics[SAFE_OFFSET(0)] IN (
      registered_topic,
      uri_updated_topic,
      transfer_topic,
      new_feedback_topic,
      feedback_revoked_topic
    )
    AND removed IS NOT TRUE
) AS source
ON target.transaction_hash = source.transaction_hash
  AND target.log_index = source.log_index
  AND target.address = source.address
  AND target.topic0 = source.topic0
WHEN NOT MATCHED THEN
  INSERT (
    transaction_hash,
    log_index,
    block_number,
    block_timestamp,
    address,
    topic0,
    topic1,
    topic2,
    topic3,
    data
  )
  VALUES (
    source.transaction_hash,
    source.log_index,
    source.block_number,
    source.block_timestamp,
    source.address,
    source.topic0,
    source.topic1,
    source.topic2,
    source.topic3,
    source.data
  );

CREATE OR REPLACE TABLE `PROJECT.DATASET.agent_scores`
CLUSTER BY verified_x402, declared_x402, trust_score
OPTIONS (
  expiration_timestamp = NULL
)
AS
WITH scoped_logs AS (
  SELECT
    transaction_hash,
    log_index,
    block_number,
    block_timestamp,
    address,
    topic0,
    topic1,
    topic2,
    topic3,
    data
  FROM `PROJECT.DATASET.agent_score_raw_events`
),
registrations AS (
  SELECT
    topic_uint256(topic1) AS agent_id,
    topic_address(topic2) AS registered_owner_address,
    NULLIF(abi_string(data, 0), '') AS registered_agent_uri,
    block_number AS registered_at_block,
    block_timestamp AS registered_at_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY topic_uint256(topic1)
      ORDER BY block_number ASC, log_index ASC
    ) AS registration_rank
  FROM scoped_logs
  WHERE address = LOWER(identity_registry)
    AND topic0 = registered_topic
    AND topic_uint256(topic1) IS NOT NULL
),
registered_agents AS (
  SELECT
    agent_id,
    registered_owner_address,
    registered_agent_uri,
    registered_at_block,
    registered_at_timestamp
  FROM registrations
  WHERE registration_rank = 1
),
uri_updates AS (
  SELECT
    topic_uint256(topic1) AS agent_id,
    NULLIF(abi_string(data, 0), '') AS agent_uri,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(identity_registry)
    AND topic0 = uri_updated_topic
    AND topic_uint256(topic1) IS NOT NULL
),
latest_agent_uris AS (
  SELECT
    agent_id,
    agent_uri
  FROM (
    SELECT
      agent_id,
      registered_agent_uri AS agent_uri,
      registered_at_block AS block_number,
      0 AS log_index
    FROM registered_agents
    WHERE registered_agent_uri IS NOT NULL

    UNION ALL

    SELECT
      agent_id,
      agent_uri,
      block_number,
      log_index
    FROM uri_updates
    WHERE agent_uri IS NOT NULL
  )
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY agent_id
    ORDER BY block_number DESC, log_index DESC
  ) = 1
),
transfer_events AS (
  SELECT
    topic_uint256(topic3) AS agent_id,
    topic_address(topic2) AS to_address,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(identity_registry)
    AND topic0 = transfer_topic
    AND topic_uint256(topic3) IS NOT NULL
),
active_owners AS (
  SELECT
    agent_id,
    to_address AS owner_address
  FROM transfer_events
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY agent_id
    ORDER BY block_number DESC, log_index DESC
  ) = 1
),
active_registrations AS (
  SELECT
    registered_agents.agent_id,
    COALESCE(active_owners.owner_address, registered_agents.registered_owner_address) AS owner_address,
    CAST(NULL AS STRING) AS display_name,
    latest_agent_uris.agent_uri,
    registered_agents.registered_at_block,
    registered_agents.registered_at_timestamp
  FROM registered_agents
  LEFT JOIN active_owners
    ON active_owners.agent_id = registered_agents.agent_id
  LEFT JOIN latest_agent_uris
    ON latest_agent_uris.agent_id = registered_agents.agent_id
),
feedback_events AS (
  SELECT
    topic_uint256(topic1) AS agent_id,
    topic_address(topic2) AS client_address,
    abi_uint_to_string(data, 0) AS feedback_index,
    abi_int_to_float(data, 1) AS feedback_value,
    CONCAT(
      topic_uint256(topic1),
      ':',
      topic_address(topic2),
      ':',
      abi_uint_to_string(data, 0)
    ) AS feedback_key,
    block_number,
    log_index
  FROM scoped_logs
  WHERE address = LOWER(reputation_registry)
    AND topic0 = new_feedback_topic
    AND topic_uint256(topic1) IS NOT NULL
),
revoked_feedback AS (
  SELECT DISTINCT
    CONCAT(
      topic_uint256(topic1),
      ':',
      topic_address(topic2),
      ':',
      topic_uint256(topic3)
    ) AS feedback_key
  FROM scoped_logs
  WHERE address = LOWER(reputation_registry)
    AND topic0 = feedback_revoked_topic
    AND topic_uint256(topic1) IS NOT NULL
),
non_revoked_feedback AS (
  SELECT feedback_events.*
  FROM feedback_events
  LEFT JOIN revoked_feedback AS revoked
    ON revoked.feedback_key = feedback_events.feedback_key
  WHERE revoked.feedback_key IS NULL
),
feedback_summary AS (
  SELECT
    agent_id,
    COUNT(*) AS feedback_events,
    COUNTIF(feedback_value > 0) AS positive_feedback_events,
    COUNTIF(feedback_value < 0) AS negative_feedback_events
  FROM non_revoked_feedback
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
    CAST(NULL AS STRING) AS validation_registry_address,
    COALESCE(feedback_summary.feedback_events, 0) AS feedback_events,
    COALESCE(feedback_summary.positive_feedback_events, 0) AS positive_feedback_events,
    COALESCE(feedback_summary.negative_feedback_events, 0) AS negative_feedback_events,
    0 AS validation_requests,
    0 AS validation_responses,
    0 AS successful_validations,
    REGEXP_CONTAINS(
      LOWER(COALESCE(active.agent_uri, '')),
      r'(^|[^a-z0-9])x402([^a-z0-9]|$)'
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
