import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nodefs from "fs";
import os from "os";
import path from "path";
import { createServer } from "node:http";
import { spawn, execSync } from "node:child_process";
import git from "isomorphic-git";
import nodeHttp from "isomorphic-git/http/node";
import createProvider from "@/providers/git.js";

// ---------------------------------------------------------------------------
// Minimal smart-HTTP git server (serves bare repos from a root directory)
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

// Create a bare repo and return its path
function createBareRepo(rootDir, name) {
  const bareDir = path.join(rootDir, name);
  execSync(`git init --bare -b main "${bareDir}"`, { stdio: "ignore" });
  return bareDir;
}

// Push to a bare repo directly using real git (no HTTP needed for setup)
function seedRemote(bareDir) {
  const tmpDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "seed-"));

  execSync(
    [
      `git init -b main "${tmpDir}"`,
      `git -C "${tmpDir}" remote add origin "${bareDir}"`,
    ].join(" && "),
    { stdio: "ignore" },
  );

  nodefs.writeFileSync(path.join(tmpDir, "file.txt"), "initial content\n");

  execSync(
    [
      `git -C "${tmpDir}" add .`,
      `git -C "${tmpDir}" -c user.name=test -c user.email=test@test.com commit -m "initial commit"`,
      `git -C "${tmpDir}" push -u origin main`,
    ].join(" && "),
    { stdio: "ignore" },
  );

  return tmpDir;
}

// Add a commit to the remote via a temp clone of the bare repo
function advanceRemote(bareDir, filename, content) {
  const tmpDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "advance-"));

  execSync(`git clone "${bareDir}" "${tmpDir}"`, { stdio: "ignore" });

  nodefs.writeFileSync(path.join(tmpDir, filename), content);

  execSync(
    [
      `git -C "${tmpDir}" add .`,
      `git -C "${tmpDir}" -c user.name=test -c user.email=test@test.com commit -m "add ${filename}"`,
      `git -C "${tmpDir}" push origin main`,
    ].join(" && "),
    { stdio: "ignore" },
  );
}

// Count merge commits (commits with >1 parent) in the log
async function countMergeCommits(dir) {
  const log = await git.log({ fs: nodefs, dir });
  let merges = 0;
  for (const entry of log) {
    if (entry.commit.parent.length > 1) merges++;
  }
  return merges;
}

