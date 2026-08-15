import { describe, expect, test } from "bun:test";
import {
    chatGuideSchema,
    chatTriggerSchema,
    messageFeedbackSchema,
} from "./index";

describe("grounded chat contracts", () => {
    test("accepts supported generation and feedback operations", () => {
        expect(chatTriggerSchema.parse("regenerate-message")).toBe("regenerate-message");
        expect(messageFeedbackSchema.parse("HELPFUL")).toBe("HELPFUL");
    });

    test("requires three to four grounded suggestions", () => {
        expect(
            chatGuideSchema.safeParse({
                overview: "Ready",
                questions: ["One?", "Two?"],
                sourceIds: ["source-1"],
            }).success,
        ).toBeFalse();
        expect(
            chatGuideSchema.safeParse({
                overview: "Ready",
                questions: ["One?", "Two?", "Three?"],
                sourceIds: ["source-1"],
            }).success,
        ).toBeTrue();
    });
});
