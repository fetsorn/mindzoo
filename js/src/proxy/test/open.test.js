import { describe, expect, test, vi } from "vitest";
import { newUUID } from "@/proxy/record.js";
import { enrichBranchRecords } from "@/proxy/pure.js";
import { find, clone } from "@/proxy/open.js";
import git from "@/git.js";
import db from "@/db.js";
import schemaRoot from "@/proxy/default_root_schema.json";
import stub from "./stub.js";

vi.mock("@/git.js", async (importOriginal) => {
  return {
    default: {
      clone: vi.fn(),
    },
  };
});

vi.mock("@/db.js", async (importOriginal) => {
  return {
    default: {
      select: vi.fn(),
    },
  };
});

vi.mock("@/proxy/pure.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    enrichBranchRecords: vi.fn(),
  };
});

vi.mock("@/proxy/record.js", async (importOriginal) => {
  return {
    newUUID: vi.fn(),
  };
});

describe("find", () => {
  test("throws on error", async () => {
    db.select.mockImplementation(async () => {
      throw Error("error");
    });

    await expect(() =>
      find(stub.fs, undefined, stub.name),
    ).rejects.toThrowError();
  });

  test("finds the root", async () => {
    db.select.mockImplementation(() => [testCase.record]);

    const result = await find(stub.fs, "root", undefined);

    expect(result).toStrictEqual({
      mind: { _: "mind", mind: "root", name: "minds" },
    });
  });

  test("finds a mind", async () => {
    const testCase = stub.cases.tags;

    db.select.mockImplementation(() => [testCase.record]);

    const result = await find(stub.fs, stub.id, undefined);

    expect(db.select).toHaveBeenCalledWith(stub.fs, "root", {
      _: "mind",
      mind: stub.id,
    });

    expect(result).toStrictEqual({
      mind: testCase.record,
    });
  });
});

describe("clone", () => {
  test("clones a mind", async () => {
    const testCase = stub.cases.tags;

    db.select.mockImplementation(() => [testCase.record]);

    newUUID.mockImplementation(() => stub.id);

    enrichBranchRecords.mockImplementation(() => testCase.branchRecords);

    const result = await clone(
      stub.fs,
      undefined,
      testCase.url,
      testCase.token,
    );

    expect(git.clone).toHaveBeenCalledWith(stub.fs, testCase.hash, {
      url: testCase.url,
      token: testCase.token,
    });

    const c = {
      _: "mind",
      mind: testCase.hash,
      name: "name",
      branch: [
        {
          _: "branch",
          branch: "branch1",
          leaf: ["branch2"],
          trunk: [],
        },
        {
          _: "branch",
          branch: "branch2",
          leaf: [],
          task: "date",
          trunk: ["branch1"],
        },
      ],
      origin_url: {
        _: "origin_url",
        origin_url: "https://example.com/name",
        origin_token: "token",
      },
    };

    expect(result).toStrictEqual(c);
  });
});
