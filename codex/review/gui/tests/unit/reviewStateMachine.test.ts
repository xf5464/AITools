import { describe, expect, it } from "vitest";
import { canTransition } from "../../src/main/reviews/ReviewStateMachine";
describe("review state machine", () => { it("allows normal lifecycle", () => { expect(canTransition("ready", "starting")).toBe(true); expect(canTransition("starting", "reviewing")).toBe(true); expect(canTransition("reviewing", "completed")).toBe(true); }); it("rejects unsafe jumps", () => expect(canTransition("completed", "reviewing")).toBe(false)); });
