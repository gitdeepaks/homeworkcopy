import { describe, expect, test } from "bun:test";
import { buildMindMapTree, mindMapOutline } from "./mindmap";

const nodes = [
    { id: "root", label: "Photosynthesis" },
    { id: "light", label: "Light reactions" },
    { id: "calvin", label: "Calvin cycle" },
    { id: "atp", label: "ATP" },
];

const edges = [
    { id: "e1", source: "root", target: "light" },
    { id: "e2", source: "root", target: "calvin" },
    { id: "e3", source: "light", target: "atp" },
];

describe("buildMindMapTree", () => {
    test("roots the tree at the node nothing points to", () => {
        const tree = buildMindMapTree(nodes, edges);
        expect(tree?.id).toBe("root");
        expect(tree?.children.map((child) => child.id)).toEqual([
            "light",
            "calvin",
        ]);
    });

    test("returns null for an empty map", () => {
        expect(buildMindMapTree([], [])).toBeNull();
    });

    test("survives a cycle without looping forever", () => {
        const tree = buildMindMapTree(
            [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
            [
                { id: "e1", source: "a", target: "b" },
                { id: "e2", source: "b", target: "a" },
            ],
        );
        expect(tree).not.toBeNull();
        expect(tree?.children).toHaveLength(1);
    });

    test("keeps disconnected nodes reachable", () => {
        const tree = buildMindMapTree(
            [...nodes, { id: "orphan", label: "Stray" }],
            edges,
        );
        expect(
            tree?.children.some((child) => child.id === "orphan"),
        ).toBeTrue();
    });
});

describe("mindMapOutline", () => {
    test("flattens the map into an indented reading order", () => {
        expect(mindMapOutline(nodes, edges)).toEqual([
            { id: "root", label: "Photosynthesis", depth: 0 },
            { id: "light", label: "Light reactions", depth: 1 },
            { id: "atp", label: "ATP", depth: 2 },
            { id: "calvin", label: "Calvin cycle", depth: 1 },
        ]);
    });

    test("returns nothing for an empty map", () => {
        expect(mindMapOutline([], [])).toEqual([]);
    });
});
