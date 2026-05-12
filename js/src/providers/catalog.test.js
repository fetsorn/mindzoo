import { describe, test, expect, beforeEach } from "vitest";
import nodefs from "fs";
import os from "os";
import path from "path";
import csvs from "@fetsorn/csvs-js";
import { mindToRecords, recordsToMind } from "@/providers/pure.js";

const defaultBranches = [
  {
    _: "branch",
    branch: "event",
    "@en": "Record",
    "@ru": "Запись",
  },
  {
    _: "branch",
    branch: "actdate",
    trunk: "event",
    task: "date",
    "@en": "Date of the event",
    "@ru": "Дата события",
  },
  {
    _: "branch",
    branch: "category",
    trunk: "event",
    "@en": "Category",
    "@ru": "Категория",
  },
  {
    _: "branch",
    branch: "branch",
    "@en": "Branch name",
    "@ru": "Название ветки",
  },
  {
    _: "branch",
    branch: "trunk",
    trunk: "branch",
    "@en": "Branch trunk",
    "@ru": "Ствол ветки",
  },
  {
    _: "branch",
    branch: "task",
    trunk: "branch",
    "@en": "Branch task",
    "@ru": "Предназначение ветки",
  },
];

let dir;

beforeEach(() => {
  dir = nodefs.mkdtempSync(path.join(os.tmpdir(), "mindzoo-test-"));
});

describe("prose roundtrip through mindToRecords and updateRecord", () => {
  test("updateRecord writes prose blobs for branch metaRecords", async () => {
    const [schemaRecord, ...metaRecords] = mindToRecords(defaultBranches);

    // write schema first
    await csvs.init({ fs: nodefs, dir });
    await csvs.updateRecord({ fs: nodefs, dir, query: schemaRecord });

    // write each metaRecord
    for (const meta of metaRecords) {
      await csvs.updateRecord({ fs: nodefs, dir, query: meta });
    }

    // check prose was written
    const csvsdir = path.join(dir, "csvs");
    const proseDir = path.join(csvsdir, "prose");

    expect(nodefs.existsSync(proseDir)).toBe(true);

    const proseFiles = nodefs.readdirSync(proseDir);

    expect(proseFiles).toContain("event.en");
    expect(proseFiles).toContain("event.ru");
    expect(proseFiles).toContain("actdate.en");
    expect(proseFiles).toContain("actdate.ru");
    expect(proseFiles).toContain("category.en");
    expect(proseFiles).toContain("branch.en");
    expect(proseFiles).toContain("trunk.en");
    expect(proseFiles).toContain("task.en");
  });

  test("buildRecord with prose returns @en/@ru on all branches", async () => {
    const [schemaRecord, ...metaRecords] = mindToRecords(defaultBranches);

    await csvs.init({ fs: nodefs, dir });
    await csvs.updateRecord({ fs: nodefs, dir, query: schemaRecord });

    for (const meta of metaRecords) {
      await csvs.updateRecord({ fs: nodefs, dir, query: meta });
    }

    // now read back a branch with buildRecord + prose
    const entry = await csvs.buildRecord({
      fs: nodefs,
      dir,
      query: [{ _: "branch", branch: "event" }],
      prose: true,
    });

    expect(entry["@en"]).toBe("Record");
    expect(entry["@ru"]).toBe("Запись");
  });

  test("schema-based DESCRIBE then recordsToMind preserves @en/@ru", async () => {
    const [schemaRecord, ...metaRecords] = mindToRecords(defaultBranches);

    await csvs.init({ fs: nodefs, dir });
    await csvs.updateRecord({ fs: nodefs, dir, query: schemaRecord });

    for (const meta of metaRecords) {
      await csvs.updateRecord({ fs: nodefs, dir, query: meta });
    }

    // simulate what describeMind now does:
    // 1. SELECT schema
    const schemaRecords = await csvs.selectRecord({
      fs: nodefs,
      dir,
      query: [{ _: "_" }],
    });

    const schema = schemaRecords[0];

    // 2. extract all branch names from schema (trunks and leaves)
    const schemaRelations = Object.entries(schema).filter(
      ([key]) => key !== "_",
    );

    const branchNames = [...new Set(schemaRelations.flat(Infinity))];

    // 3. buildRecord each branch with prose
    const branchRecords = await Promise.all(
      branchNames.map((branchName) =>
        csvs.buildRecord({
          fs: nodefs,
          dir,
          query: [{ _: "branch", branch: branchName }],
          prose: true,
        }),
      ),
    );

    const mind = recordsToMind(
      "abc123",
      "test",
      schema,
      branchRecords,
      undefined,
      undefined,
    );

    const eventBranch = mind.branch.find((b) => b.branch === "event");

    expect(eventBranch["@en"]).toBe("Record");
    expect(eventBranch["@ru"]).toBe("Запись");

    const actdateBranch = mind.branch.find((b) => b.branch === "actdate");

    expect(actdateBranch["@en"]).toBe("Date of the event");

    const branchBranch = mind.branch.find((b) => b.branch === "branch");

    expect(branchBranch["@en"]).toBe("Branch name");
  });

  test("updateRecord with nested @en/@ru writes prose for nested entries", async () => {
    // simulate what rebuild does: write a mind record with nested branches
    const catalogSchema = {
      _: "_",
      mind: ["name", "branch"],
      branch: ["trunk", "task", "cognate"],
    };

    await csvs.init({ fs: nodefs, dir });
    await csvs.updateRecord({ fs: nodefs, dir, query: catalogSchema });

    const mindRecord = {
      _: "mind",
      mind: "abc123",
      name: "test",
      branch: [
        { _: "branch", branch: "event", "@en": "Record", "@ru": "Запись" },
        {
          _: "branch",
          branch: "actdate",
          trunk: "event",
          task: "date",
          "@en": "Date of the event",
          "@ru": "Дата события",
        },
      ],
    };

    await csvs.updateRecord({ fs: nodefs, dir, query: mindRecord });

    // check nested prose was written
    const csvsdir = path.join(dir, "csvs");
    console.log("csvs dir:", nodefs.readdirSync(csvsdir));
    const proseDir = path.join(csvsdir, "prose");
    const proseFiles = nodefs.existsSync(proseDir)
      ? nodefs.readdirSync(proseDir)
      : [];

    expect(proseFiles).toContain("event.en");
    expect(proseFiles).toContain("event.ru");
    expect(proseFiles).toContain("actdate.en");
    expect(proseFiles).toContain("actdate.ru");

    // read back with buildRecord and check prose
    const entry = await csvs.buildRecord({
      fs: nodefs,
      dir,
      query: [{ _: "mind", mind: "abc123" }],
      prose: true,
    });

    const eventBranch = entry.branch.find(
      (b) => (typeof b === "object" ? b.branch : b) === "event",
    );

    expect(typeof eventBranch).toBe("object");
    expect(eventBranch["@en"]).toBe("Record");
    expect(eventBranch["@ru"]).toBe("Запись");
  });
});
