import { apiErrorResponseSchema } from "@homeworkcopy/contracts";

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

export function setApiTokenGetter(getter: TokenGetter | null): void {
    tokenGetter = getter;
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function fetchWithAuth(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1] = {},
): ReturnType<typeof fetch> {
    const headers = new Headers(init.headers);
    const token = await tokenGetter?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(input, { ...init, credentials: "include", headers });
}

export const authenticatedFetch: typeof fetch = Object.assign(fetchWithAuth, {
    preconnect: fetch.preconnect,
});

export async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = new Headers(options.headers);

    if (
        options.body &&
        !headers.has("Content-Type") &&
        !(options.body instanceof FormData)
    ) {
        headers.set("Content-Type", "application/json");
    }

    const response = await authenticatedFetch(path, {
        ...options,
        credentials: "include",
        headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const parsed = apiErrorResponseSchema.safeParse(data);
        throw new ApiError(response.status, parsed.success ? parsed.data.error.message : "Request failed", parsed.success ? parsed.data.error.details : undefined);
    }

    return data;
}

export async function apiFetchVoid(
    path: string,
    options: RequestInit = {},
): Promise<void> {
    const response = await authenticatedFetch(path, options);
    if (response.ok) return;

    const data: unknown = await response.json().catch(() => null);
    const parsed = apiErrorResponseSchema.safeParse(data);
    throw new ApiError(response.status, parsed.success ? parsed.data.error.message : "Request failed", parsed.success ? parsed.data.error.details : undefined);
}
