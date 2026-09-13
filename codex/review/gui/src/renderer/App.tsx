import { useEffect, useMemo, useState } from "react";
import type { BranchTokenUsageDto, DashboardDto, RepositoryRowDto, RequirementsStatus, ReviewEvent, ReviewRunDto, ReviewTarget, TokenGranularity, TokenTrendDto } from "../shared/contracts";

const icons = { projects: "▦", history: "◷", tokens: "≋", settings: "⚙", refresh: "↻", add: "⊞", play: "▶", stop: "■", folder: "□", search: "⌕" };
const statusText: Record<string, string> = { ready: "可以审核", reviewing: "审核中", starting: "正在启动", queued: "排队中", completed: "已完成", failed: "审核失败", stale: "结果已过期", interrupted: "已停止", not_configured: "未配置要求", blocked_requirements: "要求不可用", recovering: "正在恢复" };
const emptyDashboard: DashboardDto = { version: 0, initialized: false, connection: "starting", requirements: { state: "not_configured" }, repositories: [], managerTokens: 0, todayTokens: 0, activeReviews: 0, queuedReviews: 0, concurrency: 1, models: [{ id: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }], accountUsage: { supported: false } };

function formatTokens(value?: number) { if (value === undefined) return "—"; if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`; if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`; return value.toLocaleString(); }
function shortPath(path: string) { const pieces = path.split(/[\\/]/); return pieces.length > 4 ? `${pieces[0]}\\…\\${pieces.slice(-2).join("\\")}` : path; }

