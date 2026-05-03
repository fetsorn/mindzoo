import { describe, expect, test, vi } from "vitest";
import {
  readRemoteTags,
  readLocalTags,
  writeRemoteTags,
  writeLocalTags,
} from "@/proxy/tags.js";
import git from "@/git.js";
import lfs from "@/lfs.js";
import stub from "./stub.js";

vi.mock("@/git.js", async (importOriginal) => {
  // don't import original as it hangs on isogit initialization
  return {
    default: {
      getOrigin: vi.fn(),
      setOrigin: vi.fn(),
    },
  };
});

vi.mock("@/lfs.js", async (importOriginal) => {
  return {
    default: {
      getAssetPath: vi.fn(),
      setAssetPath: vi.fn(),
    },
  };
});

describe("readRemoteTags", () => {
  test("", async () => {
    const testCase = stub.cases.tags;

    git.getOrigin.mockImplementation(() => ({
      url: testCase.url,
      token: testCase.token,
    }));

    const remoteTags = await readRemoteTags(stub.fs, stub.id);

    expect(git.getOrigin).toHaveBeenCalledWith(stub.fs, stub.id);

    expect(remoteTags).toStrictEqual([testCase.originUrl]);
  });
});

describe("readLocalTags", () => {
  test("", async () => {
    const testCase = stub.cases.tags;

    lfs.getAssetPath.mockImplementation(() => testCase.assetPath);

    const localTags = await readLocalTags(stub.fs, stub.id);

    expect(lfs.getAssetPath).toHaveBeenCalledWith(stub.fs, stub.id);

    expect(localTags).toStrictEqual([testCase.localTag]);
  });
});

describe("writeRemoteTags", () => {
  test("", async () => {
    const testCase = stub.cases.tags;

    await writeRemoteTags(stub.fs, stub.id, [testCase.originUrl]);

    expect(git.setOrigin).toHaveBeenCalledWith(stub.fs, stub.id, {
      url: testCase.url,
      token: testCase.token,
    });
  });
});

describe("writeLocalTags", () => {
  test("", async () => {
    const testCase = stub.cases.tags;

    await writeLocalTags(stub.fs, stub.id, [testCase.localTag]);

    expect(lfs.setAssetPath).toHaveBeenCalledWith(
      stub.fs,
      stub.id,
      testCase.assetPath,
    );
  });
});
