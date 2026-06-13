# BigQuery Scheduled Query Setup

`agent_scores` is refreshed by BigQuery Scheduled Queries every 15 minutes. Do not use Vercel cron, Cloud Scheduler, or an app-side route for this refresh.

## Preconditions

1. Replace `PROJECT` and `DATASET` in `bigquery/agent_scores_scheduled_query.sql` with the confirmed BigQuery project and dataset IDs.
2. Use the confirmed Ethereum mainnet Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` from block `24339871`.
3. Use the confirmed Ethereum mainnet Reputation Registry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` from block `24339873`.
4. Do not add Validation Registry log reads until an official deployment address exists.
5. Run the count gate after changing registry filters. The confirmed-filter backfill dry run was `197368324020` bytes, so the 15-minute schedule must use the staged raw-event watermark path.
6. Confirm the scheduled-query service account can read `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs` and write `PROJECT.DATASET.agent_score_raw_events` and `PROJECT.DATASET.agent_scores`.

## Create The Schedule

```bash
bq mk --transfer_config \
  --project_id=PROJECT \
  --data_source=scheduled_query \
  --display_name='Refresh AgentTrust agent_scores' \
  --target_dataset=DATASET \
  --schedule='every 15 minutes' \
  --params='{"query":"'"$(python3 - <<'PY'
from pathlib import Path
print(Path("bigquery/agent_scores_scheduled_query.sql").read_text().replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n"))
PY
)"'"}'
```

The query first incrementally merges matching ERC-8004 logs into `PROJECT.DATASET.agent_score_raw_events`, partitioned by `block_timestamp` and clustered by address/topic/block. It then writes `PROJECT.DATASET.agent_scores` with `CREATE OR REPLACE TABLE` and clusters the materialized table by `verified_x402`, `declared_x402`, and `trust_score`.

The first run backfills from the registry deployment blocks. Later 15-minute runs use the maximum staged block/timestamp minus a reorg buffer, avoiding repeated full-history scans of the public logs table.

## App Boundary

Next.js and Vercel code must only read `PROJECT.DATASET.agent_scores`. Raw Ethereum Mainnet log reads belong in `bigquery/agent_scores_scheduled_query.sql`.
