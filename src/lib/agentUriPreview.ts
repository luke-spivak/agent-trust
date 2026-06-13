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
    }
  | {
      kind: "fetch";
      sourceUri: string;
      resolvedUri: string;
    }
  | {
      kind: "unsupported";
      sourceUri: string;
      message: string;
    };

const IPFS_GATEWAY_ORIGIN = "https://ipfs.io/ipfs/";
const MAX_RAW_SNIPPET_LENGTH = 1200;
const PREVIEW_FETCH_TIMEOUT_MS = 2500;

export async function resolveAgentUriPreview(
  agentUri: string | null | undefined,
  fetcher: FetchLike = fetch
): Promise<AgentUriPreview> {
  const target = resolveUriTarget(agentUri);

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
    return buildReadyPreview(target.sourceUri, target.resolvedUri, target.text);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_FETCH_TIMEOUT_MS);

  try {
    const response = await fetcher(target.resolvedUri, {
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.5"
      },
      signal: controller.signal
    });

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
      await response.text()
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
    clearTimeout(timeout);
  }
}

function resolveUriTarget(agentUri: string | null | undefined): UriTarget | null {
  const sourceUri = agentUri?.trim();

  if (!sourceUri) {
    return null;
  }

  if (sourceUri.toLowerCase().startsWith("data:")) {
    const text = decodeDataUri(sourceUri);

    if (text === null) {
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
      text
    };
  }

  if (sourceUri.toLowerCase().startsWith("ipfs://")) {
    const ipfsPath = sourceUri.slice("ipfs://".length).replace(/^ipfs\//i, "");

    if (!ipfsPath) {
      return {
        kind: "unsupported",
        sourceUri,
        message: "The IPFS URI is missing a content identifier."
      };
    }

    return {
      kind: "fetch",
      sourceUri,
      resolvedUri: `${IPFS_GATEWAY_ORIGIN}${ipfsPath}`
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
    resolvedUri: parsedUrl.toString()
  };
}

function decodeDataUri(sourceUri: string): string | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(sourceUri);

  if (!match) {
    return null;
  }

  const metadata = match[1].split(";").map((part) => part.toLowerCase());
  const payload = match[2];

  try {
    if (metadata.includes("base64")) {
      return Buffer.from(payload, "base64").toString("utf8");
    }

    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function buildReadyPreview(
  sourceUri: string,
  resolvedUri: string,
  rawText: string
): AgentUriPreview {
  const metadata = parseMetadata(rawText);

  return {
    state: "ready",
    title: metadata.title ?? "Metadata resolved",
    description: metadata.description,
    sourceUri,
    resolvedUri,
    rawSnippet: truncate(rawText)
  };
}

function parseMetadata(rawText: string): {
  title: string | null;
  description: string | null;
} {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    return {
      title: readString(parsed.name) ?? readString(parsed.title),
      description: readString(parsed.description)
    };
  } catch {
    return {
      title: null,
      description: rawText.trim() ? truncate(rawText, 180) : null
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
