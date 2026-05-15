import { World, setWorldConstructor, After } from "@cucumber/cucumber";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export class MindzooWorld extends World {
  constructor(options) {
    super(options);
    this.zooDir = null;
    this.mockServer = null;
    this.mockPort = null;
    this.results = [];
    this.mindObject = null;
    this.lastError = null;
  }

  /** Create a fresh temp directory as the zoo root. */
  createZooDir() {
    this.zooDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindzoo-test-"));
    return this.zooDir;
  }

  /** Resolve a mind name to its full path within the zoo. */
  mindPath(name) {
    return path.join(this.zooDir, name);
  }

  /** Start the mock git server, return the port. */
  async startMockServer(bareDir) {
    return new Promise((resolve, reject) => {
      const serverScript = path.resolve(
        import.meta.dirname,
        "../mock-server.mjs",  // test/js/mock-server.mjs — shares node_modules
      );

      this.mockServer = spawn("node", [serverScript, bareDir], {
        stdio: ["pipe", "pipe", "inherit"],
      });

      this.mockServer.stdout.once("data", (data) => {
        this.mockPort = parseInt(data.toString().trim(), 10);
        resolve(this.mockPort);
      });

      this.mockServer.on("error", reject);
    });
  }

  /** Stop the mock git server. */
  stopMockServer() {
    if (this.mockServer) {
      this.mockServer.kill("SIGTERM");
      this.mockServer = null;
      this.mockPort = null;
    }
  }

  /** Replace {server} placeholder with actual server URL. */
  resolveOrigin(originTemplate) {
    if (!this.mockPort) {
      throw new Error("Mock server not started");
    }

    return originTemplate.replace("{server}", `http://localhost:${this.mockPort}`);
  }

  /** Cleanup temp directory. */
  cleanup() {
    this.stopMockServer();

    if (this.zooDir) {
      fs.rmSync(this.zooDir, { recursive: true, force: true });
      this.zooDir = null;
    }
  }
}

setWorldConstructor(MindzooWorld);

After(function () {
  this.cleanup();
});
