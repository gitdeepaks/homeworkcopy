import {
    SHARE_REJECTION_MESSAGES,
    type OutputFailureCode,
    type OutputFailureStage,
    type ShareRejectionReason,
    type SourceFailureCode,
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
        return RETRIABLE_OUTPUT_FAILURES.has(this.failureCode);
    }
}

const OUTPUT_FAILURE_STATUS: Record<OutputFailureCode, number> = {
    SOURCES_UNAVAILABLE: 409,
    NO_SOURCE_CONTENT: 400,
    UNSUPPORTED_OUTPUT_TYPE: 400,
    GENERATION_FAILED: 502,
    INVALID_MODEL_OUTPUT: 502,
    AUDIO_UNAVAILABLE: 503,
    SCRIPT_NOT_GROUNDED: 502,
    SYNTHESIS_FAILED: 502,
    AUDIO_ASSEMBLY_FAILED: 502,
    AUDIO_STORAGE_FAILED: 502,
    VIDEO_UNAVAILABLE: 503,
    STORYBOARD_NOT_GROUNDED: 502,
};

/**
 * Failures caused by a transient provider or network condition. Deterministic
 * failures stay failed so a retry cannot burn provider budget on the same
 * outcome.
 */
const RETRIABLE_OUTPUT_FAILURES: ReadonlySet<OutputFailureCode> = new Set([
    "GENERATION_FAILED",
    "SYNTHESIS_FAILED",
    "AUDIO_ASSEMBLY_FAILED",
    "AUDIO_STORAGE_FAILED",
]);

/**
 * Raised when a reader tries to hand-edit content that is not editable, either
 * because the output type has no editable shape or because it is mid-generation.
 */
export class OutputNotEditableError extends AppError {
    constructor(message: string) {
        super(409, "OUTPUT_NOT_EDITABLE", message);
        this.name = "OutputNotEditableError";
    }
}

/**
 * An invitation or share link that could not be redeemed.
 *
 * The reason doubles as the error code, so a client renders the matching copy
 * from `SHARE_REJECTION_MESSAGES` without parsing prose.
 */
export class ShareRejectedError extends AppError {
    constructor(public readonly reason: ShareRejectionReason) {
        super(
            SHARE_REJECTION_STATUS[reason],
            reason,
            SHARE_REJECTION_MESSAGES[reason],
        );
        this.name = "ShareRejectedError";
    }
}

/**
 * `410 Gone` for links that were once real, `404` for tokens that never were.
 *
 * A token is 256 bits of randomness, so distinguishing these cannot help anyone
 * guess one, and telling a genuine invitee that their link expired rather than
 * that it never existed is the difference between a fixable problem and a
 * mystery.
 */
const SHARE_REJECTION_STATUS: Record<ShareRejectionReason, number> = {
    INVALID: 404,
    EXPIRED: 410,
    REVOKED: 410,
    WRONG_ACCOUNT: 403,
    ALREADY_MEMBER: 409,
    NOTEBOOK_FULL: 409,
};

/**
 * A source that could not be extracted, carrying why.
 *
 * The code is passed straight through to `AppError.code`, because this error
 * crosses an Inngest step boundary: the object the outer handler catches is a
 * rehydrated `Error`, not this instance, so `instanceof` is false by the time
 * anyone asks. Inngest rebuilds errors from `name`, `message`, `stack`, `cause`,
 * and `code` only — any other property is dropped in transit — so `code` is the
 * one field a classification can ride on and still arrive.
 */
export class SourceExtractionError extends AppError {
    constructor(
        failureCode: SourceFailureCode,
        /** Safe to show a reader: authored here, never a provider payload. */
        message: string,
    ) {
        super(422, failureCode, message);
        this.name = "SourceExtractionError";
    }
}

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
