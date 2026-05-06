import { updateRecord } from "@/proxy/impure.js";
import storageCSVS from "@/storage.js";
import catalogIO from "@/catalog.js";
import federationGit from "@/federation.js";

async function SELECT({ fs, dir, catalog }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = storageCSVS(fs, dirMind);

  return storage.sparql({ kind: "SELECT", query });
}

async function DESCRIBE({ fs, dir, catalog }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = storageCSVS(fs, dirMind);

  return storage.sparql({ kind: "DESCRIBE", query });
}

async function DELETE({ fs, dir, federation, catalog }, mind, query) {
  const dirMind = await catalog.locate(mind);

  const storage = storageCSVS(fs, dirMind);

  await storage.sparql({ kind: "DELETE", query });

  await federation.settle(dirMind);

  if (mind === "root") return catalog.retire(query);
}

async function UPDATE({ fs, dir, storage, federation }, mind, query) {
  //const dirMind = await catalog.locate(mind);

  //await storage.sparql(dirMind, { kind: "UPDATE", query });
  await updateRecord(fs, mind, query);

  //await federation.settle();
  //await git.commit(fs, mind);

  //try {
  //    await git.resolve(fs, mind);
  //} catch {
  //    //do nothing
  //}

  //if (graph === "root") return catalog.induct(query);
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
  const federation = federationGit(fs);

  const catalog = catalogIO({ fs, dir, federation });

  await catalog.rebuild();

  const providers = { fs, dir, catalog, federation };

  return {
    ...providers,
    sparql: (query) => sparql(providers, query),
  };
}
