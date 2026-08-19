import { describe, expect, test } from "bun:test";
import {
  NotFoundError,
  ProviderTimeoutError,
  UnauthorizedError,
} from "./app-error.js";

describe("stable application errors", () => {
  test("exposes stable codes and statuses", () => {
    expect(new UnauthorizedError()).toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
    expect(new NotFoundError()).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
    expect(new ProviderTimeoutError("Provider")).toMatchObject({
      statusCode: 504,
      code: "PROVIDER_TIMEOUT",
    });
  });
});
