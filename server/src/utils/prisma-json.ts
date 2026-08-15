import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * JSON that Postgres accepts as a column value. `null` is excluded because
 * Prisma models a JSON null with `Prisma.JsonNull` rather than a bare `null`.
 */
const prismaJsonSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.json()),
    z.record(z.string(), z.json()),
]);

/**
 * Converts an already validated value into a Prisma JSON column input.
 *
 * Properties set to `undefined` are dropped, so callers can build metadata with
 * conditional fields without writing invalid JSON.
 *
 * @param value - Value produced by a contract schema
 * @returns The same value, typed for a Prisma JSON column
 * @throws {z.ZodError} When the value is not JSON-serializable
 */
export function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
    return prismaJsonSchema.parse(JSON.parse(JSON.stringify(value)));
}
