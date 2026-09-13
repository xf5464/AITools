import { RequirementsError } from "../../shared/errors";

export function normalizeRequirements(bytes: Buffer): string {
  if (bytes.includes(0)) throw new RequirementsError("requirements_invalid_encoding", "审核要求包含二进制 NUL 字节");
  let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s+$/u, "");
  if (!text.trim()) throw new RequirementsError("requirements_empty", "审核要求为空");
  return text;
}
