import path from "path";
import csvs from "@/providers/csvs.js";
import { zip } from "@/providers/zip.js";
import { recordsToMind, mindToRecords } from "@/providers/pure.js";
import catalogSchemaRecord from "@/providers/catalog_schema_record.json";
import catalogBranchRecords from "@/providers/catalog_branch_records.json";

async function locate({ fs, dir }, mind) {
  const existingMind = (await fs.promises.readdir(dir)).find(
    (m) => m === mind || m.startsWith(mind + "-"),
  );

  if (existingMind === undefined) {
    return undefined;
  } else {
    return `${dir}/${existingMind}`;
  }
}

async function retire({ fs, dir }, mind) {
  const dirMind = await locate({ fs, dir }, mind);

  try {
    await fs.promises.rm(dirMind, { recursive: true });
  } catch (e) {
    console.log(e);
  }
}

async function rebuild({ fs, dir, federation }) {
  await retire({ fs, dir }, "root");

  const dirCatalog = path.join(dir, "root");

  await fs.promises.mkdir(dirCatalog);

  const storage = csvs(fs, dirCatalog);

  await storage.sparql({ kind: "UPDATE", query: catalogSchemaRecord });

  for (const branchRecord of catalogBranchRecords) {
    await storage.sparql({ kind: "UPDATE", query: branchRecord });
  }

  const minds = await fs.promises.readdir(dir);

  for (const mindPath of minds) {
    // get name from layout
    const dirMind = path.join(dir, mindPath);

    // get name from uuid-name
    const [uuid, name] = mindPath.split("-");

    // fetch schema from mind
    const storageMind = csvs(fs, dirMind);

    const [schemaRecord] = await Array.fromAsync(
      await storageMind.sparql({
        kind: "SELECT",
        query: { _: "_" },
      }),
    );

    const branchRecords = await Array.fromAsync(
      await storageMind.sparql({
        kind: "SELECT",
        query: { _: "branch" },
      }),
    );

    // get remote and token from git
    const { url, token } = await federation.getOrigin(dirMind);

    // records to mind
    const mind = recordsToMind(
      uuid,
      name,
      schemaRecord,
      branchRecords,
      url,
      token,
    );

    // write to catalog
    await storage.sparql({ kind: "UPDATE", query: mind });
  }

  // init & commit catalog
  await federation.settle(dirCatalog);
}

async function induct({ fs, dir, federation }, record) {
  const mind = record.mind;

  const name = Array.isArray(record.name) ? record.name[0] : record.name;

  const origin_url = Array.isArray(record.origin_url)
    ? record.origin_url[0]
    : record.origin_url;

  const origin = {
    url: origin_url !== undefined ? origin_url.origin_url : origin_url,
    token:
      origin_url !== undefined && typeof origin_url === "object"
        ? origin_url.origin_token
        : undefined,
  };

  // search root for mind
  const dirMind = await locate({ fs, dir }, record.mind);

  const isNew = dirMind === undefined;

  const dirMindNew = `${dir}/${mind}${name !== undefined ? `-${name}` : ""}`;

  // if record has origin_url it can be cloned
  const hasURL = origin.url !== undefined;

  if (isNew) {
    if (hasURL) {
      // clone
      await federation.settle(dirMindNew, origin);
    } else {
      await fs.promises.mkdir(dirMindNew);
    }
  } else {
    await fs.promises.rename(dirMind, dirMindNew);
  }

  const storage = csvs(fs, dirMindNew);

  const [schemaRecord, ...metaRecords] = mindToRecords(record.branch);

  await storage.sparql({ kind: "UPDATE", query: schemaRecord });

  for (const metaRecord of metaRecords) {
    await storage.sparql({ kind: "UPDATE", query: metaRecord });
  }

  // gitinit add commit set remote & token
  await federation.settle(dirMindNew, origin);
}

async function archive({ fs, dir }, mind) {
  const dirMind = await locate({ fs, dir }, mind);

  return zip(fs, dirMind);
}

export default (providers) => {
  return {
    locate: (mind) => locate(providers, mind),
    retire: (mind) => retire(providers, mind),
    rebuild: () => rebuild(providers),
    induct: (record) => induct(providers, record),
    archive: (mind) => archive(providers, mind),
  };
};
