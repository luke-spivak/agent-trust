export type RegistryKey = "identity" | "reputation" | "validation";

export type EventTopicKey =
  | "registered"
  | "newFeedback"
  | "feedbackRevoked"
  | "validationRequest"
  | "validationResponse";

export type RegistryDeployment = {
  label: string;
  address: string;
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
      address: "UNCONFIRMED",
      deploymentBlock: null,
      addressConfirmed: false,
      deploymentBlockConfirmed: false,
      source: "Pending confirmation from EF, ETHGlobal/Google sponsor materials, or Etherscan."
    },
    reputation: {
      label: "Reputation Registry",
      address: "UNCONFIRMED",
      deploymentBlock: null,
      addressConfirmed: false,
      deploymentBlockConfirmed: false,
      source: "Pending confirmation from EF, ETHGlobal/Google sponsor materials, or Etherscan."
    },
    validation: {
      label: "Validation Registry",
      address: "UNCONFIRMED",
      deploymentBlock: null,
      addressConfirmed: false,
      deploymentBlockConfirmed: false,
      source: "Pending confirmation from EF, ETHGlobal/Google sponsor materials, or Etherscan."
    }
  },
  eventTopics: {
    registered: {
      label: "Registered",
      signature: "UNCONFIRMED",
      topicHash:
        "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a",
      hashConfirmed: false,
      source: "PLAN.md draft topic; verify against the deployed Identity Registry ABI."
    },
    newFeedback: {
      label: "NewFeedback",
      signature: "UNCONFIRMED",
      topicHash:
        "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc",
      hashConfirmed: false,
      source: "PLAN.md draft topic; verify against the deployed Reputation Registry ABI."
    },
    feedbackRevoked: {
      label: "FeedbackRevoked",
      signature: "UNCONFIRMED",
      topicHash: "UNCONFIRMED",
      hashConfirmed: false,
      source: "Pending ABI confirmation for revoked-feedback exclusion."
    },
    validationRequest: {
      label: "ValidationRequest",
      signature: "UNCONFIRMED",
      topicHash:
        "0x530436c3634a98e1e626b0898be2f1e9980cc1bd2a78c07a0aba52d0a48a5059",
      hashConfirmed: false,
      source: "PLAN.md draft topic; verify against the deployed Validation Registry ABI."
    },
    validationResponse: {
      label: "ValidationResponse",
      signature: "UNCONFIRMED",
      topicHash:
        "0xafddf629e874ccc3963b6a888c477bd464a6c8525024fc88759ea3b2326349ae",
      hashConfirmed: false,
      source: "PLAN.md draft topic; verify against the deployed Validation Registry ABI."
    }
  }
};

export function validateRegistryConfig(
  config: Erc8004RegistryConfig
): RegistryConfigValidationResult {
  const errors: string[] = [];

  for (const registry of Object.values(config.registries)) {
    if (!registry.addressConfirmed) {
      errors.push(`${registry.label} address is unconfirmed.`);
    }

    if (!isNonPlaceholderAddress(registry.address)) {
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
