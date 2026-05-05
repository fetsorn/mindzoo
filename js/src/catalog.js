import path from "path";
import db from "@/db.js";
import {
    recordsToMind,
    schemaToBranchRecords,
    extractSchemaRecords,
} from "@/pure.js";
import { rimraf } from "./io.js";
import git from "./git.js";
import schemaRoot from "@/proxy/default_root_schema.json";

async function rebuild({ fs, dir, federation, storage }) {
    const dirCatalog = path.join(dir, "root");

    const minds = await fs.promises.readdir(dir);

    if (minds.includes("root")) {
        await rimraf(fs, dirCatalog);
    }

    await git.gitinit(fs, "root");

    await db.csvsinit(fs, "root");

    const schemaRecord = {
        _: "_",
        mind: ["name", "category", "branch", "origin_url"],
        branch: [
            "trunk",
            "task",
            "cognate",
            "description_en",
            "description_ru",
        ],
        origin_url: ["origin_token"],
    };

    await db.updateRecord(fs, "root", schemaRecord);

    for (const mindPath of minds) {
        // get name from layout
        const dirMind = path.join(dir, mindPath);

        // get name from uuid-name
        const [uuid, name] = mindPath.split("-");

        // fetch schema from mind
        const [schemaRecord] = await db.select(fs, uuid, { _: "_" });

        const branchRecords = await db.select(fs, uuid, { _: "branch" });

        // get remote and token from git
        const { url, token } = git.getOrigin(fs, uuid);

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

async function describe({ fs, dir, storage, federation }, query) {
    await rebuild({ fs, dir, federation, storage });

    const dirMind = await locate(fs, dir, "root");

    return db.buildRecord(fs, "root", query);
}

async function sparql(providers, { kind, query }) {
    switch (kind) {
        //case "SELECT":
        //    return SELECT(providers, query);

        case "DESCRIBE":
            return describe(providers, query);

        //case "UPDATE":
        //    return UPDATE(providers, query);

        //case "DELETE":
        //    await DELETE(providers, query);
    }
}

export default (providers) => {
    return {
        //locate: (mind) => resolve(providers, mind),
        //induct: (mind) => induct(providers, mind),
        //retire: (mind) => retire(providers, mind),
        //EXPORT: (mind) => zip(providers, mind),
        sparql: (query) => sparql(providers, query),
        //settle,
    };
};
