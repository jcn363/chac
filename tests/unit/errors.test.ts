import { describe, it, expect } from "bun:test";
import {
  AppError,
  NotFoundError,
  ValidationError,
  SecurityError,
  ExternalServiceError,
} from "../../src/errors";

describe("errors", () => {
  describe("AppError", () => {
    it("has correct default statusCode (500)", () => {
      const err = new AppError("Something broke", "INTERNAL_ERROR");
      expect(err.statusCode).toBe(500);
    });

    it("accepts a custom statusCode", () => {
      const err = new AppError("Custom", "CUSTOM_CODE", 418);
      expect(err.statusCode).toBe(418);
    });

    it("preserves the message", () => {
      const err = new AppError("test message", "CODE");
      expect(err.message).toBe("test message");
    });

    it("sets name to AppError", () => {
      const err = new AppError("msg", "CODE");
      expect(err.name).toBe("AppError");
    });

    it("is an instance of AppError and Error", () => {
      const err = new AppError("msg", "CODE");
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it("stores details when provided", () => {
      const err = new AppError("msg", "CODE", 500, { field: "name" });
      expect(err.details).toEqual({ field: "name" });
    });
  });

  describe("NotFoundError", () => {
    it("extends AppError with statusCode 404", () => {
      const err = new NotFoundError("Document", "abc123");
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(404);
    });

    it("has code NOT_FOUND", () => {
      const err = new NotFoundError("Document", "abc123");
      expect(err.code).toBe("NOT_FOUND");
    });

    it("formats message as 'Resource not found: id'", () => {
      const err = new NotFoundError("Document", "abc123");
      expect(err.message).toBe("Document not found: abc123");
    });

    it("inherits name from AppError", () => {
      const err = new NotFoundError("Item", "1");
      expect(err.name).toBe("AppError");
    });
  });

  describe("ValidationError", () => {
    it("extends AppError with statusCode 400", () => {
      const err = new ValidationError("Bad input");
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    });

    it("has code VALIDATION_ERROR", () => {
      const err = new ValidationError("Bad input");
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("preserves the message", () => {
      const err = new ValidationError("field is required");
      expect(err.message).toBe("field is required");
    });

    it("stores details when provided", () => {
      const err = new ValidationError("Bad input", { field: "email" });
      expect(err.details).toEqual({ field: "email" });
    });
  });

  describe("SecurityError", () => {
    it("extends AppError with statusCode 403", () => {
      const err = new SecurityError("Denied");
      expect(err).toBeInstanceOf(SecurityError);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    it("has code SECURITY_ERROR", () => {
      const err = new SecurityError("Denied");
      expect(err.code).toBe("SECURITY_ERROR");
    });

    it("preserves the message", () => {
      const err = new SecurityError("access denied");
      expect(err.message).toBe("access denied");
    });
  });

  describe("ExternalServiceError", () => {
    it("extends AppError with statusCode 502", () => {
      const err = new ExternalServiceError("OpenAI", "timeout");
      expect(err).toBeInstanceOf(ExternalServiceError);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(502);
    });

    it("has code EXTERNAL_SERVICE_ERROR", () => {
      const err = new ExternalServiceError("OpenAI", "timeout");
      expect(err.code).toBe("EXTERNAL_SERVICE_ERROR");
    });

    it("formats message as 'service: message'", () => {
      const err = new ExternalServiceError("OpenAI", "rate limited");
      expect(err.message).toBe("OpenAI: rate limited");
    });
  });
});
