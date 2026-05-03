import { describe, expect, test, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  saveMindRecord,
  loadMindRecord,
  updateMind,
  updateEntry,
  deleteRecord,
  createCatalog,
  readSchema,
} from "@/proxy/record.js";
import {
  readRemoteTags,
  readLocalTags,
  writeRemoteTags,
  writeLocalTags,
} from "@/proxy/tags.js";
import { clone } from "@/proxy/open.js";
import { schemaToBranchRecords } from "@/proxy/pure.js";
import git from "@/git.js";
import io from "@/io.js";
import db from "@/db.js";
import schemaRoot from "@/proxy/default_root_schema.json";
import stub from "./stub.js";

vi.mock("@/git.js", async (importOriginal) => {
  return {
    default: {
      clone: vi.fn(),
      getOrigin: vi.fn(),
      resolve: vi.fn(),
      gitinit: vi.fn(),
      commit: vi.fn(),
    },
  };
});

vi.mock("@/io.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    default: {
      ...mod,
      rename: vi.fn(),
    },
  };
});

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

vi.mock("@/proxy/open.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    clone: vi.fn(),
  };
});

vi.mock("@/proxy/pure.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    schemaToBranchRecords: vi.fn(),
  };
});

vi.mock("@/proxy/tags.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    readRemoteTags: vi.fn(),
    readLocalTags: vi.fn(),
    writeRemoteTags: vi.fn(),
    writeLocalTags: vi.fn(),
  };
});

vi.mock("uuid", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    v4: vi.fn(() => "1"),
  };
});

describe("deleteRecord", () => {
  test("", async () => {
    await deleteRecord(stub.fs, "mind", {});

    expect(db.deleteRecord).toHaveBeenCalledWith(stub.fs, "mind", {});

    expect(git.commit).toHaveBeenCalledWith(stub.fs, "mind");
  });
});

describe("updateMind", () => {
  test("", async () => {
    await updateMind(stub.fs, {});

    expect(db.updateRecord).toHaveBeenCalledWith(stub.fs, "root", {});

    expect(git.commit).toHaveBeenCalledWith(stub.fs, "root");
  });
});

describe("updateEntry", () => {
  test("", async () => {
    await updateEntry(stub.fs, "mind", {});

    expect(db.updateRecord).toHaveBeenCalledWith(stub.fs, "mind", {});

    expect(git.commit).toHaveBeenCalledWith(stub.fs, "mind");
  });
});

describe("createCatalog", () => {
  test("", async () => {
    const testCase = stub.cases.trunk;

    schemaToBranchRecords.mockImplementation(() => testCase.branchRecords);

    await createCatalog(stub.fs);

    expect(git.gitinit).toHaveBeenCalledWith(stub.fs, "root");

    for (const branchRecord of testCase.branchRecords) {
      expect(db.updateRecord).toHaveBeenCalledWith(
        stub.fs,
        "root",
        branchRecord,
      );
    }

    expect(git.commit).toHaveBeenCalledWith(stub.fs, "root");
  });
});

describe.only("saveMindRecord", () => {
  test("clones", async () => {
    db.select.mockImplementation(() => []);

    clone.mockImplementation(() => ({ _: "mind", mind: "remoteId" }));

    const testCase = stub.cases.tags;

    await saveMindRecord(stub.fs, testCase.record);

    expect(clone).toHaveBeenCalled();
  });

  test("renames", async () => {
    db.select.mockImplementation(() => [{ _: "mind", mind: "id" }]);

    git.clone.mockImplementation(() => ({ _: "mind", mind: "remoteId" }));

    const testCase = stub.cases.tags;

    await saveMindRecord(stub.fs, testCase.record);

    expect(io.rename).toHaveBeenCalledWith(stub.fs, stub.id, stub.name);

    //expect(lfs.createLFS).toHaveBeenCalledWith(stub.fs, stub.id);

    expect(db.updateRecord).toHaveBeenCalledWith(
      stub.fs,
      stub.id,
      testCase.schemaRecord,
    );

    for (const metaRecord of testCase.metaRecords) {
      expect(db.updateRecord).toHaveBeenCalledWith(
        stub.fs,
        stub.id,
        metaRecord,
      );
    }

    expect(writeRemoteTags).toHaveBeenCalledWith(stub.fs, stub.id, [
      testCase.originUrl,
    ]);

    //expect(writeLocalTags).toHaveBeenCalledWith(stub.fs, stub.id, [testCase.localTag]);

    expect(git.commit).toHaveBeenCalledWith(stub.fs, stub.id);
  });

  test("inits", async () => {
    db.select.mockImplementation(() => []);

    clone.mockImplementation(() => ({ _: "mind", mind: "remoteId" }));

    const testCase = stub.cases.tags;

    const { origin_url, ...nourl } = testCase.record;

    await saveMindRecord(stub.fs, nourl);

    expect(git.gitinit).toHaveBeenCalledWith(stub.fs, stub.id, stub.name);

    //expect(lfs.createLFS).toHaveBeenCalledWith(stub.fs, stub.id);

    expect(db.updateRecord).toHaveBeenCalledWith(
      stub.fs,
      stub.id,
      testCase.schemaRecord,
    );

    for (const metaRecord of testCase.metaRecords) {
      expect(db.updateRecord).toHaveBeenCalledWith(
        stub.fs,
        stub.id,
        metaRecord,
      );
    }

    expect(writeRemoteTags).toHaveBeenCalledWith(stub.fs, stub.id, undefined);

    //expect(writeLocalTags).toHaveBeenCalledWith(stub.fs, stub.id, [testCase.localTag]);

    expect(git.commit).toHaveBeenCalledWith(stub.fs, stub.id);
  });
});

describe("loadMindRecord", () => {
  test("", async () => {
    const testCase = stub.cases.tags;

    db.select
      .mockImplementationOnce(() => [testCase.schemaRecord])
      .mockImplementationOnce(() => testCase.branchRecords);

    readRemoteTags.mockImplementation(() => [testCase.originUrl]);

    readLocalTags.mockImplementation(() => [testCase.localTag]);

    const record = await loadMindRecord(stub.fs, testCase.record);

    expect(record).toStrictEqual(testCase.record);
  });
});

describe("readSchema", () => {
  test("root", async () => {
    db.select.mockImplementation(() => []);

    const schema = await readSchema(stub.fs, "root");

    expect(schema).toStrictEqual(schemaRoot);
  });

  test("id", async () => {
    const testCase = stub.cases.trunk;

    db.select
      .mockImplementationOnce(() => [testCase.schemaRecord])
      .mockImplementationOnce(() => testCase.branchRecords);

    const schema = await readSchema(stub.fs, stub.id);

    expect(db.select).toHaveBeenCalledWith(stub.fs, stub.id, { _: "_" });

    expect(db.select).toHaveBeenCalledWith(stub.fs, stub.id, { _: "branch" });

    expect(schema).toStrictEqual(testCase.schema);
  });
});
