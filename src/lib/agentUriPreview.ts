export type AgentUriPreview =
  | {
      state: "missing";
      title: string;
      message: string;
    }
  | {
      state: "unsupported";
      title: string;
      message: string;
      sourceUri: string;
    }
  | {
      state: "error";
      title: string;
      message: string;
      sourceUri: string;
      resolvedUri: string;
    }
  | {
      state: "invalid";
      title: string;
      message: string;
      sourceUri: string;
      resolvedUri: string;
      rawSnippet: string;
    }
  | {
      state: "ready";
      title: string;
      description: string | null;
      sourceUri: string;
      resolvedUri: string;
      rawSnippet: string;
    };

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
) => Promise<FetchResponseLike>;

type UriTarget =
  | {
      kind: "data";
      sourceUri: string;
      resolvedUri: string;
      text: string;
      expectsJson: boolean;
    }
  | {
      kind: "fetch";
      sourceUri: string;
      resolvedUri: string;
      expectsJson: boolean;
    }
  | {
      kind: "unsupported";
      sourceUri: string;
      message: string;
    };

export type AgentUriPreviewOptions = {
  env?: Record<string, string | undefined>;
  ipfsGatewayBaseUrl?: string;
  timeoutMs?: number;
};

const DEFAULT_IPFS_GATEWAY_BASE_URL = "https://ipfs.io/ipfs/";
const MAX_RAW_SNIPPET_LENGTH = 1200;
const PREVIEW_FETCH_TIMEOUT_MS = 2500;

