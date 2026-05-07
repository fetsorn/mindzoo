import csvs from "@/providers/csvs.js";
import git from "@/providers/git.js";
import io from "@/providers/catalog.js";

async function SELECT({ fs, dir, catalog }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = csvs(fs, dirMind);

  return storage.sparql({ kind: "SELECT", query });
}

async function DESCRIBE({ fs, dir, catalog }, mind, query) {
  const isCatalog =
    mind === "root" && query._ === "mind" && query.mind === "root";

  if (isCatalog) {
    const entry = await catalog.describe(query.mind);

    return new ReadableStream({
      async pull(controller) {
        controller.enqueue(entry);
        controller.close();
      },
    });
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

  const isMind = mind === "root" && query._ === "mind";

  if (isMind) await catalog.retire(query.mind);

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

  const isMind = mind === "root" && query._ === "mind";

  if (isMind) await catalog.induct(query);

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
      await DELETE(providers, graph, query);
  }
}

export default async function createMindZoo({ fs, dir }) {
  const federation = git(fs);

  const catalog = io({ fs, dir, federation });

  await catalog.rebuild();

  const providers = { fs, dir, catalog, federation };

  return {
    ...providers,
    sparql: (query) => sparql(providers, query),
  };
}
