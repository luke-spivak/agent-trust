# AgentTrust Finder Context

This file is the shared implementation context for AgentTrust Finder. Read it before making code changes. Do not replace `UNCONFIRMED` values with guesses.

## Commit Discipline

Every implementation commit after this file must use this prompt constraint:

`Write the test first. The implementation is done when the test passes.`

Do not batch tests into later commits unless the commit is only adding shared fixtures or test harness setup.

## BigQuery

- Scheduling mechanism: BigQuery Scheduled Queries.
- Do not use Vercel cron, Cloud Scheduler, app-side jobs, or API routes to refresh `agent_scores`.
- Refresh cadence: every 15 minutes.
- Raw Ethereum logs source: `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs`.
- Application BigQuery project ID: `agent-trust-499316`.
- Application BigQuery dataset ID: `erc8004`.
- Materialized table name: `agent_scores`.
- Incremental raw event staging table: `agent_score_raw_events`.
- Fully qualified materialized table: `${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.agent_scores`.

The app and Vercel API routes must query only the materialized `agent_scores` table. Raw log reads belong only in the BigQuery Scheduled Query. The scheduled query backfills/stages raw ERC-8004 events once, then scans from the staged table watermark with a reorg buffer before rebuilding `agent_scores`.

## ERC-8004 Registries

Official registry addresses were checked against the `erc-8004/erc-8004-contracts` README and Etherscan contract-creation transactions. The official 8004.org FAQ says the Validation Registry is still undergoing technical due diligence and is not yet available, so scheduled queries must not scan validation logs until an official deployment exists.

| Registry | Address | Deployment block | Status |
| --- | --- | --- | --- |
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `24339871` | Available on Ethereum mainnet. |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `24339873` | Available on Ethereum mainnet. |
| Validation Registry | None | None | Not deployed/available yet. |

Event topic hashes must be verified against the deployed contract ABI with `cast keccak` or ABI tooling before scheduled-query SQL is treated as production-ready.

| Event | Signature | Topic hash |
| --- | --- | --- |
| `Registered` | `Registered(uint256,string,address)` | `0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a` |
| `URIUpdated` | `URIUpdated(uint256,string,address)` | `0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb` |
| `MetadataSet` | `MetadataSet(uint256,string,string,bytes)` | `0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b` |
| `Transfer` | `Transfer(address,address,uint256)` | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |
| `NewFeedback` | `NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)` | `0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc` |
| `FeedbackRevoked` | `FeedbackRevoked(uint256,address,uint64)` | `0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d` |
| `ResponseAppended` | `ResponseAppended(uint256,address,uint64,address,string,bytes32)` | `0xb1c6be0b5b8aef6539e2fac0fd131a2faa7b49edf8e505b5eb0ad487d56051d4` |
| `ValidationRequest` | `ValidationRequest(address,uint256,string,bytes32)` | `0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059` |
| `ValidationResponse` | `ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)` | `0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae` |

BigQuery count gate against `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs` with the confirmed Identity/Reputation address, block, timestamp, and topic filters:

| Topic | Count | First block | Last observed block |
| --- | ---: | ---: | ---: |
| Identity `MetadataSet` | `52789` | `24339925` | `25309299` |
| Identity `URIUpdated` | `1365` | `24341020` | `25304064` |
| Identity `Registered` | `34556` | `24339925` | `25309299` |
| Identity `Transfer` | `49305` | `24339925` | `25309299` |
| Reputation `NewFeedback` | `3173` | `24341987` | `25302040` |
| Reputation `ResponseAppended` | `37` | `24342333` | `24975917` |
| Reputation `FeedbackRevoked` | `0` | n/a | n/a |

The filtered full backfill dry run estimated `197368324020` bytes. The scheduled query must use `agent_score_raw_events` watermarks for 15-minute runs instead of repeatedly scanning the full public log range.

## `agent_scores` Schema

