import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nodefs from "fs";
import os from "os";
import path from "path";
import { createServer } from "node:http";
import { spawn, execSync } from "node:child_process";
import nodeHttp from "isomorphic-git/http/node";
import createMindZoo from "@/index.js";

// ---------------------------------------------------------------------------
// Minimal smart-HTTP git server (same as git.test.js)
// ---------------------------------------------------------------------------
function createGitServer(rootDir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname.endsWith("/info/refs")) {
      const service = url.searchParams.get("service");
      const repoPath = pathname
        .replace(/\/info\/refs$/, "")
        .replace(/^\//, "");
      const gitDir = path.join(rootDir, repoPath);

      res.setHeader(
        "content-type",
        `application/x-${service}-advertisement`,
      );
      const pack = (s) => {
        const n = (4 + s.length).toString(16);
        return "0".repeat(4 - n.length) + n + s;
      };
      res.write(pack(`# service=${service}\n`) + "0000");

      const ps = spawn(service, [
        "--stateless-rpc",
        "--advertise-refs",
        gitDir,
      ]);
      ps.stdout.pipe(res);
      ps.stderr.on("data", () => {});
      ps.on("error", () => {
        res.statusCode = 500;
        res.end();
      });
    } else if (req.method === "POST") {
      const service = pathname.endsWith("/git-upload-pack")
        ? "git-upload-pack"
        : "git-receive-pack";
      const repoPath = pathname
        .replace(/\/(git-upload-pack|git-receive-pack)$/, "")
        .replace(/^\//, "");
      const gitDir = path.join(rootDir, repoPath);

      res.setHeader("content-type", `application/x-${service}-result`);
      const ps = spawn(service, ["--stateless-rpc", gitDir]);
      req.pipe(ps.stdin);
      ps.stdout.pipe(res);
      ps.stderr.on("data", () => {});
      ps.on("error", () => {
        res.statusCode = 500;
        res.end();
      });
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createBareRepo(rootDir, name) {
  const bareDir = path.join(rootDir, name);
  execSync(`git init --bare -b main "${bareDir}"`, { stdio: "ignore" });
  return bareDir;
}

// Seed the bare repo with a csvs mind that has a specific UUID
function seedRemoteWithMind(bareDir, uuid) {
  const tmpDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "seed-mind-"));

  execSync(
    [
      `git init -b main "${tmpDir}"`,
      `git -C "${tmpDir}" remote add origin "${bareDir}"`,
    ].join(" && "),
    { stdio: "ignore" },
  );

  // create csvs structure with the UUID
  const csvsDir = path.join(tmpDir, "csvs");
  nodefs.mkdirSync(csvsDir);
  nodefs.writeFileSync(
    path.join(csvsDir, ".csvs.csv"),
    `"version","0.0.4"\n"uuid","${uuid}"\n`,
  );
  // minimal schema
  nodefs.writeFileSync(
    path.join(csvsDir, "_-_.csv"),
    `"event","actdate"\n`,
  );

  execSync(
    [
      `git -C "${tmpDir}" add .`,
      `git -C "${tmpDir}" -c user.name=test -c user.email=test@test.com commit -m "seed mind ${uuid}"`,
      `git -C "${tmpDir}" push -u origin main`,
    ].join(" && "),
    { stdio: "ignore" },
  );

  return tmpDir;
}

// Overwrite the UUID in the remote repo
function advanceRemoteUuid(bareDir, newUuid) {
  const tmpDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "advance-uuid-"));

  execSync(`git clone "${bareDir}" "${tmpDir}"`, { stdio: "ignore" });

  nodefs.writeFileSync(
    path.join(tmpDir, "csvs", ".csvs.csv"),
    `"version","0.0.4"\n"uuid","${newUuid}"\n`,
  );

  execSync(
    [
      `git -C "${tmpDir}" add .`,
      `git -C "${tmpDir}" -c user.name=test -c user.email=test@test.com commit -m "change uuid to ${newUuid}"`,
      `git -C "${tmpDir}" push origin main`,
    ].join(" && "),
    { stdio: "ignore" },
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
let serverRootDir;
let server;
let serverPort;

beforeAll(async () => {
  serverRootDir = nodefs.mkdtempSync(
    path.join(os.tmpdir(), "mindzoo-integration-"),
  );
  server = createGitServer(serverRootDir);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("catalog resilience to UUID changes after settle", () => {
  let storeDir;

  beforeEach(() => {
    storeDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "zoo-store-"));
  });

  test("UPDATE succeeds after pull changes the mind UUID", async () => {
    const oldUuid = "acab1111";
    const newUuid = "acab2222";
    const repoName = "test-uuid-change";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // seed remote with oldUuid
    seedRemoteWithMind(bareDir, oldUuid);

    // create mindzoo and induct the mind (clones from remote)
    const zoo = await createMindZoo({
      fs: nodefs,
      dir: storeDir,
      http: nodeHttp,
    });

    await Array.fromAsync(
      await zoo.sparql({
        kind: "UPDATE",
        graph: "root",
        query: {
          _: "mind",
          mind: oldUuid,
          name: "test-mind",
          branch: [],
          origin_url: {
            _: "origin_url",
            origin_url: remoteUrl,
          },
        },
      }),
    );

    // verify catalog can locate the mind
    const dirBefore = await zoo.catalog.locate(oldUuid);
    expect(dirBefore).toBeTruthy();

    // advance remote: change the UUID
    advanceRemoteUuid(bareDir, newUuid);

    // pull (merge theirs) — catalog.merge fetches, merges, pushes
    await zoo.catalog.merge(oldUuid, "theirs");

    // catalog should now resolve the new UUID
    const dirAfter = await zoo.catalog.locate(newUuid);
    expect(dirAfter).toBeTruthy();

    // the old UUID should no longer resolve
    const dirOld = await zoo.catalog.locate(oldUuid);
    expect(dirOld).toBeFalsy();
  });

  test("UPDATE on a mind whose UUID changed via settle does not throw", async () => {
    const oldUuid = "dead1111";
    const newUuid = "dead2222";
    const repoName = "test-uuid-settle-update";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // seed remote with oldUuid
    seedRemoteWithMind(bareDir, oldUuid);

    const zoo = await createMindZoo({
      fs: nodefs,
      dir: storeDir,
      http: nodeHttp,
    });

    // induct mind (clones from remote, gets oldUuid)
    await Array.fromAsync(
      await zoo.sparql({
        kind: "UPDATE",
        graph: "root",
        query: {
          _: "mind",
          mind: oldUuid,
          name: "test-mind",
          branch: [],
          origin_url: {
            _: "origin_url",
            origin_url: remoteUrl,
          },
        },
      }),
    );

    // advance remote: change UUID
    advanceRemoteUuid(bareDir, newUuid);

    // pull — catalog.merge fetches, merges, pushes
    await zoo.catalog.merge(oldUuid, "theirs");

    // now UPDATE through zoo.sparql using the NEW uuid
    // this triggers index.js UPDATE → catalog.locate(newUuid) → federation.settle
    // should not throw "locate returned undefined"
    await Array.fromAsync(
      await zoo.sparql({
        kind: "UPDATE",
        graph: newUuid,
        query: { _: "event", event: "evt1", actdate: "2025-01-01" },
      }),
    );

    // verify locate still works after the settle inside UPDATE
    const dirAfterUpdate = await zoo.catalog.locate(newUuid);
    expect(dirAfterUpdate).toBeTruthy();
  });
});

describe("clone via induct", () => {
  let storeDir;

  beforeEach(() => {
    storeDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "zoo-store-"));
  });

  test("unreachable origin: induct throws early and rolls back the mind dir", async () => {
    const throwawayUuid = "cafe1111";
    const bogusUrl = "http://127.0.0.1:1/unreachable-repo";

    const zoo = await createMindZoo({
      fs: nodefs,
      dir: storeDir,
      http: nodeHttp,
    });

    // induct a fresh mind with an unreachable origin — a clone request
    // that cannot be satisfied must report, not create a silent empty mind
    await expect(async () => {
      await Array.fromAsync(
        await zoo.sparql({
          kind: "UPDATE",
          graph: "root",
          query: {
            _: "mind",
            mind: throwawayUuid,
            name: "cloned",
            branch: [],
            origin_url: {
              _: "origin_url",
              origin_url: bogusUrl,
            },
          },
        }),
      );
    }).rejects.toThrow(/clone failed \(unreachable\)/);

    // rollback: the scaffolded mind dir is gone, catalog can't locate it
    const dirAfter = await zoo.catalog.locate(throwawayUuid);
    expect(dirAfter).toBeFalsy();

    // only the root catalog remains in the store
    expect(nodefs.readdirSync(storeDir)).toEqual(["root"]);
  });

  test("successful clone: catalog adopts remote uuid, SELECT by origin_url finds it", async () => {
    const throwawayUuid = "beef1111";
    const remoteUuid = "beef2222";
    const repoName = "test-clone-adopts-uuid";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    seedRemoteWithMind(bareDir, remoteUuid);

    const zoo = await createMindZoo({
      fs: nodefs,
      dir: storeDir,
      http: nodeHttp,
    });

    // induct with a throwaway uuid — the clone brings the remote uuid
    await Array.fromAsync(
      await zoo.sparql({
        kind: "UPDATE",
        graph: "root",
        query: {
          _: "mind",
          mind: throwawayUuid,
          name: "cloned",
          branch: [],
          origin_url: {
            _: "origin_url",
            origin_url: remoteUrl,
          },
        },
      }),
    );

    // catalog resolves the remote uuid, not the throwaway one
    expect(await zoo.catalog.locate(remoteUuid)).toBeTruthy();
    expect(await zoo.catalog.locate(throwawayUuid)).toBeFalsy();

    // consumers recover the actual uuid by filtering on nested origin_url
    // (SELECT { _: "mind" } returns shallow records without origin_url)
    const [found] = await Array.fromAsync(
      await zoo.sparql({
        kind: "SELECT",
        graph: "root",
        query: {
          _: "mind",
          origin_url: { _: "origin_url", origin_url: remoteUrl },
        },
      }),
    );

    expect(found).toBeTruthy();
    expect(found.mind).toBe(remoteUuid);
  });
});
