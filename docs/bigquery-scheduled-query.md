# BigQuery Scheduled Query Setup

`agent_scores` is refreshed by BigQuery Scheduled Queries every 15 minutes. Do not use Vercel cron, Cloud Scheduler, or an app-side route for this refresh.

## Preconditions

1. Replace `PROJECT` and `DATASET` in `bigquery/agent_scores_scheduled_query.sql` with the confirmed BigQuery project and dataset IDs.
2. Replace all `UNCONFIRMED` registry addresses, deployment blocks, event signatures, and topic hashes only after checking sponsor materials or Etherscan.
3. Run the count gate from `PLAN.md`. If `distinct_registered_agents < 20`, stop and ask sponsors for the intended address set.
4. Confirm the scheduled-query service account can read `bigquery-public-data.goog_blockchain_ethereum_mainnet_us.logs` and write `PROJECT.DATASET.agent_scores`.

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

The query writes `PROJECT.DATASET.agent_scores` with `CREATE OR REPLACE TABLE` and clusters the materialized table by `verified_x402`, `declared_x402`, and `trust_score`.

## App Boundary

Next.js and Vercel code must only read `PROJECT.DATASET.agent_scores`. Raw Ethereum Mainnet log reads belong in `bigquery/agent_scores_scheduled_query.sql`.
