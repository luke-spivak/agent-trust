export type RegistryKey = "identity" | "reputation" | "validation";

export type EventTopicKey =
  | "registered"
  | "uriUpdated"
  | "metadataSet"
  | "transfer"
  | "newFeedback"
  | "feedbackRevoked"
  | "responseAppended"
  | "validationRequest"
  | "validationResponse";

export type RegistryStatus = "available" | "not_deployed";

export type RegistryDeployment = {
  label: string;
  status: RegistryStatus;
  address: string | null;
  deploymentBlock: number | null;
  addressConfirmed: boolean;
  deploymentBlockConfirmed: boolean;
  source: string;
};

export type EventTopic = {
  label: string;
  signature: string;
  topicHash: string;
  hashConfirmed: boolean;
  source: string;
};

export type Erc8004RegistryConfig = {
  registries: Record<RegistryKey, RegistryDeployment>;
  eventTopics: Record<EventTopicKey, EventTopic>;
};

export type RegistryConfigValidationResult = {
  ok: boolean;
  errors: string[];
};

export const ERC8004_REGISTRY_CONFIG: Erc8004RegistryConfig = {
  registries: {
    identity: {
      label: "Identity Registry",
      status: "available",
      address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      deploymentBlock: 24_339_871,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source:
        "Official erc-8004/erc-8004-contracts README and Etherscan contract creation transaction."
    },
    reputation: {
      label: "Reputation Registry",
      status: "available",
      address: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
      deploymentBlock: 24_339_873,
      addressConfirmed: true,
      deploymentBlockConfirmed: true,
      source:
        "Official erc-8004/erc-8004-contracts README and Etherscan contract creation transaction."
    },
    validation: {
      label: "Validation Registry",
      status: "not_deployed",
      address: null,
      deploymentBlock: null,
      addressConfirmed: false,
      deploymentBlockConfirmed: false,
      source:
        "Official 8004.org FAQ says the Validation Registry is undergoing technical due diligence and is not yet available."
    }
  },
  eventTopics: {
    registered: {
      label: "Registered",
      signature: "Registered(uint256,string,address)",
      topicHash:
        "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a",
      hashConfirmed: true,
      source: "Verified from official IdentityRegistry ABI with cast keccak."
    },
    uriUpdated: {
      label: "URIUpdated",
      signature: "URIUpdated(uint256,string,address)",
      topicHash:
        "0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb",
      hashConfirmed: true,
      source: "Verified from official IdentityRegistry ABI with cast keccak."
    },
    metadataSet: {
      label: "MetadataSet",
      signature: "MetadataSet(uint256,string,string,bytes)",
      topicHash:
        "0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b",
      hashConfirmed: true,
      source: "Verified from official IdentityRegistry ABI with cast keccak."
    },
    transfer: {
      label: "Transfer",
      signature: "Transfer(address,address,uint256)",
      topicHash:
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      hashConfirmed: true,
      source: "Verified from official IdentityRegistry ABI with cast keccak."
    },
    newFeedback: {
      label: "NewFeedback",
      signature:
        "NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)",
      topicHash:
        "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc",
      hashConfirmed: true,
      source: "Verified from official ReputationRegistry ABI with cast keccak."
    },
    feedbackRevoked: {
      label: "FeedbackRevoked",
      signature: "FeedbackRevoked(uint256,address,uint64)",
      topicHash:
        "0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d",
      hashConfirmed: true,
      source: "Verified from official ReputationRegistry ABI with cast keccak."
    },
    responseAppended: {
      label: "ResponseAppended",
      signature: "ResponseAppended(uint256,address,uint64,address,string,bytes32)",
      topicHash:
        "0xb1c6be0b5b8aef6539e2fac0fd131a2faa7b49edf8e505b5eb0ad487d56051d4",
      hashConfirmed: true,
      source: "Verified from official ReputationRegistry ABI with cast keccak."
    },
    validationRequest: {
      label: "ValidationRequest",
      signature: "ValidationRequest(address,uint256,string,bytes32)",
      topicHash:
        "0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059",
      hashConfirmed: true,
      source:
        "Verified from official ValidationRegistry ABI with cast keccak; no official deployment is available yet."
    },
    validationResponse: {
      label: "ValidationResponse",
      signature:
        "ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)",
      topicHash:
        "0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae",
      hashConfirmed: true,
      source:
        "Verified from official ValidationRegistry ABI with cast keccak; no official deployment is available yet."
    }
  }
};

export function validateRegistryConfig(
  config: Erc8004RegistryConfig
): RegistryConfigValidationResult {
  const errors: string[] = [];

  for (const [key, registry] of Object.entries(config.registries)) {
    if (key !== "validation" && registry.status !== "available") {
      errors.push(`${registry.label} must be marked available.`);
    }

    if (registry.status === "not_deployed") {
      if (registry.address !== null) {
        errors.push(
          `${registry.label} must not have an address until an official deployment exists.`
        );
      }

      if (registry.deploymentBlock !== null) {
        errors.push(
          `${registry.label} must not have a deployment block until an official deployment exists.`
        );
      }

      continue;
    }

    if (!registry.addressConfirmed) {
      errors.push(`${registry.label} address is unconfirmed.`);
    }

    if (!isNonPlaceholderAddress(registry.address ?? "")) {
      errors.push(
        `${registry.label} address must be a non-placeholder 20-byte hex address.`
      );
    }

    if (!isPositiveInteger(registry.deploymentBlock)) {
      errors.push(`${registry.label} deployment block must be a positive integer.`);
    }

    if (!registry.deploymentBlockConfirmed) {
      errors.push(`${registry.label} deployment block is unconfirmed.`);
    }
  }

  for (const topic of Object.values(config.eventTopics)) {
    if (!topic.hashConfirmed) {
      errors.push(`${topic.label} topic hash is unconfirmed.`);
    }

    if (!isNonPlaceholderTopicHash(topic.topicHash)) {
      errors.push(
        `${topic.label} topic hash must be a non-placeholder 32-byte hex string.`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function assertRegistryConfigConfirmed(
  config: Erc8004RegistryConfig
): asserts config is Erc8004RegistryConfig {
  const result = validateRegistryConfig(config);

  if (!result.ok) {
    throw new Error(
      [
        "ERC-8004 registry configuration is not production-ready.",
        "Confirm official registry addresses, deployment blocks, and topic hashes before proceeding.",
        ...result.errors.map((error) => `- ${error}`)
      ].join("\n")
    );
  }
}

function isPositiveInteger(value: number | null): value is number {
  return Number.isInteger(value) && value !== null && value > 0;
}

function isNonPlaceholderAddress(value: string): boolean {
  return (
    !isPlaceholder(value) &&
    /^0x[0-9a-fA-F]{40}$/.test(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
}

function isNonPlaceholderTopicHash(value: string): boolean {
  return (
    !isPlaceholder(value) &&
    /^0x[0-9a-fA-F]{64}$/.test(value) &&
    value.toLowerCase() !==
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  );
}

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "" ||
    normalized === "unconfirmed" ||
    normalized.includes("placeholder") ||
    normalized.includes("_") ||
    normalized.startsWith("0xofficial")
  );
}
