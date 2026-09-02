import { describe, it, expect, vi } from "vitest";
import { getJwtSecret } from "./auth";

describe("getJwtSecret", () => {
  it("falls back safely in production instead of crashing the deployment", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousJwtSecret = process.env.JWT_SECRET;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;

    try {
      expect(getJwtSecret()).toBeTruthy();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/JWT_SECRET/i));
    } finally {
      warnSpy.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;

      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
    }
  });
});
