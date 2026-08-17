import { describe, expect, test } from "bun:test";
import {
    itemsToLines,
    linesToItems,
    nextElementId,
    removeAt,
    replaceAt,
} from "./editing";

describe("linesToItems", () => {
    test("drops blank lines and surrounding whitespace", () => {
        expect(linesToItems("  First  \n\n  Second\n \n")).toEqual([
            "First",
            "Second",
        ]);
    });

    test("returns nothing for an empty textarea", () => {
        expect(linesToItems("   \n \n")).toEqual([]);
    });
});

describe("itemsToLines", () => {
    test("round-trips through the textarea representation", () => {
        const items = ["First", "Second", "Third"];
        expect(linesToItems(itemsToLines(items))).toEqual(items);
    });
});

describe("nextElementId", () => {
    test("continues past the highest id in use", () => {
        expect(
            nextElementId("sl", [{ id: "sl1" }, { id: "sl2" }, { id: "sl3" }]),
        ).toBe("sl4");
    });

    test("does not reuse an id after a middle element is removed", () => {
        expect(nextElementId("r", [{ id: "r1" }, { id: "r3" }])).toBe("r4");
    });

    test("starts the space when nothing exists yet", () => {
        expect(nextElementId("t", [])).toBe("t1");
    });

    test("ignores ids that do not belong to this space", () => {
        expect(nextElementId("sl", [{ id: "other" }, { id: "sl2" }])).toBe("sl3");
    });
});

describe("replaceAt and removeAt", () => {
    test("replace leaves the other elements untouched", () => {
        const items = ["a", "b", "c"];
        expect(replaceAt(items, 1, "B")).toEqual(["a", "B", "c"]);
        expect(items).toEqual(["a", "b", "c"]);
    });

    test("remove drops only the targeted element", () => {
        expect(removeAt(["a", "b", "c"], 0)).toEqual(["b", "c"]);
    });

    test("an out-of-range index is a no-op", () => {
        expect(replaceAt(["a"], 4, "z")).toEqual(["a"]);
        expect(removeAt(["a"], 4)).toEqual(["a"]);
    });
});
