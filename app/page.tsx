import Link from "next/link";

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

export default function Home() {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary">
        <Link className="brand" href="/">
          AgentTrust Finder
        </Link>
        <span className="network-pill">ERC-8004</span>
      </nav>

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
    </main>
  );
}
