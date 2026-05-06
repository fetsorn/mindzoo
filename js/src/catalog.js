import path from "path";
import db from "@/db.js";
import { updateRecord } from "@/proxy/impure.js";
import {
    recordsToMind,
    schemaToBranchRecords,
    extractSchemaRecords,
} from "@/pure.js";
import { rimraf } from "./io.js";
import git from "./git.js";
import catalogSchemaRecord from "@/catalog_schema_record.json";
import catalogBranchRecords from "@/catalog_branch_records.json";

async function rebuild({ fs, dir, federation, storage }) {
    const dirCatalog = path.join(dir, "root");

    const rootExists = (await fs.promises.readdir(dir)).includes("root");

    if (rootExists) {
        await rimraf(fs, dirCatalog);
    }

    await git.gitinit(fs, "root");

    await db.csvsinit(fs, "root");

    await db.updateRecord(fs, "root", catalogSchemaRecord);

    for (const branchRecord of catalogBranchRecords) {
        await db.updateRecord(fs, "root", branchRecord);
    }

    const minds = await fs.promises.readdir(dir);

    for (const mindPath of minds) {
        // get name from layout
        const dirMind = path.join(dir, mindPath);

        // get name from uuid-name
        const [uuid, name] = mindPath.split("-");

        // fetch schema from mind
        const [schemaRecord] = await db.select(fs, uuid, { _: "_" });

        const branchRecords = await db.select(fs, uuid, { _: "branch" });

        // get remote and token from git
        const { url, token } = await git.getOrigin(fs, uuid);

        // TODO records to mind
        const mind = recordsToMind(
            uuid,
            name,
            schemaRecord,
            branchRecords,
            url,
            token,
        );

        // write to catalog
        await db.updateRecord(fs, "root", mind);
    }

    // commit catalog
    await federation.settle("root");
}

async function locate(fs, dir, mind) {
    const existingMind = (await fs.promises.readdir(dir)).find(
        (m) => m === mind || m.startsWith(mind + "-"),
    );

    if (existingMind === undefined) {
        throw Error("no mind found");
    } else {
        return `${dir}/${existingMind}`;
    }
}

async function SELECT({ fs, dir, storage, federation }, query) {
    const dirMind = await locate(fs, dir, "root");

    return db.selectStream(fs, "root", query);
}

async function DESCRIBE({ fs, dir, storage, federation }, query) {
    const dirMind = await locate(fs, dir, "root");

    return db.buildRecord(fs, "root", query);
}

async function DELETE({ fs, dir, federation, storage }, query) {
    const dirCatalog = await locate(fs, dir, "root");

    //await storage.sparql(dirMind, { kind: "DELETE", query });
    // do we even need mutation or should just rebuild
    await db.deleteRecord(fs, "root", query);

    //await federation.settle();
    await git.commit(fs, "root");

    try {
        await git.resolve(fs, "root");
    } catch {
        // do nothing
    }

    const dirMind = await locate(fs, dir, query.mind);

    await rimraf(fs, dirMind);
}

async function UPDATE({ fs, dir, federation, storage }, query) {
    const dirCatalog = await locate(fs, dir, "root");

    //await storage.sparql(dirMind, { kind: "DELETE", query });
    // do we even need mutation or should just rebuild
    await updateRecord(fs, "root", query);

    //await federation.settle();
    //await git.commit(fs, "root");

    //const syncResult = await git.resolve(fs, mind);
}

async function sparql(providers, { kind, query }) {
    switch (kind) {
        case "SELECT":
            return SELECT(providers, query);

        case "DESCRIBE":
            return DESCRIBE(providers, query);

        case "UPDATE":
            return UPDATE(providers, query);

        case "DELETE":
            await DELETE(providers, query);
    }
}

export default (providers) => {
    return {
        locate: async (mind) => resolve(providers, mind),
        //induct: (mind) => induct(providers, mind),
        //retire: (mind) => retire(providers, mind),
        //EXPORT: (mind) => zip(providers, mind),
        sparql: async (query) => sparql(providers, query),
        rebuild: async () => rebuild(providers),
        //settle,
    };
};
