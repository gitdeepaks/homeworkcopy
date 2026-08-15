import type { MindmapOutputContent } from "@homeworkcopy/contracts";

export type MindMapNode = MindmapOutputContent["nodes"][number];
export type MindMapEdge = MindmapOutputContent["edges"][number];

export type MindMapTreeNode = {
    id: string;
    label: string;
    children: MindMapTreeNode[];
};

export type MindMapOutlineRow = {
    id: string;
    label: string;
    depth: number;
};

/**
 * Turns generated nodes and edges into a single tree.
 *
 * Cycles and repeated targets are resolved by claiming each node once, so a
 * malformed graph still renders instead of looping forever.
 *
 * @param nodes - Mind map nodes
 * @param edges - Directed edges between node ids
 * @returns The root of the tree, or `null` when there are no nodes
 */
export function buildMindMapTree(
    nodes: readonly MindMapNode[],
    edges: readonly MindMapEdge[],
): MindMapTreeNode | null {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const children = new Map<string, string[]>();
    const incoming = new Map<string, number>();

    for (const node of nodes) {
        children.set(node.id, []);
        incoming.set(node.id, 0);
    }

    for (const edge of edges) {
        if (!children.has(edge.source) || !incoming.has(edge.target)) {
            continue;
        }
        children.get(edge.source)?.push(edge.target);
        incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }

    const claimed = new Set<string>();

    function toTreeNode(id: string): MindMapTreeNode | null {
        const source = nodeMap.get(id);
        if (!source || claimed.has(id)) {
            return null;
        }

        claimed.add(id);

        const childNodes = (children.get(id) ?? []).flatMap((childId) => {
            const child = toTreeNode(childId);
            return child ? [child] : [];
        });

        return { id: source.id, label: source.label, children: childNodes };
    }

    const rootId =
        nodes.find((node) => (incoming.get(node.id) ?? 0) === 0)?.id ??
        nodes[0]?.id;

    if (rootId === undefined) {
        return null;
    }

    const root = toTreeNode(rootId);
    if (!root) {
        return null;
    }

    for (const node of nodes) {
        const orphan = toTreeNode(node.id);
        if (orphan) {
            root.children.push(orphan);
        }
    }

    return root;
}

/**
 * Flattens a mind map into an indented outline — the accessible, printable, and
 * exportable alternative to the canvas.
 *
 * @param nodes - Mind map nodes
 * @param edges - Directed edges between node ids
 * @returns Rows in reading order with their nesting depth
 */
export function mindMapOutline(
    nodes: readonly MindMapNode[],
    edges: readonly MindMapEdge[],
): MindMapOutlineRow[] {
    const root = buildMindMapTree(nodes, edges);
    if (!root) {
        return [];
    }

    const rows: MindMapOutlineRow[] = [];

    function walk(node: MindMapTreeNode, depth: number) {
        rows.push({ id: node.id, label: node.label, depth });
        for (const child of node.children) {
            walk(child, depth + 1);
        }
    }

    walk(root, 0);
    return rows;
}