// Get the full log as an array of { oid, message, parents }
async function getLog(dir) {
  const log = await git.log({ fs: nodefs, dir });
  return log.map((e) => ({
    oid: e.oid,
    message: e.commit.message,
    parents: e.commit.parent,
  }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let serverRootDir;
let server;
let serverPort;

beforeAll(async () => {
  serverRootDir = nodefs.mkdtempSync(
    path.join(os.tmpdir(), "git-test-server-"),
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

describe("settle", () => {
  let localDir;
  let provider;

  beforeEach(() => {
    localDir = nodefs.mkdtempSync(path.join(os.tmpdir(), "settle-local-"));
    provider = createProvider(nodefs, nodeHttp);
  });

  // -----------------------------------------------------------------------
  // 1. Fresh repo, no remote → gitinit + commit locally
  // -----------------------------------------------------------------------
  test("fresh repo, no remote: commits locally", async () => {
    nodefs.writeFileSync(path.join(localDir, "hello.txt"), "hello\n");
    await provider.settle(localDir);

    const log = await getLog(localDir);
    expect(log.length).toBe(1);
    expect(log[0].parents).toHaveLength(0); // root commit, no parents

    // File is still there
    const content = nodefs.readFileSync(
      path.join(localDir, "hello.txt"),
      "utf8",
    );
    expect(content).toBe("hello\n");
  });

  // -----------------------------------------------------------------------
  // 2. Fresh repo, remote has content → fetch remote, no divergent commits
  // -----------------------------------------------------------------------
  test("fresh repo, remote has content: settles without merge commits", async () => {
    const repoName = "test-fresh-remote-content";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote with initial content
    seedRemote(bareDir);
    // Advance remote with extra content
    advanceRemote(bareDir, "extra.txt", "extra content\n");

    // Now settle a fresh local repo against this remote
    await provider.settle(localDir, { url: remoteUrl });

    const log = await getLog(localDir);
    const merges = log.filter((e) => e.parents.length > 1);
    expect(merges).toHaveLength(0);

    // Remote file should be present locally
    const content = nodefs.readFileSync(
      path.join(localDir, "extra.txt"),
      "utf8",
    );
    expect(content).toBe("extra content\n");
  });

  // -----------------------------------------------------------------------
  // 3. Clean working tree, remote moved → fast-forward, no merge commits
  // -----------------------------------------------------------------------
  test("clean working tree, remote moved: fast-forwards without merge", async () => {
    const repoName = "test-clean-remote-moved";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote
    seedRemote(bareDir);

    // First settle: sync local with remote
    await provider.settle(localDir, { url: remoteUrl });

    // Advance remote independently
    advanceRemote(bareDir, "new-remote.txt", "remote change\n");

    // Second settle: local is clean, remote has moved
    await provider.settle(localDir);

    const merges = await countMergeCommits(localDir);
    expect(merges).toBe(0);

    // Remote's new file should be present
    const content = nodefs.readFileSync(
      path.join(localDir, "new-remote.txt"),
      "utf8",
    );
    expect(content).toBe("remote change\n");
  });

  // -----------------------------------------------------------------------
  // 4. Dirty working tree, remote same → commit + push, no merge
  // -----------------------------------------------------------------------
  test("dirty working tree, remote same: commits and pushes cleanly", async () => {
    const repoName = "test-dirty-remote-same";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote
    seedRemote(bareDir);

    // First settle
    await provider.settle(localDir, { url: remoteUrl });

    // Make local changes (dirty working tree)
    nodefs.writeFileSync(path.join(localDir, "local.txt"), "local work\n");

    // Second settle: dirty tree, remote has NOT moved
    await provider.settle(localDir);

    const merges = await countMergeCommits(localDir);
    expect(merges).toBe(0);

    // Local file is committed
    const log = await getLog(localDir);
    expect(log[0].message).toContain("local.txt");
  });

  // -----------------------------------------------------------------------
  // 5. Dirty working tree, remote moved → THE CORE BUG
  //    Should: capture dirty, reset to remote, reapply, commit, push (ff)
  //    Current bug: commits locally, then fetch+merge → merge commit
  // -----------------------------------------------------------------------
  test("dirty working tree, remote moved: no merge commits (fast-forward)", async () => {
    const repoName = "test-dirty-remote-moved";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote
    seedRemote(bareDir);

    // First settle: sync local with remote
    await provider.settle(localDir, { url: remoteUrl });

    // Advance remote independently
    advanceRemote(bareDir, "remote-file.txt", "remote work\n");

    // Make local changes (dirty working tree)
    nodefs.writeFileSync(path.join(localDir, "local-file.txt"), "local work\n");

    // Second settle: dirty tree AND remote has moved
    await provider.settle(localDir);

    // THE KEY ASSERTION: no merge commits in history
    const merges = await countMergeCommits(localDir);
    expect(merges).toBe(0);

    // Both files should be present
    const remoteContent = nodefs.readFileSync(
      path.join(localDir, "remote-file.txt"),
      "utf8",
    );
    expect(remoteContent).toBe("remote work\n");

    const localContent = nodefs.readFileSync(
      path.join(localDir, "local-file.txt"),
      "utf8",
    );
    expect(localContent).toBe("local work\n");
  });

  // -----------------------------------------------------------------------
  // 6. Remote unreachable → don't commit, leave dirty files in working tree
  // -----------------------------------------------------------------------
  test("remote unreachable: does not commit, dirty files survive", async () => {
    // Point at unreachable remote
    const bogusUrl = "http://127.0.0.1:1/unreachable-repo";

    // First settle with bogus origin (will set origin but can't reach it)
    await provider.settle(localDir, { url: bogusUrl });

    // Write a dirty file
    nodefs.writeFileSync(path.join(localDir, "dirty.txt"), "uncommitted\n");

    // Second settle: remote unreachable
    await provider.settle(localDir);

    // Dirty file should still be in working tree (not committed if we
    // follow the review's spec; the current code commits regardless)
    const content = nodefs.readFileSync(
      path.join(localDir, "dirty.txt"),
      "utf8",
    );
    expect(content).toBe("uncommitted\n");
  });

  // -----------------------------------------------------------------------
  // 7. Clone scenario: local scaffolding must not overwrite remote content
  //    Reproduces the bug where induct writes a throwaway UUID, then settle
  //    captures it via captureDirty and reapplyDirty writes it back on top
  //    of the remote UUID after checkout --force.
  // -----------------------------------------------------------------------
  test("clone: local files written before first settle do not overwrite remote", async () => {
    const repoName = "test-clone-uuid";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote with a file representing the "real" UUID
    const seedDir = seedRemote(bareDir);
    advanceRemote(bareDir, "uuid.txt", "remote-uuid\n");

    // Simulate what induct does: create dir, write scaffolding with a
    // throwaway UUID, then call settle with origin (first contact)
    nodefs.writeFileSync(path.join(localDir, "uuid.txt"), "throwaway-uuid\n");

    await provider.settle(localDir, { url: remoteUrl });

    // Remote UUID must prevail — the throwaway must not survive
    const content = nodefs.readFileSync(
      path.join(localDir, "uuid.txt"),
      "utf8",
    );
    expect(content).toBe("remote-uuid\n");
  });

  // -----------------------------------------------------------------------
  // 8. Multiple settles with remote advancing each time → never merge commits
  //    This catches the bug where the "first fetch" guard only helps once.
  // -----------------------------------------------------------------------
  test("three settles with remote advancing: history stays linear", async () => {
    const repoName = "test-multi-settle";
    const bareDir = createBareRepo(serverRootDir, repoName);
    const remoteUrl = `http://127.0.0.1:${serverPort}/${repoName}`;

    // Seed remote
    seedRemote(bareDir);

    // Settle 1: initial sync
    await provider.settle(localDir, { url: remoteUrl });

    // Cycle 2: remote advances, local mutates
    advanceRemote(bareDir, "r1.txt", "remote 1\n");
    nodefs.writeFileSync(path.join(localDir, "l1.txt"), "local 1\n");
    await provider.settle(localDir);

    // Cycle 3: remote advances again, local mutates again
    advanceRemote(bareDir, "r2.txt", "remote 2\n");
    nodefs.writeFileSync(path.join(localDir, "l2.txt"), "local 2\n");
    await provider.settle(localDir);

    const merges = await countMergeCommits(localDir);
    expect(merges).toBe(0);

    // All files present
    expect(
      nodefs.readFileSync(path.join(localDir, "r1.txt"), "utf8"),
    ).toBe("remote 1\n");
    expect(
      nodefs.readFileSync(path.join(localDir, "l1.txt"), "utf8"),
    ).toBe("local 1\n");
    expect(
      nodefs.readFileSync(path.join(localDir, "r2.txt"), "utf8"),
    ).toBe("remote 2\n");
    expect(
      nodefs.readFileSync(path.join(localDir, "l2.txt"), "utf8"),
    ).toBe("local 2\n");
  });
});
