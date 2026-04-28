import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import git from "isomorphic-git";
import { rimraf } from "../io.js";
import {
  nameMind,
  gitinit,
  commit,
  clone,
  resolve,
  setOrigin,
  getOrigin,
} from "../git.js";
import stub from "./stub.js";

vi.mock("../io.js", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    rimraf: vi.fn(),
  };
});

vi.mock("isomorphic-git", async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    init: vi.fn(mod.init),
    fetch: vi.fn(),
    merge: vi.fn(),
    clone: vi.fn(),
    statusMatrix: vi.fn(mod.statusMatrix),
    resetIndex: vi.fn(mod.resetIndex),
    remove: vi.fn(mod.remove),
    add: vi.fn(mod.add),
    commit: vi.fn(mod.commit),
    setConfig: vi.fn(mod.setConfig),
    fastForward: vi.fn(),
    push: vi.fn(),
    addRemote: vi.fn(mod.addRemote),
    getConfig: vi.fn(mod.getConfig),
    default: {
      ...mod,
      init: vi.fn(mod.init),
      clone: vi.fn(),
      statusMatrix: vi.fn(mod.statusMatrix),
      resetIndex: vi.fn(mod.resetIndex),
      remove: vi.fn(mod.remove),
      add: vi.fn(mod.add),
      commit: vi.fn(mod.commit),
      setConfig: vi.fn(mod.setConfig),
      fastForward: vi.fn(),
      push: vi.fn(),
      addRemote: vi.fn(mod.addRemote),
      getConfig: vi.fn(mod.getConfig),
    },
  };
});

describe("nameMind", () => {
  test("throws if mind is undefined", async () => {
    expect(() => nameMind(undefined, stub.name)).toThrowError();
  });

  test("concatenates a name", async () => {
    expect(nameMind(stub.mind, stub.name)).toBe(stub.dirpath);
  });

  test("returns mind when name is undefined", async () => {
    expect(nameMind("root", undefined)).toBe("/root");
  });
});

describe("gitinit", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });

    git.init.mockReset();
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("creates a directory", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    const listing = await stub.fs.promises.readdir("/");

    expect(listing).toEqual([stub.dir]);

    const gitignore = await stub.fs.promises.readFile(
      `${stub.dirpath}/.gitignore`,
      "utf8",
    );

    expect(gitignore).toBe(".DS_Store");

    expect(git.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        defaultBranch: "main",
      }),
    );
  });

  test("creates root", async () => {
    await gitinit(stub.fs, "root");

    const listing = await stub.fs.promises.readdir("/");

    expect(listing).toEqual(["root"]);

    const gitignore = await stub.fs.promises.readFile(
      `/root/.gitignore`,
      "utf8",
    );

    expect(gitignore).toBe(".DS_Store");

    expect(git.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: `/root`,
        defaultBranch: "main",
      }),
    );
  });

  test("throws when root exists", async () => {
    await gitinit(stub.fs, "root");

    await expect(gitinit(stub.fs, "root")).rejects.toThrowError();
  });

  test("renames a directory", async () => {
    await gitinit(stub.fs, stub.dir);

    const newName = "newName";

    const newDir = `${stub.mind}-${newName}`;

    await gitinit(stub.fs, stub.mind, newName);

    const listing = await stub.fs.promises.readdir("/");

    expect(listing).toEqual([newDir]);
  });
});

describe("clone", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });

    git.clone.mockReset();
    git.setConfig.mockReset();
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("removes and overwrites if dir exists", async () => {
    // create dir
    await stub.fs.promises.mkdir(stub.dirpath);

    // try to clone
    await clone(stub.fs, stub.mind, { url: stub.url, token: stub.token });
  });

  test("calls git.clone", async () => {
    await clone(stub.fs, stub.mind, { url: stub.url, token: stub.token });

    expect(git.clone).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.clonepath,
        url: stub.url,
        singleBranch: true,
        onAuth: expect.any(Function),
      }),
    );

    expect(git.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.clonepath,
        path: "remote.origin.token",
        value: stub.token,
      }),
    );
  });
});

describe("commit", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws when no mind", async () => {
    await expect(commit(stub.fs, stub.mind)).rejects.toThrowError();
  });

  test("adds", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    await commit(stub.fs, stub.mind);

    expect(git.statusMatrix).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
      }),
    );

    expect(git.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        author: {
          name: "name",
          email: "name@mail.com",
        },
        message: ".gitignore added",
      }),
    );
  });
});

describe("getOrigin", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws when no mind", async () => {
    await expect(getOrigin(stub.fs, stub.mind)).rejects.toThrowError();
  });

  test("throws when remote undefined", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    await commit(stub.fs, stub.mind);

    await expect(getOrigin(stub.fs, stub.mind)).rejects.toThrowError();
  });

  test("calls git", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    await commit(stub.fs, stub.mind);

    await setOrigin(stub.fs, stub.mind, { url: stub.url, token: stub.token });

    const { url: remoteUrl, token: remoteToken } = await getOrigin(
      stub.fs,
      stub.mind,
    );

    expect(git.getConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        path: `remote.origin.url`,
      }),
    );

    expect(git.getConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        path: `remote.origin.token`,
      }),
    );

    expect(remoteUrl).toBe(stub.url);

    expect(remoteToken).toBe(stub.token);
  });
});

describe("setOrigin", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws when no mind", async () => {
    await expect(
      setOrigin(stub.fs, stub.mind, { url: stub.url, token: stub.token }),
    ).rejects.toThrowError();
  });

  test("calls git", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    await commit(stub.fs, stub.mind);

    await setOrigin(stub.fs, stub.mind, { url: stub.url, token: stub.token });

    expect(git.addRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        remote: "origin",
        url: stub.url,
      }),
    );

    expect(git.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        path: `remote.origin.token`,
        value: stub.token,
      }),
    );
  });
});

describe("resolve", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws if no mind", async () => {
    await expect(
      resolve(stub.fs, stub.mind, { url: stub.url, token: stub.token }),
    ).rejects.toThrowError();
  });

  test("calls git", async () => {
    await gitinit(stub.fs, stub.mind, stub.name);

    await commit(stub.fs, stub.mind);

    await setOrigin(stub.fs, stub.mind, { url: stub.url, token: stub.token });

    await resolve(stub.fs, stub.mind, { url: stub.url, token: stub.token });

    expect(git.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: stub.dirpath,
        url: stub.url,
        ref: "HEAD",
        onAuth: expect.any(Function),
      }),
    );
  });
});
