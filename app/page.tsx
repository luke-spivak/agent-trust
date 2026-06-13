import Link from "next/link";
import { listAgentScores, type AgentScore } from "../src/lib/bigquery/agentScores";

export const dynamic = "force-dynamic";

const guardrails = [
  {
    label: "Refresh",
    value: "BigQuery Scheduled Queries"
  },
  {
    label: "Source",
    value: "Materialized agent_scores"
  },
  {
    label: "Network",
    value: "ERC-8004 Mainnet"
  }
];

export default async function Home() {
  let rows: AgentScore[] = [];
  let loadError = false;

  try {
    rows = await listAgentScores({
      filters: {
        limit: 50
      }
    });
  } catch {
    loadError = true;
  }

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary">
        <Link className="brand" href="/">
          AgentTrust Finder
        </Link>
        <span className="network-pill">ERC-8004</span>
      </nav>

      <div className="page-grid">
        <section className="intro" aria-labelledby="app-title">
          <p className="eyebrow">Payable agent discovery</p>
          <h1 id="app-title">AgentTrust Finder</h1>
          <p className="lede">
            A Trust Score leaderboard for humans evaluating payable ERC-8004
            agents.
          </p>
        </section>

        <section className="guardrail-panel" aria-label="Scaffold guardrails">
          {guardrails.map((guardrail) => (
            <article className="guardrail" key={guardrail.label}>
              <span>{guardrail.label}</span>
              <strong>{guardrail.value}</strong>
            </article>
          ))}
        </section>

        <section className="leaderboard-panel" aria-labelledby="leaderboard-title">
          <div className="leaderboard-heading">
            <div>
              <p className="eyebrow">Leaderboard</p>
              <h2 id="leaderboard-title">Highest Trust Score</h2>
            </div>
            <span className="row-count">
              {rows.length === 1 ? "1 agent" : `${rows.length} agents`}
            </span>
          </div>

          {loadError ? (
            <StateMessage
              title="Leaderboard unavailable"
              message="The materialized agent_scores table could not be loaded."
            />
          ) : rows.length === 0 ? (
            <StateMessage
              title="No agents indexed yet"
              message="The scheduled query has not populated agent_scores."
            />
          ) : (
            <LeaderboardTable rows={rows} />
          )}
        </section>
      </div>
    </main>
  );
}

function LeaderboardTable({ rows }: { rows: AgentScore[] }) {
  return (
    <div className="table-wrap">
      <table aria-label="AgentTrust leaderboard" className="leaderboard-table">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Trust Score</th>
            <th scope="col">x402</th>
            <th scope="col">Feedback</th>
            <th scope="col">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agent_id}>
              <td>
                <div className="agent-cell">
                  <strong>{row.display_name || `Agent #${row.agent_id}`}</strong>
                  <span>{row.agent_uri || "No on-chain URI"}</span>
                </div>
              </td>
              <td>
                <strong className="score-value">
                  {formatTrustScore(row.trust_score)}
                </strong>
              </td>
              <td>
                <span className={`x402-badge ${getX402ClassName(row)}`}>
                  {getX402Label(row)}
                </span>
              </td>
              <td>
                <div className="feedback-cell">
                  <strong>{row.feedback_events}</strong>
                  <span>
                    {row.positive_feedback_events}+ / {row.negative_feedback_events}-
                  </span>
                </div>
              </td>
              <td>
                <span className="address">{shortenAddress(row.owner_address)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-message">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function getX402Label(row: AgentScore): string {
  if (row.verified_x402) {
    return "Verified x402";
  }

  if (row.declared_x402) {
    return "Declares x402";
  }

  return "No x402 signal";
}

function getX402ClassName(row: AgentScore): string {
  if (row.verified_x402) {
    return "x402-badge-verified";
  }

  if (row.declared_x402) {
    return "x402-badge-declared";
  }

  return "x402-badge-muted";
}

function formatTrustScore(score: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(score) ? 0 : 2
  }).format(score);
}

function shortenAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
