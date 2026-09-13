export function tokenTotal(value: any): number | undefined { const usage = value?.params?.tokenUsage ?? value?.tokenUsage ?? value; const total = usage?.total?.totalTokens ?? usage?.totalTokens ?? usage?.total_tokens; return Number.isFinite(Number(total)) ? Number(total) : undefined; }
export interface TurnTokenUsage { turnId: string; totalTokens: number; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }
export function turnTokenUsage(value: any): TurnTokenUsage | undefined {
  const turnId = value?.params?.turnId; if (!turnId) return undefined;
  const usage = value?.method === "rawResponse/completed" ? value.params?.usage : value?.method === "thread/tokenUsage/updated" ? value.params?.tokenUsage?.last : undefined;
  const totalTokens = Number(usage?.totalTokens ?? usage?.total_tokens); if (!Number.isFinite(totalTokens)) return undefined;
  const optional = (camel: string, snake: string) => { const number = Number(usage?.[camel] ?? usage?.[snake]); return Number.isFinite(number) ? number : undefined; };
  return { turnId, totalTokens, inputTokens: optional("inputTokens", "input_tokens"), outputTokens: optional("outputTokens", "output_tokens"), cachedInputTokens: optional("cachedInputTokens", "cached_input_tokens") };
}
export function completedReviewText(value: any): string | undefined { const item = value?.params?.item; return value?.method === "item/completed" && item?.type === "exitedReviewMode" ? item.review : undefined; }
