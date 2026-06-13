# AgentTrust Finder: Human-First Discovery For Payable ERC-8004 Agents

## Summary
Build a Vercel-hosted directory for humans to find trustworthy, payable ERC-8004 agents. The core demo is a fast Trust Score leaderboard backed by a BigQuery Scheduled Query that materializes `agent_scores` every 15 minutes, plus an x402 toggle and a live verification button.

References: [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), [Google Blockchain Analytics schema](https://docs.cloud.google.com/blockchain-analytics/docs/schema), [x402 HTTP transport spec](https://raw.githubusercontent.com/coinbase/x402/main/specs/transports-v2/http.md).

## Pre-Hackathon Checklist
1. Find and hardcode the official EF ERC-8004 Identity, Reputation, and Validation registry addresses from ERC-8004 or ETHGlobal/Google sponsor materials.
2. Confirm each deployment block from sponsor materials or Etherscan. Use deployment blocks, not guessed timestamps.
3. Verify event topic hashes against the deployed contract ABI with `cast keccak` or ABI tooling before running counts.
4. Run the mainnet count gate. If `distinct_registered_agents < 20`, stop this plan and ask sponsors for the intended address set.

```sql
DECLARE identity_registry STRING DEFAULT '0x_official_identity_registry';
DECLARE reputation_registry STRING DEFAULT '0x_official_reputation_registry';
DECLARE validation_registry STRING DEFAULT '0x_official_validation_registry';

DECLARE identity_start_block INT64 DEFAULT 0;
DECLARE reputation_start_block INT64 DEFAULT 0;
DECLARE validation_start_block INT64 DEFAULT 0;

DECLARE registered_topic STRING DEFAULT '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
DECLARE new_feedback_topic STRING DEFAULT '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc';
DECLARE validation_request_topic STRING DEFAULT '0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059';
DECLARE validation_response_topic STRING DEFAULT '0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae';

WITH scoped_logs AS (
  SELECT transaction_hash, log_index, block_number, LOWER(address) AS address, topics
  FROM `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`
  WHERE (
    (LOWER(address) = LOWER(identity_registry) AND block_number >= identity_start_block)
    OR (LOWER(address) = LOWER(reputation_registry) AND block_number >= reputation_start_block)
    OR (LOWER(address) = LOWER(validation_registry) AND block_number >= validation_start_block)
  )
  AND topics[SAFE_OFFSET(0)] IN (
    registered_topic, new_feedback_topic, validation_request_topic, validation_response_topic
  )
)
SELECT
  COUNT(DISTINCT IF(address = LOWER(identity_registry) AND topics[SAFE_OFFSET(0)] = registered_topic, topics[SAFE_OFFSET(1)], NULL)) AS distinct_registered_agents,
  COUNTIF(address = LOWER(reputation_registry) AND topics[SAFE_OFFSET(0)] = new_feedback_topic) AS feedback_events,
  COUNTIF(address = LOWER(validation_registry) AND topics[SAFE_OFFSET(0)] = validation_request_topic) AS validation_requests,
  COUNTIF(address = LOWER(validation_registry) AND topics[SAFE_OFFSET(0)] = validation_response_topic) AS validation_responses
FROM scoped_logs;
```

## Architecture Decisions
- Vercel hosts Next.js frontend and API routes.
- BigQuery does all raw Ethereum Mainnet log querying.
- Use BigQuery Scheduled Queries, not Vercel cron or Cloud Scheduler, to `CREATE OR REPLACE TABLE PROJECT.DATASET.agent_scores` every 15 minutes.
- `agent_scores` is a small materialized table clustered by `verified_x402`, `declared_x402`, and `trust_score`; Vercel routes never query raw `logs`.
- Leaderboard does not fetch off-chain metadata. It shows on-chain name if available, URI preview, owner, agent ID, Trust Score, and x402 status.
- Detail page resolves `agentURI` on demand using `https://`, `data:`, or one public IPFS gateway.

## Search And x402
- Search runs only against materialized `agent_scores`.
- Fields:
  - `display_name`: wildcard `LIKE`
  - `owner_address`: exact lowercase equality
  - `agent_id`: exact string equality
  - `agent_uri`: wildcard `LIKE`

```sql
SELECT *
FROM `PROJECT.DATASET.agent_scores`
WHERE @search IS NULL OR @search = ''
   OR LOWER(owner_address) = LOWER(@search)
   OR CAST(agent_id AS STRING) = @search
   OR LOWER(COALESCE(display_name, '')) LIKE CONCAT('%', LOWER(@search), '%')
   OR LOWER(COALESCE(agent_uri, '')) LIKE CONCAT('%', LOWER(@search), '%')
ORDER BY trust_score DESC
LIMIT 50;
```

- x402 probe contract:
  - `POST /api/x402-probe` fires only when the user clicks `Verify live x402` on an agent detail page.
  - It sends an unauthenticated request to the selected agent endpoint.
  - It marks verified only if response status is `402` and header `PAYMENT-REQUIRED` exists.
  - The `PAYMENT-REQUIRED` value must be base64-encoded JSON matching x402 v2 `PaymentRequired`.

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://agenttrust-finder.vercel.app/api/demo-paid-agent",
    "description": "Demo paid agent endpoint",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "10000",
    "asset": "0x_base_usdc_contract",
    "payTo": "0x_team_wallet",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USDC", "version": "2" }
  }],
  "extensions": {}
}
```

- While probing, show a disabled button, spinner, and “Checking payment challenge…”.
- Success shows `Verified x402`, timestamp, endpoint, `network`, `asset`, `amount`, and `payTo`.
- Failure shows `Declared only`, `No x402 challenge`, `Timed out`, or `Endpoint unreachable`.
- Add controlled endpoint `/api/demo-paid-agent` returning HTTP `402 Payment Required` plus the base64 `PAYMENT-REQUIRED` header, then register or seed one demo agent pointing to it.

## Build Plan
- Hours 0-3: complete checklist, verify ABI topic hashes, confirm deployment blocks, run count gate.
- Hours 3-8: scaffold Next.js on Vercel, configure BigQuery env, define dataset/table names.
- Hours 8-18: create BigQuery Scheduled Query for `agent_scores`, including scoring, revocations, validation summaries, and x402 declared status.
- Hours 18-26: build leaderboard, Trust Score cards, x402 toggle, and exact plain-text search.
- Hours 26-32: build detail page with on-demand URI resolution and score explanation.
- Hours 32-38: implement x402 probe route and controlled `/api/demo-paid-agent`.
- Hours 38-44: polish empty/loading/error states and register or seed the controlled demo agent.
- Hours 44-48: deploy to Vercel, verify BigQuery proof, write README, rehearse judging script.

## Tests And Acceptance
- SQL tests for event topic matching, registration, feedback, revocation, validation request, and validation response decoding.
- Scheduled-query test proving `agent_scores` refreshes and Vercel queries only the materialized table.
- Score tests proving revoked feedback is excluded and verified x402 improves rank.
- Search tests for owner equality, agent ID equality, display-name substring, and URI substring.
- Probe tests for valid base64 `PAYMENT-REQUIRED`, malformed header, non-x402 402, timeout, redirect, and unreachable endpoint.
- Acceptance: a judge can open the app, toggle x402-capable agents, click a top result, understand the Trust Score, and verify a live x402 endpoint.

## 90-Second Judging Script
1. Click the Vercel URL. “This is AgentTrust Finder, a human-first directory for discovering trustworthy ERC-8004 agents that can actually get paid.”
2. Point to the leaderboard. “Every ranked row comes from a BigQuery Scheduled Query over raw Ethereum Mainnet ERC-8004 registry logs.”
3. Click the x402 toggle. “Now we narrow discovery to agents that advertise or verify x402 payment support.”
4. Click the top demo agent. “The detail page turns on-chain reputation and validation history into a human-readable trust explanation.”
5. Open the proof panel. “These inputs are from the official EF Identity, Reputation, and Validation registry addresses.”
6. Click `Verify live x402`. “We now test whether this endpoint really returns the x402 `PAYMENT-REQUIRED` payment challenge.”
7. End on the detail page showing the Trust Score breakdown beside the bright `Verified x402` badge. “This is the trusted marketplace view for payable agents.”
