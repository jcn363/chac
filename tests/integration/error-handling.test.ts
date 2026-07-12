import { describe, it, expect } from "bun:test";
import { AppError, NotFoundError, ValidationError, SecurityError, ExternalServiceError } from "../../src/errors";

describe("Error Handling", () => {
  it("AppError has correct properties", () => {
    const err = new AppError("test message", "TEST_CODE", 418, { detail: "info" });
    expect(err.message).toBe("test message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(418);
    expect(err.details).toEqual({ detail: "info" });
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("NotFoundError returns 404", () => {
    const err = new NotFoundError("Document", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("Document");
    expect(err.message).toContain("abc-123");
  });

  it("ValidationError returns 400", () => {
    const err = new ValidationError("Invalid input", { field: "name" });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "name" });
  });

  it("SecurityError returns 403", () => {
    const err = new SecurityError("Access denied");
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("SECURITY_ERROR");
  });

  it("ExternalServiceError returns 502", () => {
    const err = new ExternalServiceError("LLM", "timeout");
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(err.message).toContain("LLM");
    expect(err.message).toContain("timeout");
  });

  it("AppError default statusCode is 500", () => {
    const err = new AppError("something", "CODE");
    expect(err.statusCode).toBe(500);
  });

  it("errors are instanceof checks", () => {
    expect(new NotFoundError("x", "y") instanceof AppError).toBe(true);
    expect(new ValidationError("x") instanceof AppError).toBe(true);
    expect(new SecurityError("x") instanceof AppError).toBe(true);
    expect(new ExternalServiceError("s", "m") instanceof AppError).toBe(true);
    expect(new AppError("x", "c") instanceof Error).toBe(true);
  });
});
