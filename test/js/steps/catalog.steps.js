import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import csvs from "@fetsorn/csvs-js";
import http from "isomorphic-git/http/node";
import createMindZoo from "@fetsorn/mindzoo";

// -- Given --

Given("a zoo directory", function () {
  this.createZooDir();
});

Given(
  "a mind {string} with uuid {string} and schema:",
  async function (name, uuid, docstring) {
    const dir = this.mindPath(name);
    const schema = JSON.parse(docstring);

    fs.mkdirSync(dir, { recursive: true });

    await csvs.init({ fs, dir });

    // write uuid to version record
    await csvs.updateRecord({ fs, dir, query: { _: ".", uuid } });

    await csvs.updateRecord({ fs, dir, query: schema });
  },
);

Given("an empty directory {string}", function (name) {
  const dir = this.mindPath(name);

  fs.mkdirSync(dir, { recursive: true });
});

Given(
  "the mind {string} has branch records:",
  async function (name, docstring) {
    const dir = this.mindPath(name);
    const branches = JSON.parse(docstring);

    for (const branch of branches) {
      await csvs.updateRecord({ fs, dir, query: branch });
    }
  },
);

Given("a rebuilt catalog", async function () {
  this.zoo = await createMindZoo({ fs, dir: this.zooDir, http });
});

// -- When --

When("I locate {string}", async function (mind) {
  this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));
  this.locateResult = await this.zoo.catalog.locate(mind);
});

When("I rebuild the catalog", async function () {
  this.zoo = await createMindZoo({ fs, dir: this.zooDir, http });
});

When(
  "I induct a mind with uuid {string} and name {string} and branches:",
  async function (uuid, name, docstring) {
    const branches = JSON.parse(docstring);
    this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

    await this.zoo.catalog.induct({
      _: "mind",
      mind: uuid,
      name,
      branch: branches,
    });
  },
);

When(
  "I induct a mind with uuid {string} and name {string} and origin {string} and branches:",
  async function (uuid, name, originTemplate, docstring) {
    const branches = JSON.parse(docstring);
    const url = this.resolveOrigin(originTemplate);
    this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

    await this.zoo.catalog.induct({
      _: "mind",
      mind: uuid,
      name,
      branch: branches,
      origin_url: {
        _: "origin_url",
        origin_url: url,
      },
    });
  },
);

When(
  "I induct a mind with uuid {string} and no name and branches:",
  async function (uuid, docstring) {
    const branches = JSON.parse(docstring);
    this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

    await this.zoo.catalog.induct({
      _: "mind",
      mind: uuid,
      branch: branches,
    });
  },
);


When("I retire {string}", async function (mind) {
  this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

  try {
    await this.zoo.catalog.retire(mind);
    this.lastError = null;
  } catch (e) {
    this.lastError = e;
  }
});

When("I describe mind {string}", async function (mind) {
  this.zoo = this.zoo ?? (await createMindZoo({ fs, dir: this.zooDir, http }));

  const stream = this.zoo.catalog.describe([{ _: "mind", mind }]);
  const results = await Array.fromAsync(stream);

  this.mindObject = results[0];
});

// -- Then --

Then("the result is the path to {string}", function (name) {
  const expected = this.mindPath(name);

  assert.equal(this.locateResult, expected);
});

Then("the result is empty", function () {
  assert.equal(this.locateResult, undefined);
});

Then("the zoo has a/an {string} directory", function (name) {
  const dir = this.mindPath(name);

  assert.ok(fs.existsSync(dir), `expected ${dir} to exist`);
});

Then("the zoo does not have a/an {string} directory", function (name) {
  const dir = this.mindPath(name);

  assert.ok(!fs.existsSync(dir), `expected ${dir} to not exist`);
});

Then(
  "selecting minds from the catalog returns {int} entry/entries",
  async function (n) {
    const dirCatalog = this.mindPath("root");
    const records = await csvs.selectRecord({
      fs,
      dir: dirCatalog,
      query: [{ _: "mind" }],
    });

    assert.equal(records.length, n);
  },
);

Then(
  "the mind at {string} has a schema with {string} trunk",
  async function (folderName, trunk) {
    const dir = this.mindPath(folderName);
    const [schema] = await csvs.selectRecord({
      fs,
      dir,
      query: [{ _: "_" }],
    });

    assert.ok(
      schema[trunk] !== undefined,
      `expected schema to have trunk "${trunk}"`,
    );
  },
);

Then(
  "the mind at {string} has uuid {string} in its version record",
  async function (folderName, expectedUuid) {
    const dir = this.mindPath(folderName);
    const [versionRecord] = await csvs.selectRecord({
      fs,
      dir,
      query: [{ _: "." }],
    });

    const foundUuid = versionRecord.uuid ?? versionRecord.id;

    assert.equal(foundUuid, expectedUuid);
  },
);

Then(
  "the mind at {string} has a branch record for {string}",
  async function (folderName, branchName) {
    const dir = this.mindPath(folderName);
    const records = await csvs.selectRecord({
      fs,
      dir,
      query: [{ _: "branch", branch: branchName }],
    });

    assert.ok(records.length > 0, `expected branch record for "${branchName}"`);
  },
);

Then(
  "the mind at {string} contains files from the remote",
  function (folderName) {
    const dir = this.mindPath(folderName);
    const csvsDir = path.join(dir, "csvs");

    assert.ok(fs.existsSync(csvsDir), `expected csvs dir in ${folderName}`);
  },
);

Then("no error is raised", function () {
  assert.equal(this.lastError, null);
});

Then("the mind object has uuid {string}", function (uuid) {
  assert.equal(this.mindObject.mind, uuid);
});

Then("the mind object has name {string}", function (name) {
  assert.equal(this.mindObject.name, name);
});

Then("the mind object has {int} branches", function (n) {
  const branches = Array.isArray(this.mindObject.branch)
    ? this.mindObject.branch
    : [];

  assert.equal(branches.length, n);
});

Then(
  "branch {string} has {string} equal to {string}",
  function (branchName, key, value) {
    const branches = Array.isArray(this.mindObject.branch)
      ? this.mindObject.branch
      : [];
    const branch = branches.find((b) =>
      typeof b === "object" ? b.branch === branchName : false,
    );

    assert.ok(branch, `branch "${branchName}" not found`);
    assert.equal(branch[key], value);
  },
);

Then("branch {string} has trunk {string}", function (branchName, trunk) {
  const branches = Array.isArray(this.mindObject.branch)
    ? this.mindObject.branch
    : [];
  const branch = branches.find((b) =>
    typeof b === "object" ? b.branch === branchName : false,
  );

  assert.ok(branch, `branch "${branchName}" not found`);

  const trunks = Array.isArray(branch.trunk) ? branch.trunk : [branch.trunk];

  assert.ok(trunks.includes(trunk), `expected trunk "${trunk}"`);
});

Then("the mind object has no origin", function () {
  assert.ok(
    this.mindObject.origin_url === undefined,
    "expected no origin_url",
  );
});
