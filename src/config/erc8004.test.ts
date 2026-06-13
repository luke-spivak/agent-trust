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
      status: "available",
      address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      deploymentBlock: 24_339_871,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source: "test fixture"
    },
    reputation: {
      label: "Reputation Registry",
      status: "available",
      address: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
      deploymentBlock: 24_339_873,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source: "test fixture"
    },
    validation: {
      label: "Validation Registry",
      status: "not_deployed",
      address: null,
      deploymentBlock: null,
      addressConfirmed: false,
      deploymentBlockConfirmed: false,
      source: "Official 8004 site says Validation Registry is not yet available."
    }
  },
  eventTopics: {
    registered: {
      label: "Registered",
      signature: "Registered(uint256,string,address)",
      topicHash:
        "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a",
      hashConfirmed: true,
      source: "test fixture"
    },
    uriUpdated: {
      label: "URIUpdated",
      signature: "URIUpdated(uint256,string,address)",
      topicHash:
        "0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb",
      hashConfirmed: true,
      source: "test fixture"
    },
    metadataSet: {
      label: "MetadataSet",
      signature: "MetadataSet(uint256,string,string,bytes)",
      topicHash:
        "0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b",
      hashConfirmed: true,
      source: "test fixture"
    },
    transfer: {
      label: "Transfer",
      signature: "Transfer(address,address,uint256)",
      topicHash:
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      hashConfirmed: true,
      source: "test fixture"
    },
    newFeedback: {
      label: "NewFeedback",
      signature:
        "NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)",
      topicHash:
        "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc",
      hashConfirmed: true,
      source: "test fixture"
    },
    feedbackRevoked: {
      label: "FeedbackRevoked",
      signature: "FeedbackRevoked(uint256,address,uint64)",
      topicHash:
        "0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d",
      hashConfirmed: true,
      source: "test fixture"
    },
    responseAppended: {
      label: "ResponseAppended",
      signature: "ResponseAppended(uint256,address,uint64,address,string,bytes32)",
      topicHash:
        "0xb1c6be0b5b8aef6539e2fac0fd131a2faa7b49edf8e505b5eb0ad487d56051d4",
      hashConfirmed: true,
      source: "test fixture"
    },
    validationRequest: {
      label: "ValidationRequest",
      signature: "ValidationRequest(address,uint256,string,bytes32)",
      topicHash:
        "0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059",
      hashConfirmed: true,
      source: "test fixture"
    },
    validationResponse: {
      label: "ValidationResponse",
      signature:
        "ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)",
      topicHash:
        "0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae",
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

  it("keeps the checked-in config production-ready for available registries", () => {
    expect(validateRegistryConfig(ERC8004_REGISTRY_CONFIG)).toEqual({
      ok: true,
      errors: []
    });
    expect(() =>
      assertRegistryConfigConfirmed(ERC8004_REGISTRY_CONFIG)
    ).not.toThrow();
  });

  it("rejects placeholder and unconfirmed registry addresses", () => {
    const config = cloneConfirmedConfig();
    config.registries.identity.address = "UNCONFIRMED";
    config.registries.identity.addressConfirmed = false;
    config.registries.reputation.address = "0x_official_reputation_registry";

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Identity Registry address is unconfirmed.",
        "Identity Registry address must be a non-placeholder 20-byte hex address.",
        "Reputation Registry address must be a non-placeholder 20-byte hex address."
      ])
    );
  });

  it("rejects missing, zero, and unconfirmed deployment blocks", () => {
    const config = cloneConfirmedConfig();
    config.registries.identity.deploymentBlock = null;
    config.registries.reputation.deploymentBlock = 0;
    config.registries.reputation.deploymentBlockConfirmed = false;

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Identity Registry deployment block must be a positive integer.",
        "Reputation Registry deployment block must be a positive integer.",
        "Reputation Registry deployment block is unconfirmed."
      ])
    );
  });

  it("rejects disabling an available registry or adding a fake unavailable address", () => {
    const config = cloneConfirmedConfig();
    config.registries.identity.status = "not_deployed";
    config.registries.validation.address =
      "0x3333333333333333333333333333333333333333";

    const result = validateRegistryConfig(config);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Identity Registry must be marked available.",
        "Validation Registry must not have an address until an official deployment exists."
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
    const config = cloneConfirmedConfig();
    config.eventTopics.feedbackRevoked.topicHash = "UNCONFIRMED";

    expect(() => assertRegistryConfigConfirmed(config)).toThrow(
      /ERC-8004 registry configuration is not production-ready/
    );
  });
});
