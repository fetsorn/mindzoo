import { deleteRecord, createCatalog } from "@/proxy/record.js";
import { buildRecord, updateRecord } from "@/proxy/impure.js";
import { open } from "@/proxy/store.js";
import db from "@/db.js";
import storageCSVS from "@/storage.js";
import catalogIO from "@/catalog.js";
import git from "@/git.js";
import federationGit from "@/federation.js";

async function SELECT({ fs, dir, storage, federation }, mind, query) {
    //const dirMind = await catalog.locate(fs, dir, mind);

    //await storage.sparql(dirMind, { kind: "SELECT", query });
    return db.selectStream(fs, mind, query);
}

async function DESCRIBE({ fs, dir, storage, federation }, mind, query) {
    //const dirMind = await catalog.locate(fs, dir, mind);

    //await storage.sparql(dirMind, { kind: "DESCRIBE", query });
    return db.buildRecord(fs, mind, query);
}

async function DELETE({ fs, dir, storage, federation }, mind, query) {
    //const dirMind = await catalog.locate(fs, dir, mind);

    //await storage.sparql(dirMind, { kind: "DELETE", query });
    await db.deleteRecord(fs, mind, query);

    //await federation.settle();
    await git.commit(fs, mind);

    try {
        await git.resolve(fs, mind);
    } catch {
        //do nothing
    }
}

async function UPDATE({ fs, dir, storage, federation }, mind, query) {
    //const dirMind = await catalog.locate(fs, dir, mind);

    //await storage.sparql(dirMind, { kind: "DELETE", query });
    await updateRecord(fs, mind, query);

    //await federation.settle();
    //await git.commit(fs, mind);

    //try {
    //    await git.resolve(fs, mind);
    //} catch {
    //    //do nothing
    //}
}

async function sparql(
    { fs, catalog, federation, storage },
    { kind, graph, query },
) {
    // TODO accept sparql string and infer kind with haydee
    // const { kind, graph, inner } = await haydee.classify(sparql);

    if (graph === "root") return catalog.sparql({ kind, query });

    switch (kind) {
        case "SELECT":
            return SELECT({ fs, catalog, federation, storage }, graph, query);

        case "DESCRIBE":
            return DESCRIBE({ fs, catalog, federation, storage }, graph, query);

        case "UPDATE":
            return UPDATE({ fs, catalog, federation, storage }, graph, query);

        case "DELETE":
            await DELETE({ fs, catalog, federation, storage }, graph, query);
    }
}

export default async function createMindZoo({ fs, dir }) {
    const storage = storageCSVS(fs);

    const federation = federationGit(fs);

    const catalog = catalogIO({ fs, dir, storage, federation });

    await catalog.rebuild();

    const providers = { fs, storage, federation, catalog };

    return {
        ...providers,
        sparql: async (query) => sparql(providers, query),
        createCatalog,
        open,
        selectStream: db.selectStream,
        updateRecord,
        deleteRecord,
        buildRecord,
    };
}
