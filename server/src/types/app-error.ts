import type {
    OutputFailureCode,
    OutputFailureStage,
} from "@homeworkcopy/contracts";

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "AppError";
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(404, "NOT_FOUND", message);
        this.name = "NotFoundError";
    }
}

export class ValidationError extends AppError {
    constructor(message = "Validation failed", details?: unknown) {
        super(400, "VALIDATION_FAILED", message, details);
        this.name = "ValidationError";
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(401, "UNAUTHORIZED", message);
        this.name = "UnauthorizedError";
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflict") {
        super(409, "CONFLICT", message);
        this.name = "ConflictError";
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(403, "FORBIDDEN", message);
        this.name = "ForbiddenError";
    }
}

export class ProviderTimeoutError extends AppError {
    constructor(operation: string) {
        super(504, "PROVIDER_TIMEOUT", `${operation} timed out`);
        this.name = "ProviderTimeoutError";
    }
}

export class SourceSelectionError extends AppError {
    constructor(
        code: "NO_READY_SOURCES" | "SOURCE_SELECTION_UNAVAILABLE",
        message: string,
    ) {
        super(code === "NO_READY_SOURCES" ? 400 : 409, code, message);
        this.name = "SourceSelectionError";
    }
}

/**
 * Failure raised anywhere in the Studio output pipeline. The stage/code pair is
 * persisted on the output so the client can explain and retry accurately.
 */
export class OutputGenerationError extends AppError {
    constructor(
        public readonly stage: OutputFailureStage,
        public readonly failureCode: OutputFailureCode,
        message: string,
    ) {
        super(OUTPUT_FAILURE_STATUS[failureCode], failureCode, message);
        this.name = "OutputGenerationError";
    }

    /** Whether retrying the same request could plausibly succeed. */
    get isRetriable(): boolean {
        return this.failureCode === "GENERATION_FAILED";
    }
}

const OUTPUT_FAILURE_STATUS: Record<OutputFailureCode, number> = {
    SOURCES_UNAVAILABLE: 409,
    NO_SOURCE_CONTENT: 400,
    UNSUPPORTED_OUTPUT_TYPE: 400,
    GENERATION_FAILED: 502,
    INVALID_MODEL_OUTPUT: 502,
};

export class WebSearchUnavailableError extends AppError {
    constructor() {
        super(
            503,
            "WEB_SEARCH_UNAVAILABLE",
            "Web grounding is temporarily unavailable. Choose notebook-only mode or try again later.",
        );
        this.name = "WebSearchUnavailableError";
    }
}

export class ChatQuotaExceededError extends AppError {
    constructor(resetAt: string) {
        super(
            429,
            "CHAT_QUOTA_EXCEEDED",
            "Your daily chat allowance has been reached. Try again after the quota resets.",
            { resetAt },
        );
        this.name = "ChatQuotaExceededError";
    }
}
