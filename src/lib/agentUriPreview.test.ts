import { describe, expect, it, vi } from "vitest";
import { resolveAgentUriPreview } from "./agentUriPreview";

describe("resolveAgentUriPreview", () => {
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

  it("resolves IPFS metadata through one public gateway", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{"name":"IPFS Agent"}')
    });

    await expect(
      resolveAgentUriPreview("ipfs://bafyagent/metadata.json", fetcher)
    ).resolves.toMatchObject({
      state: "ready",
      title: "IPFS Agent",
      resolvedUri: "https://ipfs.io/ipfs/bafyagent/metadata.json"
    });
  });

  it("does not fetch unsupported or local-network URI targets", async () => {
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
    expect(fetcher).not.toHaveBeenCalled();
  });
});
