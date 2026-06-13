import { describe, expect, it } from "vitest";
import {
  assertRegistryConfigConfirmed,
  ERC8004_REGISTRY_CONFIG,
  validateRegistryConfig,
  type Erc8004RegistryConfig
} from "./erc8004";

const confirmedConfig: Erc8004RegistryConfig = {
  registries: {
    identity: {
      label: "Identity Registry",
      address: "0x1111111111111111111111111111111111111111",
      deploymentBlock: 19_000_001,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source: "test fixture"
    },
    reputation: {
      label: "Reputation Registry",
      address: "0x2222222222222222222222222222222222222222",
      deploymentBlock: 19_000_002,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source: "test fixture"
    },
    validation: {
      label: "Validation Registry",
      address: "0x3333333333333333333333333333333333333333",
      deploymentBlock: 19_000_003,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source: "test fixture"
    }
  },
  eventTopics: {
    registered: {
      label: "Registered",
      signature: "Registered(uint256,address,string,string)",
      topicHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      hashConfirmed: true,
      source: "test fixture"
    },
    newFeedback: {
      label: "NewFeedback",
      signature: "NewFeedback(uint256,uint256,bool)",
      topicHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      hashConfirmed: true,
      source: "test fixture"
    },
    feedbackRevoked: {
      label: "FeedbackRevoked",
      signature: "FeedbackRevoked(uint256)",
      topicHash:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      hashConfirmed: true,
      source: "test fixture"
    },
    validationRequest: {
      label: "ValidationRequest",
      signature: "ValidationRequest(uint256,uint256)",
      topicHash:
        "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      hashConfirmed: true,
      source: "test fixture"
    },
    validationResponse: {
      label: "ValidationResponse",
      signature: "ValidationResponse(uint256,uint256,bool)",
      topicHash:
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      hashConfirmed: true,
      source: "test fixture"
    }
  }
};

function cloneConfirmedConfig(): Erc8004RegistryConfig {
  return structuredClone(confirmedConfig) as Erc8004RegistryConfig;
}

describe("validateRegistryConfig", () => {
  it("accepts a fully confirmed registry configuration", () => {
    expect(validateRegistryConfig(confirmedConfig)).toEqual({
      ok: true,
      errors: []
    });
  });

  it("rejects placeholder and unconfirmed registry addresses", () => {
    const config = cloneConfirmedConfig();
    config.registries.identity.address = "UNCONFIRMED";
    config.registries.identity.addressConfirmed = false;
    config.registries.reputation.address = "0x_official_reputation_registry";
    config.registries.validation.address =
      "0x0000000000000000000000000000000000000000";

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Identity Registry address is unconfirmed.",
        "Identity Registry address must be a non-placeholder 20-byte hex address.",
        "Reputation Registry address must be a non-placeholder 20-byte hex address.",
        "Validation Registry address must be a non-placeholder 20-byte hex address."
      ])
    );
  });

  it("rejects missing, zero, and unconfirmed deployment blocks", () => {
    const config = cloneConfirmedConfig();
    config.registries.identity.deploymentBlock = null;
    config.registries.reputation.deploymentBlock = 0;
    config.registries.validation.deploymentBlockConfirmed = false;

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Identity Registry deployment block must be a positive integer.",
        "Reputation Registry deployment block must be a positive integer.",
        "Validation Registry deployment block is unconfirmed."
      ])
    );
  });

  it("rejects placeholder, malformed, and unconfirmed topic hashes", () => {
    const config = cloneConfirmedConfig();
    config.eventTopics.registered.topicHash = "UNCONFIRMED";
    config.eventTopics.newFeedback.topicHash = "0x1234";
    config.eventTopics.validationRequest.hashConfirmed = false;

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Registered topic hash must be a non-placeholder 32-byte hex string.",
        "NewFeedback topic hash must be a non-placeholder 32-byte hex string.",
        "ValidationRequest topic hash is unconfirmed."
      ])
    );
  });

  it("throws a single actionable gate error when the config is not confirmed", () => {
    expect(() => assertRegistryConfigConfirmed(ERC8004_REGISTRY_CONFIG)).toThrow(
      /ERC-8004 registry configuration is not production-ready/
    );
  });
});
