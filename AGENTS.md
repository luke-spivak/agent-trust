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
- Application BigQuery project ID: `UNCONFIRMED`.
- Application BigQuery dataset ID: `UNCONFIRMED`.
- Materialized table name: `agent_scores`.
- Fully qualified materialized table: `${BIGQUERY_PROJECT_ID}.${BIGQUERY_DATASET_ID}.agent_scores`.

The app and Vercel API routes must query only the materialized `agent_scores` table. Raw log reads belong only in the BigQuery Scheduled Query.

## ERC-8004 Registries

Official EF registry addresses must be confirmed from ERC-8004, ETHGlobal/Google sponsor materials, or Etherscan before implementation proceeds past the registry gate.

| Registry | Address | Deployment block |
| --- | --- | --- |
| Identity Registry | `UNCONFIRMED` | `UNCONFIRMED` |
| Reputation Registry | `UNCONFIRMED` | `UNCONFIRMED` |
| Validation Registry | `UNCONFIRMED` | `UNCONFIRMED` |

Event topic hashes must be verified against the deployed contract ABI with `cast keccak` or ABI tooling before scheduled-query SQL is treated as production-ready.

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
| `validation_registry_address` | `STRING` | Yes | Lowercase registry address used for provenance. |
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
| `trust_score` | `FLOAT64` | Yes | Ranking score used by the leaderboard. |
| `trust_score_breakdown` | `JSON` | Yes | Human-readable score inputs for the detail page. |
| `score_version` | `STRING` | Yes | Version label for scoring logic. |
| `updated_at` | `TIMESTAMP` | Yes | Scheduled-query write timestamp. |

Cluster `agent_scores` by `verified_x402`, `declared_x402`, and `trust_score`.

## Expected Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `BIGQUERY_PROJECT_ID` | Yes | Billing/project ID for app queries. Currently `UNCONFIRMED`. |
| `BIGQUERY_DATASET_ID` | Yes | Dataset containing `agent_scores`. Currently `UNCONFIRMED`. |
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
