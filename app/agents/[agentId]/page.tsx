import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { resolveAgentUriPreview, type AgentUriPreview } from "../../../src/lib/agentUriPreview";
import {
  getAgentScoreById,
  type AgentScore
} from "../../../src/lib/bigquery/agentScores";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    agentId: string;
  }>;
};

const SCORE_BREAKDOWN_LABELS: Record<string, string> = {
  base: "Base",
  feedback_events: "Feedback events",
  positive_feedback_events: "Positive feedback",
  negative_feedback_events: "Negative feedback",
  successful_validations: "Successful validations",
  declared_x402_bonus: "Declared x402 bonus",
  verified_x402_bonus: "Verified x402 bonus"
};

export default async function AgentDetailPage({ params }: PageProps) {
  const { agentId } = await params;
  let agent: AgentScore | null = null;
  let preview: AgentUriPreview | null = null;
  let loadError = false;

  try {
    agent = await getAgentScoreById({ agentId });
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <DetailShell>
        <section className="leaderboard-panel">
          <StateMessage
            title="Agent unavailable"
            message="The materialized agent_scores table could not be loaded."
          />
        </section>
      </DetailShell>
    );
  }

  if (!agent) {
    notFound();
  }

  preview = await resolveAgentUriPreview(agent.agent_uri);

  return (
    <DetailShell>
      <section className="detail-hero" aria-labelledby="agent-title">
        <div className="detail-hero-copy">
          <Link className="back-link" href="/">
            Back to leaderboard
          </Link>
          <p className="eyebrow">Agent detail</p>
          <h1 id="agent-title">{agent.display_name || `Agent #${agent.agent_id}`}</h1>
          <p className="lede">
            On-chain ERC-8004 identity, reputation, validation, and payment
            signals from the materialized agent_scores table.
          </p>
        </div>
        <div className="trust-summary" aria-label="Trust Score summary">
          <span>Trust Score</span>
          <strong>{formatTrustScore(agent.trust_score)}</strong>
          <span className={`x402-badge ${getX402ClassName(agent)}`}>
            {getX402Label(agent)}
          </span>
        </div>
      </section>

      <div className="detail-layout">
        <section className="detail-panel" aria-labelledby="onchain-title">
          <div className="detail-section-heading">
            <p className="eyebrow">Registry record</p>
            <h2 id="onchain-title">On-Chain Fields</h2>
          </div>
          <dl className="field-grid">
            <Field label="Agent ID" value={agent.agent_id} />
            <Field label="Owner" value={agent.owner_address} mono />
            <Field
              label="Identity registry"
              value={agent.identity_registry_address}
              mono
            />
            <Field
              label="Reputation registry"
              value={agent.reputation_registry_address}
              mono
            />
            <Field
              label="Validation registry"
              value={agent.validation_registry_address ?? "Not deployed"}
              mono={Boolean(agent.validation_registry_address)}
            />
            <Field
              label="Registered block"
              value={formatInteger(agent.registered_at_block)}
            />
            <Field
              label="Registered at"
              value={formatNullableTimestamp(agent.registered_at_timestamp)}
            />
            <Field label="x402 endpoint" value={agent.x402_endpoint ?? "None"} />
          </dl>
        </section>

        <section className="detail-panel" aria-labelledby="score-title">
          <div className="detail-section-heading">
            <p className="eyebrow">Score explanation</p>
            <h2 id="score-title">Trust Score</h2>
          </div>
          <p className="detail-copy">
            Trust Score combines a base score with reputation events, validation
            outcomes, and x402 signals.
          </p>
          <div className="score-line">
            <strong>{formatTrustScore(agent.trust_score)}</strong>
            <span>{agent.score_version}</span>
          </div>
          <dl className="breakdown-grid">
            {formatScoreBreakdown(agent.trust_score_breakdown).map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="detail-panel" aria-labelledby="reputation-title">
          <div className="detail-section-heading">
            <p className="eyebrow">On-chain feedback</p>
            <h2 id="reputation-title">Reputation</h2>
          </div>
          <dl className="metric-list">
            <Metric label="Feedback events" value={agent.feedback_events} />
            <Metric label="Positive feedback" value={agent.positive_feedback_events} />
            <Metric label="Negative feedback" value={agent.negative_feedback_events} />
          </dl>
        </section>

        <section className="detail-panel" aria-labelledby="validation-title">
          <div className="detail-section-heading">
            <p className="eyebrow">Validation history</p>
            <h2 id="validation-title">Validation</h2>
          </div>
          <dl className="metric-list">
            <Metric label="Validation requests" value={agent.validation_requests} />
            <Metric label="Validation responses" value={agent.validation_responses} />
            <Metric
              label="Successful validations"
              value={agent.successful_validations}
            />
          </dl>
        </section>

        <section className="detail-panel uri-panel" aria-labelledby="uri-title">
          <div className="detail-section-heading">
            <p className="eyebrow">Resolved on demand</p>
            <h2 id="uri-title">URI Preview</h2>
          </div>
          <UriPreview preview={preview} />
        </section>
      </div>
    </DetailShell>
  );
}

function DetailShell({ children }: { children: ReactNode }) {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary">
        <Link className="brand" href="/">
          AgentTrust Finder
        </Link>
        <span className="network-pill">ERC-8004</span>
      </nav>
      <div className="page-grid">{children}</div>
    </main>
  );
}

function Field({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono-value" : undefined}>{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatInteger(value)}</dd>
    </div>
  );
}

function UriPreview({ preview }: { preview: AgentUriPreview }) {
  if (preview.state === "ready") {
    return (
      <div className="uri-preview">
        <strong>{preview.title}</strong>
        {preview.description ? <p>{preview.description}</p> : null}
        <dl className="field-grid compact-field-grid">
          <Field label="Source URI" value={preview.sourceUri} mono />
          <Field label="Resolved URI" value={preview.resolvedUri} mono />
        </dl>
        {preview.rawSnippet ? <pre>{preview.rawSnippet}</pre> : null}
      </div>
    );
  }

  return (
    <div className="uri-preview uri-preview-muted">
      <strong>{preview.title}</strong>
      <p>{preview.message}</p>
      {"sourceUri" in preview ? (
        <dl className="field-grid compact-field-grid">
          <Field label="Source URI" value={preview.sourceUri} mono />
        </dl>
      ) : null}
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

function formatScoreBreakdown(
  breakdown: Record<string, unknown>
): Array<{ key: string; label: string; value: string }> {
  return Object.entries(SCORE_BREAKDOWN_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      value: formatBreakdownValue(key, breakdown[key])
    }))
    .filter((item) => item.value !== "Unavailable");
}

function formatBreakdownValue(key: string, value: unknown): string {
  if (typeof value !== "number") {
    return "Unavailable";
  }

  const formattedValue = formatInteger(value);

  if (key.endsWith("_bonus") && value > 0) {
    return `+${formattedValue}`;
  }

  return formattedValue;
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

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatNullableTimestamp(timestamp: unknown): string {
  const normalizedTimestamp = normalizeTimestampValue(timestamp);

  if (!normalizedTimestamp) {
    return "Unavailable";
  }

  const date = new Date(normalizedTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function normalizeTimestampValue(timestamp: unknown): string | null {
  if (typeof timestamp === "string") {
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (
    timestamp &&
    typeof timestamp === "object" &&
    "value" in timestamp &&
    typeof timestamp.value === "string"
  ) {
    return timestamp.value;
  }

  return null;
}
