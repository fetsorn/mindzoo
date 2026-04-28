import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import {
  findMind,
  fetchFile,
  readFile,
  writeFile,
  rimraf,
  ls,
  pickFile,
} from "../io.js";
import stub from "./stub.js";

describe("findMind", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws if no mind is found", async () => {
    await expect(findMind(stub.fs, stub.mind)).rejects.toThrowError();
  });

  test("finds the directory", async () => {
    await stub.fs.promises.mkdir(stub.dirpath);

    const dir = await findMind(stub.fs, stub.mind);

    expect(dir).toBe(stub.dirpath);
  });
});

describe("fetchFile", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws if no mind", async () => {
    await expect(
      fetchFile(stub.fs, stub.mind, stub.filename),
    ).rejects.toThrowError();
  });

  test("reads file", async () => {
    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.writeFile(stub.filepath, stub.content);

    const content = await fetchFile(stub.fs, stub.mind, stub.filename);

    // stringify to get rmind of prototype methods on Uint8Array
    expect(JSON.stringify(content)).toEqual(JSON.stringify(stub.encoded));
  });

  test("reads file recursive", async () => {
    const absoluteDir = `${stub.dirpath}${stub.dirpath}`;

    const relativeDir = stub.dir;

    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.mkdir(absoluteDir);

    const absoluteFile = `${absoluteDir}/${stub.filename}`;

    const relativeFile = `${relativeDir}/${stub.filename}`;

    await stub.fs.promises.writeFile(absoluteFile, stub.content);

    const content = await fetchFile(stub.fs, stub.mind, relativeFile);

    // stringify to get rmind of prototype methods on Uint8Array
    expect(JSON.stringify(content)).toEqual(JSON.stringify(stub.encoded));
  });
});

describe("readFile", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws if no mind", async () => {
    await expect(
      readFile(stub.fs, stub.mind, stub.filename),
    ).rejects.toThrowError();
  });

  test("reads file", async () => {
    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.writeFile(stub.filepath, stub.content);

    const content = await readFile(stub.fs, stub.mind, stub.filename);

    expect(content).toEqual(stub.content);
  });

  test("reads file recursive", async () => {
    const absoluteDir = `${stub.dirpath}${stub.dirpath}`;

    const relativeDir = stub.dir;

    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.mkdir(absoluteDir);

    const absoluteFile = `${absoluteDir}/${stub.filename}`;

    const relativeFile = `${relativeDir}/${stub.filename}`;

    await stub.fs.promises.writeFile(absoluteFile, stub.content);

    const content = await readFile(stub.fs, stub.mind, relativeFile);

    expect(content).toEqual(stub.content);
  });
});

describe("writeFile", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("throws if no mind", async () => {
    await expect(
      writeFile(stub.fs, stub.mind, stub.filename, stub.content),
    ).rejects.toThrowError();
  });

  test("writes file", async () => {
    await stub.fs.promises.mkdir(stub.dirpath);

    await writeFile(stub.fs, stub.mind, stub.filename, stub.content);

    const content = await stub.fs.promises.readFile(stub.filepath, "utf8");

    expect(content).toEqual(stub.content);
  });

  test("writes file recursive", async () => {
    const absoluteDir = `${stub.dirpath}${stub.dirpath}`;

    const relativeDir = stub.dir;

    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.mkdir(absoluteDir);

    const absoluteFile = `${absoluteDir}/${stub.filename}`;

    const relativeFile = `${relativeDir}/${stub.filename}`;

    await writeFile(stub.fs, stub.mind, relativeFile, stub.content);

    const content = await stub.fs.promises.readFile(absoluteFile, "utf8");

    expect(content).toEqual(stub.content);
  });
});

describe("rimraf", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("removes a directory", async () => {
    const absoluteDir = `${stub.dirpath}${stub.dirpath}`;

    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.mkdir(absoluteDir);

    const absoluteFile = `${absoluteDir}/${stub.filename}`;

    await stub.fs.promises.writeFile(absoluteFile, stub.content);

    await rimraf(stub.fs, stub.dirpath);

    const listing = await stub.fs.promises.readdir("/");

    expect(listing).toEqual([]);
  });
});

describe("ls", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning stub.fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("find a directory", async () => {
    const absoluteDir = `${stub.dirpath}${stub.dirpath}`;

    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.mkdir(absoluteDir);

    const absoluteFile = `${absoluteDir}/${stub.filename}`;

    await stub.fs.promises.writeFile(absoluteFile, stub.content);

    const listing = await ls(stub.fs, "/");

    expect(listing).toEqual(`list /: ${stub.dir}
list //${stub.dir}: ${stub.dir}
list //${stub.dir}/${stub.dir}: ${stub.filename}
`);
  });
});

describe("pickFile", () => {
  test("find a directory", async () => {
    const input = document.createElement("input");

    document.createElement = vi.fn(() => input);

    setTimeout(() => input.onchange({ target: { files: [stub.file] } }), 50);

    const files = await pickFile();

    expect(document.createElement).toHaveBeenCalledWith("input");

    expect(files).toEqual([stub.file]);
  });
});
