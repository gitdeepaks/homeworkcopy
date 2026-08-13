import { ProviderTimeoutError } from "../types/app-error.js";

export async function withTimeout<T>(
    operation: string,
    timeoutMs: number,
    task: Promise<T>,
): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
            () => { reject(new ProviderTimeoutError(operation)); },
            timeoutMs,
        );
    });

    try {
        return await Promise.race([task, deadline]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
