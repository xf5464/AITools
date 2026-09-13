import type { DashboardDto } from "../../shared/contracts";

type AccountUsage = DashboardDto["accountUsage"];

export function accountUsageFromResponse(value: any): AccountUsage | undefined {
  const candidates = [
    value?.rateLimits,
    value?.rateLimitsByLimitId?.codex,
    ...Object.values(value?.rateLimitsByLimitId ?? {}),
  ];
  for (const candidate of candidates) {
    const primary = (candidate as any)?.primary;
    const usedPercent = Number(primary?.usedPercent);
    if (!Number.isFinite(usedPercent)) continue;
    const resetsAt = primary?.resetsAt == null ? undefined : Number(primary.resetsAt);
    return {
      supported: true,
      usedPercent,
      resetsAt: resetsAt !== undefined && Number.isFinite(resetsAt) ? resetsAt : undefined,
    };
  }
  return undefined;
}

export function accountUsageFromNotification(value: any): AccountUsage | undefined {
  if (value?.method !== "account/rateLimits/updated") return undefined;
  return accountUsageFromResponse({ rateLimits: value.params?.rateLimits ?? value.params });
}