export function App() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState<"projects" | "history" | "tokens" | "settings">("projects");
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [preview, setPreview] = useState<RequirementsStatus>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showTokenTrend, setShowTokenTrend] = useState(false);
  useEffect(() => { window.reviewManager.dashboard().then(setDashboard).catch((e) => setNotice(String(e))); const offChanged = window.reviewManager.onChanged(setDashboard); const offEvent = window.reviewManager.onReviewEvent((event) => setEvents((old) => [...old.slice(-199), event])); return () => { offChanged(); offEvent(); }; }, []);
  useEffect(() => { if (!selected && dashboard.repositories[0]) setSelected(dashboard.repositories[0].id); if (selected && !dashboard.repositories.some((r) => r.id === selected)) setSelected(dashboard.repositories[0]?.id); }, [dashboard.repositories, selected]);
  const row = dashboard.repositories.find((repository) => repository.id === selected);
  async function action(work: () => Promise<unknown>) { setBusy(true); setNotice(""); try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }
  async function showRequirements() { await action(async () => setPreview(await window.reviewManager.requirementsPreview())); }
  function showRunSnapshot(run: NonNullable<RepositoryRowDto["latestRun"]>) { setPreview({ state: "valid", filePath: run.requirementsPath, fileName: run.requirementsFileName, sha256: run.requirementsSha256, preview: run.requirementsSnapshot }); }
  return <div className="shell">
    <header className="titlebar"><span className="logo">⌕</span><strong>Codex Review Manager</strong><span>本地审核工作台</span></header>
    <aside className="nav" aria-label="主导航">
      {(["projects","history","tokens","settings"] as const).map((item) => <button key={item} className={page === item ? "active" : ""} onClick={() => setPage(item)} aria-label={{ projects: "项目概览", history: "审核历史", tokens: "Token 统计", settings: "设置" }[item]} title={{ projects: "项目概览", history: "审核历史", tokens: "Token 统计", settings: "设置" }[item]}>{icons[item]}</button>)}
    </aside>
    <main>
      <div className="heading"><div><h1>{page === "projects" ? "代码审核" : page === "history" ? "审核历史" : page === "tokens" ? "Token 统计" : "设置"}</h1><p>统一管理多个本地 Git 目录及其 Codex 审核会话</p></div><div className="global-actions">
        <button className={`pill ${dashboard.connection}`} title={dashboard.connectionError ?? (dashboard.connection === "ready" ? "Codex App Server 已连接，用于启动审核、接收结果和读取账户用量。" : "点击重新连接 Codex App Server。")} onClick={() => dashboard.connection !== "ready" && void action(async () => setDashboard(await window.reviewManager.retryConnection()))}>● {dashboard.connection === "ready" ? "App Server 已连接" : dashboard.connection === "unauthenticated" ? "Codex 尚未登录" : dashboard.connection === "recovering" ? "Codex 正在恢复" : dashboard.connection === "failed" ? "Codex 连接失败（点击重试）" : "正在连接 Codex"}</button>
        <button className={`pill requirements ${dashboard.requirements.state}`} title="查看当前全局审核要求；每轮审核开始时会重新读取该文档。" onClick={showRequirements}>▱ {dashboard.requirements.fileName ? `审核要求 · ${dashboard.requirements.fileName}` : "审核要求未配置"}</button>
        <button className="secondary" title="重新读取所有目录的 Git 状态、分支和远程主干，不会 pull 或修改代码。" disabled={busy} onClick={() => action(() => window.reviewManager.refresh())}>{icons.refresh} 刷新全部</button>
        <button className="primary" title="选择并添加一个本地 Git 仓库目录到审核列表。" disabled={busy} onClick={() => action(() => window.reviewManager.addRepository())}>{icons.add} 添加目录</button>
      </div></div>
      {notice && <div className="notice" role="alert"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {page === "projects" && <ProjectsPage dashboard={dashboard} row={row} selected={selected} setSelected={setSelected} events={events} action={action} showRequirements={showRequirements} showRunSnapshot={showRunSnapshot} showTokenTrend={() => setShowTokenTrend(true)} />}
      {page === "history" && <HistoryPage dashboard={dashboard} setSelected={(id) => { setSelected(id); setPage("projects"); }} />}
      {page === "tokens" && <TokenPage dashboard={dashboard} />}
      {page === "settings" && <SettingsPage status={dashboard.requirements} concurrency={dashboard.concurrency} action={action} showPreview={showRequirements} />}
    </main>
    <footer><span>ⓘ 仅按需更新设置中的远程对比分支；不会 pull、切换分支或修改代码。</span><span>GUI 原型 · 2026-09-12</span></footer>
    {preview?.preview && <div className="modal-backdrop" onMouseDown={() => setPreview(undefined)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div><h2>审核要求预览</h2><button onClick={() => setPreview(undefined)}>×</button></div><dl><dt>路径</dt><dd>{preview.filePath}</dd><dt>SHA-256</dt><dd className="mono">{preview.sha256}</dd></dl><pre>{preview.preview}</pre></section></div>}
    {showTokenTrend && <TokenTrendModal close={() => setShowTokenTrend(false)} />}
    {!dashboard.initialized && <div className="startup-loading" role="dialog" aria-modal="true" aria-label="系统正在加载"><div><span className="loading-spinner" aria-hidden="true"></span><strong>系统正在加载</strong><p>正在读取仓库、分支和审核数据，请稍候…</p></div></div>}
    <div className="sr-only" aria-live="polite">{notice}</div>
  </div>;
}

function ProjectsPage({ dashboard, row, selected, setSelected, events, action, showRequirements, showRunSnapshot, showTokenTrend }: { dashboard: DashboardDto; row?: RepositoryRowDto; selected?: string; setSelected(id: string): void; events: ReviewEvent[]; action(work: () => Promise<unknown>): Promise<void>; showRequirements(): void; showRunSnapshot(run: NonNullable<RepositoryRowDto["latestRun"]>): void; showTokenTrend(): void }) {
  const clean = dashboard.repositories.filter((r) => !r.snapshot?.dirty).length;
  return <><section className="summary">
    <Summary label="项目目录" value={String(dashboard.repositories.length)} detail={`${clean} 个干净 · ${dashboard.repositories.length - clean} 个有改动`} icon="□" />
    <Summary label="正在审核" value={`${dashboard.activeReviews} / ${dashboard.concurrency}`} detail={`并发上限 ${dashboard.concurrency} · 队列 ${dashboard.queuedReviews}`} icon="◔" />
    <Summary label="本管理器累计 Token" value={formatTokens(dashboard.managerTokens)} detail={`今日 ${formatTokens(dashboard.todayTokens)} · 仅统计本 GUI`} icon="Σ" actionLabel="查看趋势" onAction={showTokenTrend} />
    <Summary label="账户窗口用量" value={dashboard.accountUsage.supported ? `${dashboard.accountUsage.usedPercent ?? 0}%` : "账户用量不可用"} detail={dashboard.accountUsage.supported ? (dashboard.accountUsage.resetsAt ? `${new Date(dashboard.accountUsage.resetsAt * 1000).toLocaleString()} 后重置` : "账户范围") : (dashboard.accountUsage.message ?? "当前认证方式不提供")} icon="" />
  </section>
  {dashboard.requirements.state === "not_configured" && <div className="requirements-block"><div><strong>开始审核前，请先选择全局默认审核要求文档。</strong><p>支持 UTF-8 Markdown 或文本，内容将在每次审核开始时重新读取并完整发送。</p></div><button className="primary" onClick={() => action(() => window.reviewManager.selectRequirements())}>选择文档</button></div>}
  <section className="workspace"><div className="table-panel"><div className="panel-title"><strong>项目目录</strong><span>{dashboard.repositories.length} 个</span></div><div className="table-scroll"><table><thead><tr><th>项目 / HEAD</th><th>当前分支 / 对比 / 模型</th><th>Git</th><th>审核状态</th><th>Token / 轮次</th><th>操作</th></tr></thead><tbody>{dashboard.repositories.map((repository) => <RepositoryRow key={repository.id} row={repository} models={dashboard.models} selected={selected === repository.id} choose={() => setSelected(repository.id)} requirementsValid={["valid","changed"].includes(dashboard.requirements.state)} connectionReady={dashboard.connection === "ready"} action={action} />)}</tbody></table>{!dashboard.repositories.length && <div className="empty"><span className="empty-folder">▱</span><strong>尚未添加项目目录</strong><p>选择目录后，可创建或恢复 Codex 审核会话</p></div>}</div></div><ReviewDetails row={row} events={events.filter((event) => event.repositoryId === row?.id)} showRunSnapshot={showRunSnapshot} action={action} /></section></>;
}

function Summary({ label, value, detail, icon, actionLabel, onAction }: { label: string; value: string; detail: string; icon: string; actionLabel?: string; onAction?(): void }) { return <div className="summary-card"><div><span>{label}</span><strong>{value}</strong><small>{detail}</small>{onAction && <button className="summary-link" type="button" onClick={onAction}>{actionLabel}</button>}</div><i>{icon}</i></div>; }

function RepositoryRow({ row, models, selected, choose, requirementsValid, connectionReady, action }: { row: RepositoryRowDto; models: DashboardDto["models"]; selected: boolean; choose(): void; requirementsValid: boolean; connectionReady: boolean; action(work: () => Promise<unknown>): Promise<void> }) {
  const [refreshingBranches, setRefreshingBranches] = useState(false);
  const queued = row.reviewStatus === "queued";
  const active = ["queued","starting","reviewing","recovering"].includes(row.reviewStatus);
  const selectedModel = models.find((model) => model.id === row.reviewModel.model);
  const efforts = selectedModel?.supportedReasoningEfforts.length ? selectedModel.supportedReasoningEfforts : ["low", "medium", "high", "xhigh"];
  const localBranches = new Set(row.branches.filter((branch) => !branch.remote).map((branch) => branch.name));
  const selectableBranches = row.branches.filter((branch) => !branch.remote || !localBranches.has(branch.name.slice(branch.name.indexOf("/") + 1)));
  const reviewMark = !active && row.latestRun ? row.latestRun.status === "completed" ? "success" : ["failed", "interrupted", "stale"].includes(row.latestRun.status) ? "failure" : undefined : undefined;
  const disabledReason = !requirementsValid ? "审核要求不可用" : !connectionReady ? "Codex 未连接" : row.comparisonError ?? (!row.baseBranch ? "对比分支不可用" : undefined);
  async function start() { if (queued) return; if (!row.baseBranch) throw new Error(row.comparisonError ?? "对比分支不可用"); await window.reviewManager.startReview(row.id, { type: "baseBranch", branch: row.baseBranch }); }
  async function refreshBranches() { if (refreshingBranches) return; setRefreshingBranches(true); try { const result = await window.reviewManager.refreshBranches(row.id); alert(result.newBranches.length ? `刷新成功，发现 ${result.newBranches.length} 个新的远程分支：\n${result.newBranches.join("\n")}` : "没有新的远程分支"); } finally { setRefreshingBranches(false); } }
  return <tr className={selected ? "selected" : ""} onClick={choose} aria-selected={selected} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose()}><td><div className="project-cell"><span className="folder">□</span><div><strong>{row.displayName}</strong><small title={row.path}>{shortPath(row.path)} · {row.snapshot?.shortHead ?? "—"}</small></div></div></td><td><div className="branch-picker"><select aria-label={`${row.displayName} 当前分支`} value={row.snapshot?.branch ?? ""} disabled={active} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); const target = e.target.value; if (confirm(`从 ${row.snapshot?.branch ?? "detached"} 切换到 ${target}？\n${row.path}\n${row.snapshot?.dirty ? "未提交改动会保留在工作区；如果目标分支冲突，Git 会拒绝切换。\\n" : ""}不会执行 pull。`)) void action(() => window.reviewManager.switchBranch(row.id, target)); }}>{selectableBranches.map((branch) => <option key={branch.fullName} value={branch.name} disabled={Boolean(branch.occupiedBy)}>{branch.name}{branch.occupiedBy ? `（占用于 ${branch.occupiedBy}）` : ""}</option>)}</select><button className="branch-refresh" type="button" title="刷新远程分支" aria-label={`${row.displayName} 刷新远程分支`} disabled={active || refreshingBranches} onClick={(e) => { e.stopPropagation(); void action(refreshBranches); }}><span className={`branch-refresh-arrow ${refreshingBranches ? "spinning" : ""}`}>{icons.refresh}</span></button></div><div className={`sub-select ${row.comparisonError ? "comparison-error" : ""}`} title={row.comparisonError}>对比 <strong>{row.baseBranch ?? row.comparisonError ?? "不可用"}</strong></div><div className="branch-review-config">模型 <select aria-label={`${row.displayName} 审核模型`} value={row.reviewModel.model} disabled={active || !row.snapshot?.branch} onClick={(e) => e.stopPropagation()} onChange={(e) => { const model = e.target.value, option = models.find((item) => item.id === model), reasoningEffort = option?.supportedReasoningEfforts.includes(row.reviewModel.reasoningEffort) ? row.reviewModel.reasoningEffort : option?.defaultReasoningEffort ?? (option?.supportedReasoningEfforts.includes("medium") ? "medium" : option?.supportedReasoningEfforts[0] ?? "medium"); if (row.snapshot?.branch) void action(() => window.reviewManager.setBranchReviewModel(row.id, row.snapshot!.branch!, { model, reasoningEffort })); }}>{models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select><select aria-label={`${row.displayName} 推理强度`} value={row.reviewModel.reasoningEffort} disabled={active || !row.snapshot?.branch} onClick={(e) => e.stopPropagation()} onChange={(e) => row.snapshot?.branch && void action(() => window.reviewManager.setBranchReviewModel(row.id, row.snapshot!.branch!, { model: row.reviewModel.model, reasoningEffort: e.target.value as typeof row.reviewModel.reasoningEffort }))}>{efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></div></td><td><span className={`badge ${row.snapshot?.dirty ? "warning" : "success"}`}>● {row.snapshot?.dirty ? `有改动 ${row.snapshot.staged + row.snapshot.unstaged + row.snapshot.untracked}` : "干净"}</span>{row.snapshot?.operation !== "none" && <small>{row.snapshot?.operation}</small>}</td><td><span className={`badge state-${row.reviewStatus}`}>● {statusText[row.reviewStatus] ?? row.reviewStatus}</span><small>{row.error ?? (row.latestRun?.completedAt ? new Date(row.latestRun.completedAt).toLocaleString() : "从未审核")}</small></td><td><strong>{formatTokens(row.latestRun?.tokensUsed)}</strong><small>累计 {formatTokens(row.repositoryTokens)} · 完整 {row.completedReviewRounds} 轮</small></td><td><div className="operation-cell"><button className={`icon-action ${active ? "danger" : ""}`} title={active ? "停止审核" : disabledReason ?? (row.latestRun ? "重新审核" : "开始审核")} aria-label={active ? "停止审核" : disabledReason ?? "开始审核"} disabled={!active && Boolean(disabledReason)} onClick={(e) => { e.stopPropagation(); void action(() => active && row.activeRun ? window.reviewManager.interruptReview(row.activeRun.id) : start()); }}>{active ? icons.stop : icons.play}</button>{reviewMark && <span className={`review-mark ${reviewMark}`} title={reviewMark === "success" ? "审核成功" : "审核未成功完成"} aria-label={reviewMark === "success" ? "审核成功" : "审核未成功完成"}>{reviewMark === "success" ? "✓" : "×"}</span>}</div></td></tr>;
}

function ReviewDetails({ row, events, showRunSnapshot, action }: { row?: RepositoryRowDto; events: ReviewEvent[]; showRunSnapshot(run: NonNullable<RepositoryRowDto["latestRun"]>): void; action(work: () => Promise<unknown>): Promise<void> }) {
  const [tab, setTab] = useState<"live" | "result" | "info" | "log">("live");
  const [logs, setLogs] = useState<ReviewRunDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const run = row?.activeRun ?? row?.latestRun;
  const liveText = useMemo(() => events.filter((e) => e.text).map((e) => e.text).join(""), [events]);
  useEffect(() => {
    let current = true;
    setLogs([]); setLogsError("");
    if (!row?.snapshot?.branch) return () => { current = false; };
    setLogsLoading(true);
    window.reviewManager.reviewLogs(row.id).then((items) => { if (current) setLogs(items); }).catch((error) => { if (current) setLogsError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (current) setLogsLoading(false); });
    return () => { current = false; };
  }, [row?.id, row?.snapshot?.repositoryKey, row?.snapshot?.branch, row?.completedReviewRounds]);
  if (!row) return <aside className="details empty-details"><span>{icons.search}</span><strong>选择一个项目</strong><p>审核会话、输出和运行信息将在这里显示</p></aside>;
  return <aside className="details"><div className="detail-head"><span className="detail-icon">⌕</span><div><strong>{row.displayName}</strong><small>[Review Manager] {row.displayName}</small></div><span className={`badge state-${row.reviewStatus}`}>● {statusText[row.reviewStatus]}</span></div><div className="tabs">{([['live','实时输出'],['result','审核结果'],['info','运行信息'],['log','审核日志']] as const).map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div><div className="detail-body">
    {tab === "live" && <><div className="scope"><div><small>审核范围</small><span>{run?.targetType ?? "尚未开始"}</span></div><div><small>起始 HEAD</small><span className="mono">{run?.headSha.slice(0, 7) ?? row.snapshot?.shortHead}</span></div></div><div className="timeline">{events.length ? events.map((event, index) => <div className="event" key={`${event.at}-${index}`}><i></i><small>{new Date(event.at).toLocaleTimeString()}</small><strong>{statusText[event.type] ?? event.type}</strong>{event.text && <p>{event.text}</p>}</div>) : <div className="empty-live">点击开始审核后，流式输出会显示在这里。</div>}</div></>}
    {tab === "result" && <div className="result-text">{run?.resultText ? <pre>{run.resultText}</pre> : <p>审核尚未完成。</p>}{run?.status === "stale" && <div className="notice">结果已过期：审核期间 Git 状态发生变化。</div>}</div>}
    {tab === "info" && <><dl className="run-info"><dt>完整目录</dt><dd>{row.path}</dd><dt>当前分支</dt><dd>{run?.branch ?? row.snapshot?.branch ?? "detached"}</dd><dt>基础分支</dt><dd>{run?.baseBranch ?? "—"}</dd><dt>审核模型</dt><dd>{run ? (run.model ? `${run.model} · ${run.reasoningEffort}` : "旧记录未保存模型") : `${row.reviewModel.model} · ${row.reviewModel.reasoningEffort}`}</dd><dt>完整审核轮次</dt><dd>{row.completedReviewRounds} 轮</dd><dt>起始 HEAD</dt><dd className="mono">{run?.headSha ?? "—"}</dd><dt>审核要求</dt><dd><button className="link" disabled={!run} onClick={() => run && showRunSnapshot(run)}>{run?.requirementsFileName ?? "—"}</button></dd><dt>SHA-256</dt><dd className="mono">{run?.requirementsSha256 ?? "—"}</dd><dt>Sandbox</dt><dd>read-only</dd><dt>本次 Token</dt><dd>{run?.tokenComplete ? formatTokens(run.tokensUsed) : "Token 不完整"}</dd></dl><div className="settings-actions"><button className="secondary" onClick={() => { const name = prompt("项目显示名称", row.displayName); if (name?.trim()) void action(() => window.reviewManager.renameRepository(row.id, name.trim())); }}>重命名</button><button className="secondary" disabled={Boolean(row.activeRun)} onClick={() => confirm(`从管理器移除 ${row.displayName}？\n不会删除目录或 Codex thread。`) && void action(() => window.reviewManager.removeRepository(row.id))}>移除目录</button></div></>}
    {tab === "log" && <div className="review-log"><div className="review-log-identity"><small>累计范围</small><strong>{row.snapshot?.remoteUrl ?? row.snapshot?.repositoryKey ?? "未知仓库"}</strong><span>分支：{row.snapshot?.branch ?? "detached"}</span></div>{logsLoading ? <p className="review-log-empty">正在读取审核日志…</p> : logsError ? <p className="review-log-error">读取失败：{logsError}</p> : logs.length ? logs.map((item) => <article className="review-log-entry" key={item.id}><header><div><strong>{item.resultClass === "has_findings" ? "发现审核问题" : item.resultClass === "no_findings" ? "未发现问题" : "审核结果"}</strong><small>{new Date(item.completedAt ?? item.createdAt).toLocaleString()}</small></div><span className={`badge ${item.status === "stale" ? "state-stale" : "success"}`}>{item.status === "stale" ? "结果已过期" : "完整结束"}</span></header><div className="review-log-meta"><span>HEAD {item.headSha.slice(0, 7)}</span><span>{item.model ?? "旧记录模型未知"}{item.reasoningEffort ? ` · ${item.reasoningEffort}` : ""}</span></div><pre>{item.resultText}</pre></article>) : <p className="review-log-empty">该仓库地址下的当前分支暂无完整审核记录。</p>}</div>}
  </div><div className="detail-footer"><span>♢ 只读审核 · 会话自动恢复</span><strong>{run?.tokenComplete ? `${formatTokens(run.tokensUsed)} Token` : "Token 不完整"}</strong></div></aside>;
}

function TokenTrendModal({ close }: { close(): void }) {
  const [view, setView] = useState<"trend" | "branch">("trend");
  const [granularity, setGranularity] = useState<TokenGranularity>("day");
  const [trend, setTrend] = useState<TokenTrendDto>();
  const [branchUsage, setBranchUsage] = useState<BranchTokenUsageDto[]>([]);
  const [branchSort, setBranchSort] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    window.reviewManager.tokenTrend(granularity).then((value) => { if (current) setTrend(value); }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [granularity]);
  useEffect(() => {
    if (view !== "branch") return;
    let current = true;
    setLoading(true); setError("");
    window.reviewManager.branchTokenUsage().then((value) => { if (current) setBranchUsage(value); }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [view]);
  const title = granularity === "day" ? "最近 30 天" : granularity === "week" ? "最近 12 周" : "最近 12 个月";
  const sortedBranches = useMemo(() => [...branchUsage].sort((a, b) => branchSort === "desc" ? b.tokens - a.tokens : a.tokens - b.tokens), [branchUsage, branchSort]);
  return <div className="modal-backdrop" onMouseDown={close}><section className="modal token-trend-modal" onMouseDown={(event) => event.stopPropagation()}><div className="token-trend-head"><div><h2>{view === "trend" ? "Token 使用趋势" : "分支 Token 用量"}</h2><small>{view === "trend" ? `${title} · 仅统计本 GUI 可归因的审核 Token` : "按 Git 仓库地址和分支分别累计"}</small></div><button aria-label="关闭 Token 趋势" onClick={close}>×</button></div><div className="trend-toolbar"><div className="trend-controls trend-view-controls" role="group" aria-label="Token 统计视图"><button className={view === "trend" ? "active" : ""} onClick={() => { setView("trend"); setLoading(false); }}>使用趋势</button><button className={view === "branch" ? "active" : ""} onClick={() => setView("branch")}>按分支用量</button></div>{view === "trend" && <div className="trend-controls" role="group" aria-label="时间粒度">{([['day','日'],['week','周'],['month','月']] as const).map(([value, label]) => <button key={value} className={granularity === value ? "active" : ""} onClick={() => setGranularity(value)}>{label}</button>)}</div>}</div>{loading ? <div className="trend-state">正在统计…</div> : error ? <div className="trend-state error">读取失败：{error}</div> : view === "trend" && trend ? <><TokenLineChart trend={trend} /><div className="trend-total"><span>当前区间累计</span><strong>{formatTokens(trend.totalTokens)} Token</strong></div></> : <BranchTokenTable rows={sortedBranches} sort={branchSort} changeSort={() => setBranchSort((old) => old === "desc" ? "asc" : "desc")} />}</section></div>;
}

function BranchTokenTable({ rows, sort, changeSort }: { rows: BranchTokenUsageDto[]; sort: "desc" | "asc"; changeSort(): void }) {
  if (!rows.length) return <div className="trend-state">暂无可归因到仓库分支的 Token 记录。</div>;
  return <div className="branch-token-table-wrap"><table className="branch-token-table"><thead><tr><th>仓库地址</th><th>分支名</th><th><button onClick={changeSort}>Token 使用量 <span aria-hidden="true">{sort === "desc" ? "↓" : "↑"}</span></button></th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.repositoryKey}\0${row.branch}`}><td title={row.repositoryKey}>{row.repositoryKey}</td><td>{row.branch}</td><td>{row.tokens.toLocaleString()}</td></tr>)}</tbody></table></div>;
}

function TokenLineChart({ trend }: { trend: TokenTrendDto }) {
  const width = 720, height = 310, left = 64, right = 18, top = 22, bottom = 48;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...trend.points.map((point) => point.tokens));
  const coordinates = trend.points.map((point, index) => ({ ...point, x: left + (trend.points.length > 1 ? index * plotWidth / (trend.points.length - 1) : plotWidth / 2), y: top + plotHeight - point.tokens / maximum * plotHeight }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(trend.points.length / 6));
  return <div className="token-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Token 使用折线图，区间累计 ${trend.totalTokens} Token`}>
    {[0,1,2,3,4].map((tick) => { const y = top + tick * plotHeight / 4, value = Math.round(maximum * (1 - tick / 4)); return <g key={tick}><line x1={left} y1={y} x2={width - right} y2={y} className="chart-grid"/><text x={left - 10} y={y + 4} textAnchor="end" className="chart-axis">{formatTokens(value)}</text></g>; })}
    <path d={path} className="chart-line"/>
    {coordinates.map((point, index) => <g key={point.period}><circle cx={point.x} cy={point.y} r={point.tokens ? 4 : 2.5} className="chart-point"><title>{point.label}：{point.tokens.toLocaleString()} Token</title></circle>{(index % labelStep === 0 || index === coordinates.length - 1) && <text x={point.x} y={height - 18} textAnchor="middle" className="chart-axis">{point.label}</text>}</g>)}
  </svg></div>;
}

function HistoryPage({ dashboard, setSelected }: { dashboard: DashboardDto; setSelected(id: string): void }) { const rows = dashboard.repositories.flatMap((repository) => [repository.latestRun && { repository, run: repository.latestRun }]).filter(Boolean) as Array<{repository: RepositoryRowDto; run: NonNullable<RepositoryRowDto["latestRun"]>}>; return <section className="single-panel"><h2>最近审核</h2>{rows.length ? rows.map(({repository,run}) => <button className="history-row" key={run.id} onClick={() => setSelected(repository.id)}><strong>{repository.displayName}</strong><span>{statusText[run.status]}</span><span>{new Date(run.createdAt).toLocaleString()}</span><span>{formatTokens(run.tokensUsed)} Token</span></button>) : <div className="empty">暂无审核历史</div>}</section>; }
function TokenPage({ dashboard }: { dashboard: DashboardDto }) { return <section className="single-panel"><h2>Token 统计</h2><div className="token-grid"><Summary label="本管理器累计" value={formatTokens(dashboard.managerTokens)} detail="仅可归因于本 GUI 的 review run" icon="Σ"/><Summary label="今日 GUI 使用" value={formatTokens(dashboard.todayTokens)} detail="按本地 review run 求和" icon="◷"/><Summary label="账户范围" value={dashboard.accountUsage.supported ? `${dashboard.accountUsage.usedPercent}%` : "不可用"} detail="与 GUI 累计不相加" icon="◎"/></div></section>; }
function SettingsPage({ status, concurrency, action, showPreview }: { status: RequirementsStatus; concurrency: number; action(work: () => Promise<unknown>): Promise<void>; showPreview(): void }) {
  async function cleanGoneBranches() {
    await action(async () => {
      const scan = await window.reviewManager.scanGoneBranches();
      const skippedText = scan.skipped.length ? `\n\n已跳过正在使用的分支：\n${scan.skipped.map((item) => `${item.repositoryName} · ${item.branch}（${item.reason}）`).join("\n")}` : "";
      const errorText = scan.errors.length ? `\n\n扫描失败的目录：\n${scan.errors.map((item) => `${item.repositoryName}：${item.message}`).join("\n")}` : "";
      if (!scan.candidates.length) { alert(`没有可安全清理的失效本地分支。${skippedText}${errorText}`); return; }
      const list = scan.candidates.map((item) => `${item.repositoryName} · ${item.branch}（原上游 ${item.upstream}）`).join("\n");
      if (!confirm(`将安全删除以下 ${scan.candidates.length} 个远程已删除的本地分支：\n\n${list}\n\n未合并的本地分支不会被强制删除。是否继续？${skippedText}${errorText}`)) return;
      const result = await window.reviewManager.deleteGoneBranches(scan.candidates.map(({ repositoryId, branch }) => ({ repositoryId, branch })));
      const failedText = result.failed.length ? `\n\n未删除：\n${result.failed.map((item) => `${item.repositoryName} · ${item.branch}：${item.reason}`).join("\n")}` : "";
      alert(`清理完成：已删除 ${result.deleted.length} 个分支，未删除 ${result.failed.length} 个。${failedText}`);
    });
  }
  return <section className="single-panel settings"><h2>默认审核要求</h2><dl><dt>状态</dt><dd>{status.state}</dd><dt>文件</dt><dd>{status.fileName ?? "未选择"}</dd><dt>完整路径</dt><dd>{status.filePath ?? "—"}</dd><dt>大小</dt><dd>{status.sizeBytes?.toLocaleString() ?? "—"} bytes</dd><dt>最近读取</dt><dd>{status.loadedAt ? new Date(status.loadedAt).toLocaleString() : "—"}</dd><dt>SHA-256</dt><dd className="mono">{status.sha256 ?? "—"}</dd></dl><div className="settings-actions"><button className="primary" onClick={() => action(() => window.reviewManager.selectRequirements())}>{status.fileName ? "替换文档" : "选择文档"}</button><button className="secondary" disabled={!status.fileName} onClick={() => action(() => window.reviewManager.reloadRequirements())}>重新读取</button><button className="secondary" disabled={!status.fileName} onClick={showPreview}>预览</button></div><p className="hint">每次审核都会在实际开始时重新读取、保存不可变快照并完整发送；内容越长，Token 消耗越高。</p><h2>审核调度</h2><label className="setting-field"><span>审核并发上限</span><select value={concurrency} onChange={(event) => void action(() => window.reviewManager.setConcurrency(Number(event.target.value)))}>{[1,2,3,4].map((value) => <option value={value} key={value}>{value}</option>)}</select><small>同时运行的审核数量；其余任务进入队列。每个目录的主干会根据远程默认分支自动识别。</small></label><h2>分支维护</h2><div className="branch-maintenance"><button className="secondary" onClick={() => void cleanGoneBranches()}>清理失效本地分支</button><small>刷新并清理远程已删除但本地仍保留的跟踪分支；当前分支、工作树占用分支及未合并分支不会删除。</small></div><h2>诊断</h2><button className="secondary" onClick={() => action(() => window.reviewManager.exportDiagnostics())}>导出脱敏诊断</button><h2>兼容性实验</h2><label className="disabled-toggle"><input type="checkbox" disabled /> 桌面左侧聊天栏互通（未验证，保持关闭）</label></section>;
}
