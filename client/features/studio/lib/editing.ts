/**
 * Helpers for editing structured output content in place.
 *
 * Editing never touches `sourceLabels`: those record which sources a slide or
 * row was read from, and letting a reader retype them would turn attribution
 * into something they could fabricate. Wording is the reader's; provenance is
 * the generator's.
 */

/**
 * Splits a textarea's value into list items.
 *
 * @param value - Raw textarea value, one item per line
 * @returns Trimmed, non-empty items
 */
export function linesToItems(value: string): string[] {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/**
 * Renders list items for editing in a textarea.
 *
 * @param items - Items to edit
 * @returns One item per line
 */
export function itemsToLines(items: readonly string[]): string {
    return items.join("\n");
}

/**
 * Mints the next id in a prefixed, contiguous id space.
 *
 * Ids stay unique across an editing session even after rows are removed and
 * re-added, which the content schemas require.
 *
 * @param prefix - Id prefix, e.g. `sl` for slides or `r` for table rows
 * @param existing - Ids already in use
 * @returns An unused id
 */
export function nextElementId(
    prefix: string,
    existing: readonly { id: string }[],
): string {
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    const highest = existing.reduce((max, element) => {
        const matched = pattern.exec(element.id);
        const value = matched?.[1] === undefined ? 0 : Number(matched[1]);
        return Math.max(max, value);
    }, 0);

    return `${prefix}${String(highest + 1)}`;
}

/**
 * Replaces one element of a list, leaving the rest untouched.
 *
 * @param items - Current list
 * @param index - Position to replace
 * @param next - Replacement value
 * @returns A new list
 */
export function replaceAt<T>(items: readonly T[], index: number, next: T): T[] {
    return items.map((item, position) => (position === index ? next : item));
}

/**
 * Removes one element of a list.
 *
 * @param items - Current list
 * @param index - Position to remove
 * @returns A new list
 */
export function removeAt<T>(items: readonly T[], index: number): T[] {
    return items.filter((_item, position) => position !== index);
}
