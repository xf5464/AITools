import type { BranchTokenUsageDto, ReviewRunDto, TokenGranularity, TokenTrendDto } from "../../shared/contracts";

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function startOfWeek(date: Date) { const result = startOfDay(date); const day = result.getDay() || 7; result.setDate(result.getDate() - day + 1); return result; }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }

export function buildTokenTrend(runs: ReviewRunDto[], granularity: TokenGranularity, now = new Date()): TokenTrendDto {
  const count = granularity === "day" ? 30 : 12;
  const anchor = granularity === "day" ? startOfDay(now) : granularity === "week" ? startOfWeek(now) : startOfMonth(now);
  const starts = Array.from({ length: count }, (_, index) => {
    const offset = index - count + 1;
    const date = new Date(anchor);
    if (granularity === "day") date.setDate(date.getDate() + offset);
    else if (granularity === "week") date.setDate(date.getDate() + offset * 7);
    else date.setMonth(date.getMonth() + offset);
    return date;
  });
  const totals = new Map(starts.map((date) => [localDayKey(date), 0]));
  for (const run of runs) {
    if (!run.tokensUsed) continue;
    const date = new Date(run.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = granularity === "day" ? startOfDay(date) : granularity === "week" ? startOfWeek(date) : startOfMonth(date);
    const key = localDayKey(bucket);
    if (totals.has(key)) totals.set(key, totals.get(key)! + run.tokensUsed);
  }
  const points = starts.map((date) => ({
    period: localDayKey(date),
    label: granularity === "month" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    tokens: totals.get(localDayKey(date)) ?? 0,
  }));
  return { granularity, points, totalTokens: points.reduce((sum, point) => sum + point.tokens, 0) };
}

export function buildBranchTokenUsage(runs: ReviewRunDto[]): BranchTokenUsageDto[] {
  const totals = new Map<string, BranchTokenUsageDto>();
  for (const run of runs) {
    if (!run.repositoryKey || !run.branch || !run.tokensUsed) continue;
    const key = `${run.repositoryKey}\0${run.branch}`;
    const current = totals.get(key);
    if (current) current.tokens += run.tokensUsed;
    else totals.set(key, { repositoryKey: run.repositoryKey, branch: run.branch, tokens: run.tokensUsed });
  }
  return [...totals.values()];
}
