import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadListedChildren } = vi.hoisted(() => ({ loadListedChildren: vi.fn() }));

vi.mock("@/lib/ucpi/read/load", () => ({ loadListedChildren }));

import { loadComputeEconomicsReadModel } from "@/lib/compute-economics/load";

describe("loadComputeEconomicsReadModel", () => {
  beforeEach(() => {
    loadListedChildren.mockReset();
  });

  it("returns an unavailable production model when no listed price exists", async () => {
    loadListedChildren.mockResolvedValue([]);
    await expect(loadComputeEconomicsReadModel({}, new Date("2026-09-18T12:00:00.000Z"))).resolves.toEqual({
      generatedAt: "2026-09-18T12:00:00.000Z",
      instruments: [],
      unavailableReason: "no_supported_price",
    });
  });

  it("returns database unavailable on a read failure and never substitutes a mock", async () => {
    loadListedChildren.mockRejectedValue(new Error("connection failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(loadComputeEconomicsReadModel({}, new Date("2026-09-18T12:00:00.000Z"))).resolves.toEqual({
      generatedAt: "2026-09-18T12:00:00.000Z",
      instruments: [],
      unavailableReason: "database_unavailable",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no production price"));
    warn.mockRestore();
  });
});
