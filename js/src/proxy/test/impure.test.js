import { describe, expect, test, vi } from "vitest";
import { updateRecord } from "@/proxy/impure.js";
import { newUUID } from "@/proxy/record.js";
import {
  saveMindRecord,
  loadMindRecord,
  updateMind,
  updateEntry,
  resolve,
} from "@/proxy/record.js";
import db from "@/db.js";
import stub from "./stub.js";

vi.mock("@/db.js", async (importOriginal) => {
  return {
    default: {
      select: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      csvsinit: vi.fn(),
    },
  };
});

vi.mock("@/proxy/pure.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    extractSchemaRecords: vi.fn(),
    enrichBranchRecords: vi.fn(),
    schemaToBranchRecords: vi.fn(),
  };
});

vi.mock("@/proxy/open.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    find: vi.fn(),
    clone: vi.fn(),
  };
});

vi.mock("@/proxy/record.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    newUUID: vi.fn(),
    resolve: vi.fn(),
    saveMindRecord: vi.fn(),
    loadMindRecord: vi.fn(),
    createCatalog: vi.fn(),
    updateMind: vi.fn(),
    updateEntry: vi.fn(),
    deleteRecord: vi.fn(),
  };
});

describe("updateRecord", () => {
  test("root", async () => {
    updateEntry.mockReset();

    saveMindRecord.mockReset();

    const record = { _: "mind" };

    await updateRecord(stub.fs, "root", record);

    expect(saveMindRecord).toHaveBeenCalledWith(stub.fs, record);
  });

  test("id", async () => {
    updateEntry.mockReset();

    saveMindRecord.mockReset();

    await updateRecord(stub.fs, stub.id, {});

    expect(updateEntry).toHaveBeenCalledWith(stub.fs, stub.id, {});

    expect(saveMindRecord).not.toHaveBeenCalled();
  });
});
