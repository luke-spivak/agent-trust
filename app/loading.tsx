export default function Loading() {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary">
        <span className="brand">AgentTrust Finder</span>
        <span className="network-pill">ERC-8004</span>
      </nav>

      <section className="loading-panel" aria-live="polite" role="status">
        <span className="loading-bar" />
        <strong>Loading AgentTrust leaderboard</strong>
      </section>
    </main>
  );
}