export async function resolveAgentUriPreview(
  agentUri: string | null | undefined,
  fetcher: FetchLike = fetch,
  options: AgentUriPreviewOptions = {}
): Promise<AgentUriPreview> {
  const target = resolveUriTarget(agentUri, options);

  if (!target) {
    return {
      state: "missing",
      title: "No URI provided",
      message: "This agent has no on-chain URI to preview."
    };
  }

  if (target.kind === "unsupported") {
    return {
      state: "unsupported",
      title: "URI preview unavailable",
      message: target.message,
      sourceUri: target.sourceUri
    };
  }

  if (target.kind === "data") {
    return buildReadyPreview(
      target.sourceUri,
      target.resolvedUri,
      target.text,
      target.expectsJson
    );
  }

  const controller = new AbortController();
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const fetchPromise = fetcher(target.resolvedUri, {
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.5"
      },
      signal: controller.signal
    })
      .then((response) => ({ kind: "response" as const, response }))
      .catch(() => ({ kind: "fetch-error" as const }));
    const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve({ kind: "timeout" });
      }, timeoutMs);
    });
    const result = await Promise.race([fetchPromise, timeoutPromise]);

    if (result.kind === "timeout") {
      return {
        state: "error",
        title: "URI preview unavailable",
        message: "Metadata could not be resolved before the preview timeout.",
        sourceUri: target.sourceUri,
        resolvedUri: target.resolvedUri
      };
    }

    if (result.kind === "fetch-error") {
      return {
        state: "error",
        title: "URI preview unavailable",
        message: "Metadata could not be resolved before the preview timeout.",
        sourceUri: target.sourceUri,
        resolvedUri: target.resolvedUri
      };
    }

    const { response } = result;

    if (!response.ok) {
      return {
        state: "error",
        title: "URI preview unavailable",
        message: `Metadata request returned HTTP ${response.status}.`,
        sourceUri: target.sourceUri,
        resolvedUri: target.resolvedUri
      };
    }

    return buildReadyPreview(
      target.sourceUri,
      target.resolvedUri,
      await response.text(),
      target.expectsJson
    );
  } catch {
    return {
      state: "error",
      title: "URI preview unavailable",
      message: "Metadata could not be resolved before the preview timeout.",
      sourceUri: target.sourceUri,
      resolvedUri: target.resolvedUri
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function resolveUriTarget(
  agentUri: string | null | undefined,
  options: AgentUriPreviewOptions
): UriTarget | null {
  const sourceUri = agentUri?.trim();

  if (!sourceUri) {
    return null;
  }

  if (sourceUri.toLowerCase().startsWith("data:")) {
    const dataUri = decodeDataUri(sourceUri);

    if (!dataUri) {
      return {
        kind: "unsupported",
        sourceUri,
        message: "The data URI could not be decoded."
      };
    }

    return {
      kind: "data",
      sourceUri,
      resolvedUri: sourceUri,
      text: dataUri.text,
      expectsJson: dataUri.expectsJson
    };
  }

  if (sourceUri.toLowerCase().startsWith("ipfs://")) {
    const ipfsGatewayBaseUrl = resolveIpfsGatewayBaseUrl(options);
    const ipfsPath = sourceUri.slice("ipfs://".length).replace(/^ipfs\//i, "");

    if (!ipfsPath) {
      return {
        kind: "unsupported",
        sourceUri,
        message: "The IPFS URI is missing a content identifier."
      };
    }

    if (!ipfsGatewayBaseUrl) {
      return {
        kind: "unsupported",
        sourceUri,
        message: "The configured IPFS gateway must be a public https URL."
      };
    }

    return {
      kind: "fetch",
      sourceUri,
      resolvedUri: `${ipfsGatewayBaseUrl}${ipfsPath}`,
      expectsJson: true
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUri);
  } catch {
    return {
      kind: "unsupported",
      sourceUri,
      message: "Only https, data, and ipfs URI previews are supported."
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      kind: "unsupported",
      sourceUri,
      message: "Only https, data, and ipfs URI previews are supported."
    };
  }

  if (!isPublicHostname(parsedUrl.hostname)) {
    return {
      kind: "unsupported",
      sourceUri,
      message: "Local-network URI previews are blocked."
    };
  }

  return {
    kind: "fetch",
    sourceUri,
    resolvedUri: parsedUrl.toString(),
    expectsJson: parsedUrl.pathname.toLowerCase().endsWith(".json")
  };
}

function decodeDataUri(
  sourceUri: string
): { text: string; expectsJson: boolean } | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(sourceUri);

  if (!match) {
    return null;
  }

  const metadata = match[1].split(";").map((part) => part.toLowerCase());
  const payload = match[2];
  const mediaType = metadata[0] ?? "";

  try {
    if (metadata.includes("base64")) {
      return {
        text: Buffer.from(payload, "base64").toString("utf8"),
        expectsJson: mediaType === "application/json"
      };
    }

    return {
      text: decodeURIComponent(payload),
      expectsJson: mediaType === "application/json"
    };
  } catch {
    return null;
  }
}

function buildReadyPreview(
  sourceUri: string,
  resolvedUri: string,
  rawText: string,
  expectsJson: boolean
): AgentUriPreview {
  const metadata = parseMetadata(rawText, expectsJson);

  if (metadata.state === "invalid") {
    return {
      state: "invalid",
      title: "Invalid URI metadata",
      message: "Metadata JSON could not be parsed.",
      sourceUri,
      resolvedUri,
      rawSnippet: truncate(rawText)
    };
  }

  return {
    state: "ready",
    title: metadata.title ?? "Metadata resolved",
    description: metadata.description,
    sourceUri,
    resolvedUri,
    rawSnippet: truncate(rawText)
  };
}

function parseMetadata(
  rawText: string,
  expectsJson: boolean
): {
  state: "ready" | "invalid";
  title: string | null;
  description: string | null;
} {
  const trimmedText = rawText.trim();
  const looksLikeJson = /^[{\[]/.test(trimmedText);

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    return {
      state: "ready",
      title: readString(parsed.name) ?? readString(parsed.title),
      description: readString(parsed.description)
    };
  } catch {
    if (expectsJson || looksLikeJson) {
      return {
        state: "invalid",
        title: null,
        description: null
      };
    }

    return {
      state: "ready",
      title: null,
      description: trimmedText ? truncate(trimmedText, 180) : null
    };
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue ? trimmedValue : null;
}

function truncate(value: string, limit = MAX_RAW_SNIPPET_LENGTH): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length <= limit) {
    return trimmedValue;
  }

  return `${trimmedValue.slice(0, limit - 3)}...`;
}

function resolveIpfsGatewayBaseUrl(
  options: AgentUriPreviewOptions
): string | null {
  const rawGateway =
    options.ipfsGatewayBaseUrl ??
    options.env?.IPFS_GATEWAY_BASE_URL ??
    process.env.IPFS_GATEWAY_BASE_URL ??
    DEFAULT_IPFS_GATEWAY_BASE_URL;

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawGateway);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "https:" || !isPublicHostname(parsedUrl.hostname)) {
    return null;
  }

  return parsedUrl.toString().endsWith("/")
    ? parsedUrl.toString()
    : `${parsedUrl.toString()}/`;
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) {
    return PREVIEW_FETCH_TIMEOUT_MS;
  }

  return Math.max(1, Math.trunc(timeoutMs));
}

function isPublicHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost")
  ) {
    return false;
  }

  if (
    normalizedHostname === "0.0.0.0" ||
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("127.") ||
    normalizedHostname.startsWith("10.") ||
    normalizedHostname.startsWith("169.254.") ||
    /^192\.168\./.test(normalizedHostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedHostname)
  ) {
    return false;
  }

  return true;
}
