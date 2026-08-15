import {
    OUTPUT_TYPE_GROUP,
    readOutputMetadata,
    type OutputGroup,
} from "@homeworkcopy/contracts";
import { OUTPUT_GROUP_ORDER } from "./constants";
import type { StudioOutput } from "./types";

export type OutputShelf = {
    group: OutputGroup;
    outputs: StudioOutput[];
};

/** The shelf an output belongs on. Answers saved from chat get their own. */
export function shelfForOutput(output: StudioOutput): OutputGroup {
    const metadata = readOutputMetadata(output.metadata);
    return metadata?.savedFrom ? "saved" : OUTPUT_TYPE_GROUP[output.type];
}

/**
 * Splits outputs into Studio shelves, preserving the order they arrived in.
 *
 * @param outputs - Outputs for one notebook
 * @returns Non-empty shelves in display order
 */
export function groupOutputs(outputs: readonly StudioOutput[]): OutputShelf[] {
    const byGroup = new Map<OutputGroup, StudioOutput[]>();

    for (const output of outputs) {
        const group = shelfForOutput(output);
        const existing = byGroup.get(group);
        if (existing) {
            existing.push(output);
        } else {
            byGroup.set(group, [output]);
        }
    }

    return OUTPUT_GROUP_ORDER.flatMap((group) => {
        const groupOutputs = byGroup.get(group);
        return groupOutputs ? [{ group, outputs: groupOutputs }] : [];
    });
}
