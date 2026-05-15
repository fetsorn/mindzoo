import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import createMindZoo from "@fetsorn/mindzoo";

// -- Given --

Given(
  "a mock git server with repo {string} that has uuid {string}",
  async function (repoName, uuid) {
    const fixturesDir = path.join(this.zooDir, ".fixtures", "bare");

    fs.mkdirSync(fixturesDir, { recursive: true });

    // 1. Create a normal repo with content
    const srcDir = path.join(this.zooDir, ".fixtures", "src", repoName);

    fs.mkdirSync(srcDir, { recursive: true });

    await git.init({ fs, dir: srcDir, defaultBranch: "main" });

    const csvsDir = path.join(srcDir, "csvs");

    fs.mkdirSync(csvsDir, { recursive: true });
    fs.writeFileSync(
      path.join(csvsDir, ".csvs.csv"),
      `uuid\n${uuid}\n`,
      "utf8",
    );
    fs.writeFileSync(path.join(csvsDir, "_-_.csv"), `_\n_\n`, "utf8");

    await git.add({ fs, dir: srcDir, filepath: "." });
    await git.commit({
      fs,
      dir: srcDir,
      message: "initial",
      author: { name: "test", email: "test@test" },
    });

    // 2. Convert to bare: move .git/ to bare dir, set core.bare = true
    const bareDir = path.join(fixturesDir, repoName);

    fs.renameSync(path.join(srcDir, ".git"), bareDir);

    const configPath = path.join(bareDir, "config");
    let config = fs.readFileSync(configPath, "utf8");

    config = config.replace("bare = false", "bare = true");
    fs.writeFileSync(configPath, config, "utf8");

    await this.startMockServer(fixturesDir);
  },
);

Given(
  "a mock git server repo {string} that extends {string} with file {string}",
  async function (newRepo, baseRepo, filePath) {
    const fixturesDir = path.join(this.zooDir, ".fixtures", "bare");

    // Clone base via HTTP mock server into a working dir
    const url = `http://localhost:${this.mockPort}/${baseRepo}`;
    const workDir = path.join(this.zooDir, ".fixtures", "src", newRepo);

    fs.mkdirSync(workDir, { recursive: true });

    await git.clone({ fs, http, dir: workDir, url });

    // Add the new file
    const fullPath = path.join(workDir, filePath);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "remote content\n", "utf8");

    await git.add({ fs, dir: workDir, filepath: "." });
    await git.commit({
      fs,
      dir: workDir,
      message: "add remote file",
      author: { name: "test", email: "test@test" },
    });

    // Convert to bare repo
    const bareDir = path.join(fixturesDir, newRepo);

    fs.renameSync(path.join(workDir, ".git"), bareDir);

    const configPath = path.join(bareDir, "config");
    let config = fs.readFileSync(configPath, "utf8");

    config = config.replace("bare = false", "bare = true");
    fs.writeFileSync(configPath, config, "utf8");
  },
);

Given(
  "a mind {string} cloned from {string}",
  async function (name, originTemplate) {
    const url = this.resolveOrigin(originTemplate);
    const dir = this.mindPath(name);

    await git.clone({ fs, http, dir, url });
  },
);

// -- When --

When("I settle the mind {string}", async function (name) {
  this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));
  const dir = this.mindPath(name);

  await this.zoo.federation.settle(dir);
});

When(
  "I settle {string} with origin {string}",
  async function (name, originTemplate) {
    const url = this.resolveOrigin(originTemplate);
    const dir = this.mindPath(name);
    this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

    await this.zoo.federation.settle(dir, { url });
  },
);

When("I write a file {string} in mind {string}", function (filePath, name) {
  const fullPath = path.join(this.mindPath(name), filePath);
  const dir = path.dirname(fullPath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, "test content\n", "utf8");
});

When(
  "the mind {string} has its origin changed to {string}",
  async function (name, originTemplate) {
    const url = this.resolveOrigin(originTemplate);
    const dir = this.mindPath(name);

    await git.addRemote({ fs, dir, remote: "origin", url, force: true });
  },
);

// -- Then --

Then("the mind {string} has a {string} directory", function (name, subdir) {
  const dir = path.join(this.mindPath(name), subdir);

  assert.ok(fs.existsSync(dir), `expected ${dir} to exist`);
});

Then(
  "the git log of {string} has at least {int} commit(s)",
  async function (name, n) {
    const dir = this.mindPath(name);
    const log = await git.log({ fs, dir });

    assert.ok(
      log.length >= n,
      `expected at least ${n} commits, got ${log.length}`,
    );
  },
);

Then("the mind {string} contains {string}", function (name, filePath) {
  const fullPath = path.join(this.mindPath(name), filePath);

  assert.ok(fs.existsSync(fullPath), `expected ${fullPath} to exist`);
});

