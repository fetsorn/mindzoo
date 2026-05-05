import { deleteRecord, createCatalog } from "@/proxy/record.js";
import { buildRecord, updateRecord } from "@/proxy/impure.js";
import { open } from "@/proxy/store.js";
import { selectStream } from "@/db.js";
import csvs from "@/storage.js";
import io from "@/catalog.js";
import git from "@/federation.js";

async function sparql(
    { catalog, federation, storage },
    { kind, graph, query },
) {
    // TODO accept sparql string and infer kind with haydee
    // const { kind, graph, inner } = await haydee.classify(sparql);

    if (graph === "root") return catalog.sparql({ kind, query });

    //switch (kind) {
    //    //case "SELECT":
    //    //    return SELECT(providers, graph, query);

    //    //case "DESCRIBE":
    //    //    return DESCRIBE(providers, graph, query);

    //    //case "UPDATE":
    //    //    return UPDATE(providers, graph, query);

    //    //case "DELETE":
    //    //    await DELETE(providers, graph, query);
    //}
}

export default async function createMindZoo({ fs, dir }) {
    const storage = csvs(fs);

    const federation = git(fs);

    const catalog = io({ fs, dir, storage, federation });

    const providers = { fs, storage, federation, catalog };

    return {
        ...providers,
        sparql: (query) => sparql(providers, query),
        createCatalog,
        open,
        selectStream,
        updateRecord,
        deleteRecord,
        buildRecord,
    };
}
