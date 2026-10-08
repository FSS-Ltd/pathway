import type { ArgumentsHost } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { Prisma } from "@pathway/db";
import { DatabaseAvailabilityFilter } from "./database-availability.filter";

describe("DatabaseAvailabilityFilter", () => {
  it("returns a retryable, correlated response without leaking Prisma details", () => {
    const adapterHost = new HttpAdapterHost();
    adapterHost.httpAdapter = new ExpressAdapter();
    const filter = new DatabaseAvailabilityFilter(adapterHost);
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { "x-request-id": "request-123" } }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const error = new Prisma.PrismaClientKnownRequestError(
      "Connection pool timeout with private database details",
      { code: "P2024", clientVersion: "5.22.0" },
    );

    filter.catch(error, host);

    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "1");
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry.",
      requestId: "request-123",
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      "private database details",
    );
  });

  it("maps a database connection failure to the same safe response", () => {
    const adapterHost = new HttpAdapterHost();
    adapterHost.httpAdapter = new ExpressAdapter();
    const filter = new DatabaseAvailabilityFilter(adapterHost);
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    filter.catch(
      new Prisma.PrismaClientInitializationError(
        "Private connection information",
        "5.22.0",
        "P1001",
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DATABASE_UNAVAILABLE" }),
    );
    expect(response.json.mock.calls[0]?.[0].requestId).toEqual(
      expect.any(String),
    );
  });
});
