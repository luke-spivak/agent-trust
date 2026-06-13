import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentUriPreview } from "./agentUriPreview";

describe("resolveAgentUriPreview", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a missing state when the agent has no URI", async () => {
    await expect(resolveAgentUriPreview(null)).resolves.toMatchObject({
      state: "missing",
      title: "No URI provided"
    });
  });

  it("previews JSON metadata from a data URI", async () => {
    const metadata = encodeURIComponent(
      JSON.stringify({
        name: "Data URI Agent",
        description: "Metadata carried directly on-chain."
      })
    );

    await expect(
      resolveAgentUriPreview(`data:application/json,${metadata}`)
    ).resolves.toMatchObject({
      state: "ready",
      title: "Data URI Agent",
      description: "Metadata carried directly on-chain.",
      resolvedUri: expect.stringContaining("data:application/json")
    });
  });

  it("fetches HTTPS metadata through the provided fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          title: "Fetched Agent",
          description: "Metadata resolved on demand."
        })
      )
    });

    await expect(
      resolveAgentUriPreview("https://example.com/agent.json", fetcher)
    ).resolves.toMatchObject({
      state: "ready",
      title: "Fetched Agent",
      description: "Metadata resolved on demand.",
      resolvedUri: "https://example.com/agent.json"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com/agent.json",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining("application/json")
        })
      })
    );
  });

  it("resolves IPFS metadata through the configured public gateway", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"name":"IPFS Agent"}')
    });

    await expect(
      resolveAgentUriPreview("ipfs://bafyagent/metadata.json", fetcher, {
        ipfsGatewayBaseUrl: "https://gateway.example/ipfs/"
      })
    ).resolves.toMatchObject({
      state: "ready",
      title: "IPFS Agent",
      resolvedUri: "https://gateway.example/ipfs/bafyagent/metadata.json"
    });
  });

  it("does not fetch unsupported schemes or local-network URI targets", async () => {
    const fetcher = vi.fn();

    await expect(
      resolveAgentUriPreview("http://example.com/agent.json", fetcher)
    ).resolves.toMatchObject({
      state: "unsupported"
    });
    await expect(
      resolveAgentUriPreview("https://localhost/agent.json", fetcher)
    ).resolves.toMatchObject({
      state: "unsupported"
    });
    await expect(
      resolveAgentUriPreview("javascript:alert(1)", fetcher)
    ).resolves.toMatchObject({
      state: "unsupported"
    });
    await expect(
      resolveAgentUriPreview("file:///etc/passwd", fetcher)
    ).resolves.toMatchObject({
      state: "unsupported"
    });
    await expect(
      resolveAgentUriPreview("https://127.0.0.1/agent.json", fetcher)
    ).resolves.toMatchObject({
      state: "unsupported"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns an invalid state for malformed JSON metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"name":')
    });

    await expect(
      resolveAgentUriPreview("data:application/json,%7B%22name%22%3A")
    ).resolves.toMatchObject({
      state: "invalid",
      title: "Invalid URI metadata"
    });
    await expect(
      resolveAgentUriPreview("https://example.com/agent.json", fetcher)
    ).resolves.toMatchObject({
      state: "invalid",
      title: "Invalid URI metadata",
      resolvedUri: "https://example.com/agent.json"
    });
  });

  it("returns an error state when metadata fetches time out", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      () =>
        new Promise<never>(() => {
          // Intentionally never resolves.
        })
    );

    const preview = resolveAgentUriPreview("https://example.com/slow.json", fetcher, {
      timeoutMs: 25
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(preview).resolves.toMatchObject({
      state: "error",
      title: "URI preview unavailable",
      message: "Metadata could not be resolved before the preview timeout.",
      resolvedUri: "https://example.com/slow.json"
    });
  });
});
