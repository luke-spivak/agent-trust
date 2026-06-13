# AgentTrust Finder

Human-first discovery for trustworthy, payable ERC-8004 agents.

## Status

This repository is being built commit by commit from `PLAN.md`. Before changing implementation code, read `AGENTS.md` for the current BigQuery, registry, schema, environment, and x402 constraints.

## Architecture

- Next.js app deployed on Vercel.
- BigQuery Scheduled Queries refresh `agent_scores` every 15 minutes.
- Vercel routes query only the materialized `agent_scores` table.
- Raw Ethereum Mainnet logs are read only by the scheduled query.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Checks

```bash
npm run test
npm run lint
npm run build
```

## Environment

See `.env.example` and `AGENTS.md` for required variables. Values marked `UNCONFIRMED` are limited to x402 demo payment fields that still need sponsor/spec confirmation.

## Next Implementation Step

Continue with the app/API implementation against the materialized `agent_scores` table. Write the test first; the implementation is done when the test passes.
