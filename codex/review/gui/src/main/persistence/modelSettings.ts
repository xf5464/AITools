import type { ReviewModelConfig } from "../../shared/contracts";

export const DEFAULT_REVIEW_MODEL: ReviewModelConfig = { model: "gpt-5.6-sol", reasoningEffort: "medium" };
export const DEFAULT_MCP_MODEL: ReviewModelConfig = { model: "gpt-5.6-luna", reasoningEffort: "max" };

export function configuredModel(value: ReviewModelConfig | undefined, fallback: ReviewModelConfig): ReviewModelConfig {
  return value ? { ...value } : { ...fallback };
}

export function branchModel(override: ReviewModelConfig | undefined, defaultReviewModel: ReviewModelConfig): ReviewModelConfig {
  return configuredModel(override, defaultReviewModel);
}
