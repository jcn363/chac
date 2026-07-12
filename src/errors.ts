/** Base application error with HTTP status code and error code. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Resource not found (404). */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
  }
}

/** Validation failed (400). */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/** Security/permission error (403). */
export class SecurityError extends AppError {
  constructor(message: string) {
    super(message, "SECURITY_ERROR", 403);
  }
}

/** External service failure (502). */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, "EXTERNAL_SERVICE_ERROR", 502);
  }
}
