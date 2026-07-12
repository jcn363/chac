import { describe, it, expect } from "bun:test";
import { wrap, safeInt } from "../../../src/modules/router/utils";
import { AppError, NotFoundError } from "../../../src/errors";

describe("safeInt", () => {
  it("returns fallback for undefined", () => {
    expect(safeInt(undefined, 10)).toBe(10);
  });

  it("parses valid integer", () => {
    expect(safeInt("42", 10)).toBe(42);
  });

  it("returns fallback for non-numeric string", () => {
    expect(safeInt("abc", 10)).toBe(10);
  });

  it("returns fallback for 0", () => {
    expect(safeInt("0", 10)).toBe(10);
  });

  it("returns fallback for negative", () => {
    expect(safeInt("-5", 10)).toBe(10);
  });

  it("caps at max", () => {
    expect(safeInt("200", 10, 100)).toBe(100);
  });

  it("allows value within max", () => {
    expect(safeInt("50", 10, 100)).toBe(50);
  });
});

describe("wrap", () => {
  it("passes through successful responses", async () => {
    const handler = wrap(async (c) => new Response("ok"));
    const result = await handler({} as any);
    expect(await result.text()).toBe("ok");
  });

  it("passes through AppError unchanged", async () => {
    const handler = wrap(async () => {
      throw new NotFoundError("document", "123");
    });
    try {
      await handler({} as any);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).statusCode).toBe(404);
    }
  });

  it("wraps non-AppError as 500", async () => {
    const handler = wrap(async () => {
      throw new Error("something broke");
    });
    try {
      await handler({} as any);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(500);
      expect((err as AppError).message).toBe("something broke");
    }
  });

  it("wraps non-Error values as 500", async () => {
    const handler = wrap(async () => {
      throw "string error";
    });
    try {
      await handler({} as any);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(500);
      expect((err as AppError).message).toBe("Unknown error");
    }
  });
});
