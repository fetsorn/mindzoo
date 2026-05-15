// Standalone mock git server for testing federation.
// Usage: node mock-server.mjs <bare-repos-dir>
// Prints the port number to stdout once listening.
// Send SIGTERM or close stdin to shut down.

import http from "node:http";
import path from "node:path";
import factory from "git-http-mock-server/middleware.js";
import cors from "git-http-mock-server/cors.js";

const root = process.argv[2];

if (!root) {
  console.error("Usage: node mock-server.mjs <bare-repos-dir>");
  process.exit(1);
}

const config = {
  root: path.resolve(root),
  glob: "*",
  route: "/",
};

const server = http.createServer(cors(factory(config)));

server.listen(0, () => {
  const { port } = server.address();

  // Print port so the parent process can read it
  console.log(port);
});

// Shut down gracefully on SIGTERM or stdin close
process.on("SIGTERM", () => server.close());
process.stdin.resume();
process.stdin.on("end", () => server.close());