The BigQuery Scheduled Query writes one row per discoverable agent.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `agent_id` | `STRING` | Yes | Canonical ERC-8004 agent identifier, stored as a string for exact search. |
| `owner_address` | `STRING` | Yes | Lowercase owner wallet address. |
| `display_name` | `STRING` | No | On-chain name when available. |
| `agent_uri` | `STRING` | No | On-chain URI only; off-chain metadata is resolved on detail pages. |
| `registered_at_block` | `INT64` | Yes | Block number of the active registration. |
| `registered_at_timestamp` | `TIMESTAMP` | No | Block timestamp when available from the source query. |
| `identity_registry_address` | `STRING` | Yes | Lowercase registry address used for provenance. |
| `reputation_registry_address` | `STRING` | Yes | Lowercase registry address used for provenance. |
| `validation_registry_address` | `STRING` | No | Null until an official Validation Registry deployment exists. |
| `feedback_events` | `INT64` | Yes | Count of non-revoked feedback events. |
| `positive_feedback_events` | `INT64` | Yes | Count of non-revoked positive feedback events, if decodable. |
| `negative_feedback_events` | `INT64` | Yes | Count of non-revoked negative feedback events, if decodable. |
| `validation_requests` | `INT64` | Yes | Count of validation request events. |
| `validation_responses` | `INT64` | Yes | Count of validation response events. |
| `successful_validations` | `INT64` | Yes | Count of successful validation responses, if decodable. |
| `declared_x402` | `BOOL` | Yes | True when on-chain name or URI declares x402 support. |
| `verified_x402` | `BOOL` | Yes | True only when a live probe has verified an x402 challenge, or when trusted demo seed data marks it verified. |
| `x402_endpoint` | `STRING` | No | Endpoint selected for live x402 verification. |
| `last_x402_verified_at` | `TIMESTAMP` | No | Timestamp of latest successful live x402 probe. |
| `trust_score` | `NUMERIC` | Yes | Ranking score used by the leaderboard. BigQuery clustering does not allow `FLOAT64`. |
| `trust_score_breakdown` | `JSON` | Yes | Human-readable score inputs for the detail page. |
| `score_version` | `STRING` | Yes | Version label for scoring logic. |
| `updated_at` | `TIMESTAMP` | Yes | Scheduled-query write timestamp. |

Cluster `agent_scores` by `verified_x402`, `declared_x402`, and `trust_score`.

## Expected Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `BIGQUERY_PROJECT_ID` | Yes | Billing/project ID for app queries: `agent-trust-499316`. |
| `BIGQUERY_DATASET_ID` | Yes | Dataset containing `agent_scores`: `erc8004`. |
| `BIGQUERY_AGENT_SCORES_TABLE` | Yes | Defaults to `agent_scores`. |
| `GOOGLE_CLIENT_EMAIL` | Yes in Vercel | Service account client email for BigQuery reads. |
| `GOOGLE_PRIVATE_KEY` | Yes in Vercel | Service account private key. Preserve embedded newlines. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local only | Optional path for local Google credentials. |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical deployment URL, used by demo x402 payloads. |
| `IPFS_GATEWAY_BASE_URL` | Yes | Public gateway base URL for `ipfs://` URI previews. |
| `X402_PROBE_TIMEOUT_MS` | Yes | Timeout for live endpoint probes. |
| `X402_DEMO_NETWORK` | Yes | Demo payment network, expected `eip155:8453` unless sponsor guidance changes. |
| `X402_DEMO_ASSET` | Yes | Demo payment asset contract address. Currently `UNCONFIRMED`. |
| `X402_DEMO_PAY_TO` | Yes | Demo recipient wallet. Currently `UNCONFIRMED`. |
| `X402_DEMO_AMOUNT` | Yes | Demo payment amount in asset base units. |

## x402 Header Format

Status: `UNCONFIRMED` until checked against the current x402 HTTP transport specification.

The live probe expects an unauthenticated request to return:

- HTTP status: `402 Payment Required`
- Header name: `PAYMENT-REQUIRED`
- Header value: base64-encoded JSON

Expected decoded JSON shape:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://agenttrust-finder.vercel.app/api/demo-paid-agent",
    "description": "Demo paid agent endpoint",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "10000",
      "asset": "UNCONFIRMED",
      "payTo": "UNCONFIRMED",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {}
}
```

Verification succeeds only when the response status is `402`, the `PAYMENT-REQUIRED` header exists, and the decoded value matches the confirmed x402 v2 `PaymentRequired` format.
