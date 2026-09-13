import { describe, expect, it } from "vitest";
import { normalizeRequirements } from "../../src/main/requirements/requirementsNormalizer";
describe("normalizeRequirements", () => {
  it("normalizes BOM and line endings without changing internal whitespace", () => expect(normalizeRequirements(Buffer.from("\uFEFF# Rule\r\n\rKeep  two spaces  \r\n"))).toBe("# Rule\n\nKeep  two spaces"));
  it("rejects empty and binary input", () => { expect(() => normalizeRequirements(Buffer.from(" \r\n"))).toThrow(/为空/); expect(() => normalizeRequirements(Buffer.from([65,0,66]))).toThrow(/二进制/); });
  it("rejects malformed UTF-8", () => expect(() => normalizeRequirements(Buffer.from([0xc3,0x28]))).toThrow());
});
