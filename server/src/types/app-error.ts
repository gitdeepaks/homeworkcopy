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
