import { contextBridge, ipcRenderer } from "electron";
import type { CodexReviewManagerApi } from "../shared/contracts";

const api: CodexReviewManagerApi = {
  dashboard: () => ipcRenderer.invoke("dashboard:get"),
  retryConnection: () => ipcRenderer.invoke("appServer:retry"),
  setConcurrency: (value) => ipcRenderer.invoke("settings:setConcurrency", value),
  setDefaultReviewModel: (config) => ipcRenderer.invoke("settings:setDefaultReviewModel", config),
  setDefaultMcpModel: (config) => ipcRenderer.invoke("settings:setDefaultMcpModel", config),
  setGiteaReviewQueryUrl: (url) => ipcRenderer.invoke("settings:setGiteaReviewQueryUrl", url),
  setBranchReviewModel: (repositoryId, branch, config) => ipcRenderer.invoke("settings:setBranchReviewModel", repositoryId, branch, config),
  addRepository: () => ipcRenderer.invoke("repositories:add"),
  removeRepository: (id) => ipcRenderer.invoke("repositories:remove", id),
  renameRepository: (id, name) => ipcRenderer.invoke("repositories:rename", id, name),
  refresh: (id) => ipcRenderer.invoke("repositories:refresh", id),
  refreshBranches: (id) => ipcRenderer.invoke("branches:refresh", id),
  switchBranch: (id, branch) => ipcRenderer.invoke("branches:switch", id, branch),
  selectRequirements: () => ipcRenderer.invoke("requirements:select"),
  reloadRequirements: () => ipcRenderer.invoke("requirements:reload"),
  requirementsPreview: () => ipcRenderer.invoke("requirements:preview"),
  startReview: (id, target) => ipcRenderer.invoke("reviews:start", id, target),
  interruptReview: (id) => ipcRenderer.invoke("reviews:interrupt", id),
  retryReview: (id) => ipcRenderer.invoke("reviews:retry", id),
  reviewRuns: (id) => ipcRenderer.invoke("reviews:list", id),
  reviewLogs: (id) => ipcRenderer.invoke("reviews:logs", id),
  tokenTrend: (granularity) => ipcRenderer.invoke("tokens:trend", granularity),
  branchTokenUsage: () => ipcRenderer.invoke("tokens:branchUsage"),
  scanGoneBranches: () => ipcRenderer.invoke("branches:gone:scan"),
  deleteGoneBranches: (items) => ipcRenderer.invoke("branches:gone:delete", items),
  exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),
  onChanged: (listener) => { const handler = (_event: unknown, dto: Parameters<typeof listener>[0]) => listener(dto); ipcRenderer.on("manager:changed", handler); return () => ipcRenderer.removeListener("manager:changed", handler); },
  onReviewEvent: (listener) => { const handler = (_event: unknown, dto: Parameters<typeof listener>[0]) => listener(dto); ipcRenderer.on("review:event", handler); return () => ipcRenderer.removeListener("review:event", handler); },
};
contextBridge.exposeInMainWorld("reviewManager", api);
