import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import JsZip from "jszip";
import { addToZip, zip } from "../zip.js";
import stub from "./stub.js";

describe("addToZip", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("changes zipDir", async () => {
    // write test dataset
    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.writeFile(stub.filepath, stub.content);

    const zipDir = new JsZip();

    await addToZip(stub.fs, stub.dirpath, zipDir);

    await expect(zipDir).toEqual(
      expect.objectContaining({
        files: { [stub.filename]: expect.objectContaining({}) },
      }),
    );
  });
});

describe("zip", () => {
  beforeEach(() => {
    stub.fs.init("test", { wipe: true });
  });

  afterEach(async () => {
    // for lightning fs to release mutex on indexedDB
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("returns an archive", async () => {
    // write test dataset
    await stub.fs.promises.mkdir(stub.dirpath);

    await stub.fs.promises.writeFile(stub.filepath, stub.content);

    const content = await zip(stub.fs, stub.mind);

    await expect(content).toEqual(new Blob());
  });
});
