import { describe, expect, test } from "vitest";
import {
  enrichBranchRecords,
  extractSchemaRecords,
  queryToSearchParams,
  schemaToBranchRecords,
  pickDefaultSortBy,
  getDefaultBase,
  recordsToSchema,
} from "@/proxy/pure.js";
import stub from "./stub.js";

describe("enrichBranchRecords", () => {
  test("enriches", () => {
    const testCase = stub.cases.trunk;

    expect(
      enrichBranchRecords(testCase.schemaRecord, testCase.metaRecords),
    ).toStrictEqual(testCase.branchRecords);
  });
});

describe("extractSchemaRecords", () => {
  test("extracts", () => {
    const testCase = stub.cases.trunk;

    expect(extractSchemaRecords(testCase.branchRecords)).toStrictEqual([
      testCase.schemaRecord,
      ...testCase.metaRecords,
    ]);
  });
});

describe("schemaToBranchRecords", () => {
  test("converts", () => {
    const testCase = stub.cases.description;

    expect(schemaToBranchRecords(testCase.schema)).toStrictEqual([
      testCase.schemaRecord,
      ...testCase.metaRecords,
    ]);
  });
});

describe("getDefaultBase", () => {
  test("", () => {
    expect(getDefaultBase(stub.schema)).toBe("a");
  });
});

describe("pickDefaultSortBy", () => {
  test("", () => {
    expect(pickDefaultSortBy(stub.schema, "b")).toBe("b");
  });
});

describe("recordsToSchema", () => {
  test("converts", () => {
    const testCase = stub.cases.description;

    expect(
      recordsToSchema(testCase.schemaRecord, testCase.metaRecords),
    ).toStrictEqual(testCase.schema);
  });
});

describe("queryToSearchParams", () => {
  test("throws when no base", () => {
    expect(() => queryToSearchParams(stub.queryObject)).toThrowError();
  });

  test("query base value", () => {
    const testCase = stub.cases.baseValue;

    expect(queryToSearchParams(testCase.queryObject).toString()).toStrictEqual(
      testCase.queryString,
    );
  });

  test("query leaf value", () => {
    const testCase = stub.cases.leafValue;

    expect(queryToSearchParams(testCase.queryObject).toString()).toStrictEqual(
      testCase.queryString,
    );
  });

  test("query nested value", () => {
    const testCase = stub.cases.nestedValue;

    expect(queryToSearchParams(testCase.queryObject).toString()).toStrictEqual(
      testCase.queryString,
    );
  });

  test("query twig out of order", () => {
    const testCase = stub.cases.twigOutOfOrder;

    expect(
      queryToSearchParams(testCase.queryObject).toString(),
    ).not.toStrictEqual(testCase.queryString);
  });
});
