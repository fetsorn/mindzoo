import csvs from "@/providers/csvs.js";
import git from "@/providers/git.js";
import io from "@/providers/catalog.js";

async function SELECT({ fs, dir, catalog }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = csvs(fs, dirMind);

  return storage.sparql({ kind: "SELECT", query });
}

async function DESCRIBE({ fs, dir, catalog }, mind, query) {
  if (mind === "root") {
    return catalog.describe(query);
  }

  const dirMind = await catalog.locate(mind);

  const storage = csvs(fs, dirMind);

  return storage.sparql({ kind: "DESCRIBE", query });
}

async function DELETE({ fs, dir, catalog, federation }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = csvs(fs, dirMind);

  await Array.fromAsync(storage.sparql({ kind: "DELETE", query }));

  await federation.settle(dirMind);

  if (mind === "root") {
    const queries = Array.isArray(query) ? query : [query];

    for (const q of queries) {
      if (q._ === "mind" && q.mind) {
        await catalog.retire(q.mind);
      }
    }
  }

  return new ReadableStream({
    async pull(controller) {
      controller.close();
    },
  });
}

async function UPDATE({ fs, dir, catalog, federation }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = csvs(fs, dirMind);

  await Array.fromAsync(storage.sparql({ kind: "UPDATE", query }));

  await federation.settle(dirMind);

  if (mind === "root") {
    const queries = Array.isArray(query) ? query : [query];

    for (const q of queries) {
      if (q._ === "mind") {
        await catalog.induct(q);
      }
    }
  }

  return new ReadableStream({
    async pull(controller) {
      controller.close();
    },
  });
}

async function sparql(providers, { kind, graph, query }) {
  // TODO accept sparql string and infer kind with haydee
  // const { kind, graph, inner } = await haydee.classify(sparql);

  switch (kind) {
    case "SELECT":
      return SELECT(providers, graph, query);

    case "DESCRIBE":
      return DESCRIBE(providers, graph, query);

    case "UPDATE":
      return UPDATE(providers, graph, query);

    case "DELETE":
      return DELETE(providers, graph, query);
  }
}

export default async function createMindZoo({ fs, dir, http }) {
  const federation = git(fs, http);

  const catalog = io({ fs, dir, federation });

  await catalog.rebuild();

  const providers = { fs, dir, catalog, federation };

  return {
    ...providers,
    sparql: (query) => sparql(providers, query),
  };
}
