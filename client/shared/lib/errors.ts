import { ApiError } from "./api";

/**
 * Reader-facing copy for a failed request.
 *
 * Everything thrown by the API client is an `ApiError` carrying a message the
 * server wrote for a reader. Anything else reaching here is a transport or
 * programmer fault whose message is addressed to whoever is debugging, so it is
 * replaced rather than printed at someone mid-essay.
 *
 * @param error - The `error` a query or mutation is holding.
 * @param fallback - Copy for a failure with nothing readable to say.
 */
export function errorMessage(
    error: Error | null,
    fallback = "Something went wrong. Please try again.",
): string {
    if (error instanceof ApiError) return error.message;
    return fallback;
}

/** Whether a failure is the server saying the thing is not there. */
export function isNotFound(error: Error | null): boolean {
    return error instanceof ApiError && error.status === 404;
}

/** Whether a failure is the server refusing on permission grounds. */
export function isForbidden(error: Error | null): boolean {
    return error instanceof ApiError && error.status === 403;
}
