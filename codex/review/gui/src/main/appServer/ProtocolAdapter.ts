import type { RepositorySnapshot, RequirementsSnapshot, ReviewModelConfig, ReviewTarget } from "../../shared/contracts";

export class ProtocolAdapter {
  createReviewTarget(target: ReviewTarget, snapshot: RepositorySnapshot, requirements: RequirementsSnapshot) {
    const scope = target.type === "baseBranch" ? `当前分支相对基础分支 ${target.branch} 的变化` : target.type === "uncommittedChanges" ? "当前工作区的 staged、unstaged 和 untracked 改动" : target.type === "commit" ? `提交 ${target.sha}` : target.instructions;
    const instructions = `你正在执行只读代码审核。\n\n【本次审核范围】\n类型：${target.type}\n范围：${scope}\n目录：${snapshot.canonicalPath}\n当前分支：${snapshot.branch ?? "detached"}\n基础分支：${target.type === "baseBranch" ? target.branch : "none"}\n起始 HEAD：${snapshot.head}\n\n【用户提供的全局审核要求】\n文档名称：${requirements.fileName}\n文档 SHA-256：${requirements.sha256}\n----- BEGIN USER REVIEW REQUIREMENTS -----\n${requirements.content}\n----- END USER REVIEW REQUIREMENTS -----\n\n严格按上述审核要求检查本次范围。不要修改文件。`;
    return { type: "custom" as const, instructions };
  }
  threadStart(cwd: string, reviewModel: ReviewModelConfig) { return { cwd, approvalPolicy: "never", sandbox: "read-only", serviceName: "codex-review-manager", ephemeral: false, model: reviewModel.model, config: { review_model: reviewModel.model, model_reasoning_effort: reviewModel.reasoningEffort } }; }
  threadResume(threadId: string, cwd: string, reviewModel: ReviewModelConfig) { return { threadId, cwd, approvalPolicy: "never", sandbox: "read-only", excludeTurns: true, model: reviewModel.model, config: { review_model: reviewModel.model, model_reasoning_effort: reviewModel.reasoningEffort } }; }
}
