import path from "path";
import csvs from "@/providers/csvs.js";
import { recordsToMind, mindToRecords } from "@/providers/pure.js";
import catalogSchemaRecord from "@/providers/catalog_schema_record.json";
import catalogBranchRecords from "@/providers/catalog_branch_records.json";

async function locate({ fs, dir }, mind) {
  const entries = await fs.promises.readdir(dir);

  for (const entry of entries) {
    const entryPath = `${dir}/${entry}`;

    // check csvs/.csvs.csv for uuid/id match
    try {
      const storage = csvs(fs, entryPath);
      const [versionRecord] = await Array.fromAsync(
        storage.sparql({ kind: "SELECT", query: { _: "." } }),
      );

      if (versionRecord) {
        const foundUuid = versionRecord.uuid ?? versionRecord.id;

        if (foundUuid === mind) {
          return entryPath;
        }
      }
    } catch (e) {
      // no .csvs.csv, fall through
    }

    // fallback: match folder name
    if (entry === mind) {
      return entryPath;
    }
  }

  return undefined;
}

async function retire({ fs, dir }, mind) {
  const dirMind = await locate({ fs, dir }, mind);

  try {
    await fs.promises.rm(dirMind, { recursive: true });
  } catch (e) {
    console.log(e);
  }
}

async function describeMind({ fs, dir, federation }, mind) {
  const dirMind = await locate({ fs, dir }, mind);

  const name = path.basename(dirMind);

  const storageMind = csvs(fs, dirMind);

  // read uuid from csvs/.csvs.csv version record
  const [versionRecord] = await Array.fromAsync(
    storageMind.sparql({ kind: "SELECT", query: { _: "." } }),
  );

  const uuid =
    versionRecord && (versionRecord.uuid ?? versionRecord.id)
      ? (versionRecord.uuid ?? versionRecord.id)
      : mind;

  const [schemaRecord] = await Array.fromAsync(
    storageMind.sparql({
      kind: "SELECT",
      query: { _: "_" },
    }),
  );

  // extract all branch names from the schema (trunks and leaves)
  const schemaRelations = Object.entries(schemaRecord).filter(
    ([key]) => key !== "_",
  );

  const branchNames = [...new Set(schemaRelations.flat(Infinity))];

  // buildRecord each branch with prose to get @en/@ru
  const branchRecords = await Promise.all(
    branchNames.map(async (branchName) => {
      const [described] = await Array.fromAsync(
        storageMind.sparql({
          kind: "DESCRIBE",
          query: { _: "branch", branch: branchName },
        }),
      );

      return described;
    }),
  );

  const { url, token } = await federation.getOrigin(dirMind);

  return recordsToMind(uuid, name, schemaRecord, branchRecords, url, token);
}

async function rebuild({ fs, dir, federation }) {
  await retire({ fs, dir }, "root");

  const dirCatalog = path.join(dir, "root");

  await fs.promises.mkdir(dirCatalog);

  const storage = csvs(fs, dirCatalog);

  await Array.fromAsync(
    storage.sparql({ kind: "UPDATE", query: catalogSchemaRecord }),
  );

  for (const branchRecord of catalogBranchRecords) {
    await Array.fromAsync(
      storage.sparql({ kind: "UPDATE", query: branchRecord }),
    );
  }

  const minds = await fs.promises.readdir(dir);

  for (const mindPath of minds) {
    // skip the root catalog itself
    if (mindPath === "root") continue;

    const dirMind = path.join(dir, mindPath);

    // read uuid from csvs/.csvs.csv version record
    const storageMind = csvs(fs, dirMind);
    let versionRecord;
    try {
      [versionRecord] = await Array.fromAsync(
        storageMind.sparql({ kind: "SELECT", query: { _: "." } }),
      );
    } catch (e) {
      console.log(`catalog::rebuild skipping ${mindPath} — no .csvs.csv`);
      continue;
    }

    const uuid = versionRecord && (versionRecord.uuid ?? versionRecord.id);

    if (!uuid) {
      console.log(
        `catalog::rebuild skipping ${mindPath} — no uuid in .csvs.csv`,
      );
      continue;
    }

    const mind = await describeMind({ fs, dir, federation }, uuid);

    // write to catalog
    await Array.fromAsync(storage.sparql({ kind: "UPDATE", query: mind }));
  }

  // init & commit catalog
  await federation.settle(dirCatalog);
}

async function induct({ fs, dir, federation }, record) {
  const mind = record.mind;

  // if no name, use uuid as name
  const nameRaw = Array.isArray(record.name) ? record.name[0] : record.name;
  const name = nameRaw !== undefined ? nameRaw : mind;

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

  // if folder name collides with a different uuid, use name-uuid
  let dirMindNew = `${dir}/${name}`;
  if (isNew) {
    let folderExists = false;
    try {
      await fs.promises.stat(dirMindNew);
      folderExists = true;
    } catch (e) {
      // doesn't exist, good
    }

    if (folderExists) {
      let existingUuid;
      try {
        const s = csvs(fs, dirMindNew);
        const [vr] = await Array.fromAsync(
          s.sparql({ kind: "SELECT", query: { _: "." } }),
        );
        existingUuid = vr && (vr.uuid ?? vr.id);
      } catch (e) {
        // no .csvs.csv
      }

      if (existingUuid !== mind) {
        dirMindNew = `${dir}/${name}-${mind}`;
      }
    }
  }

  // if record has origin_url it can be cloned
  const hasURL = origin.url !== undefined;

  if (isNew) {
    if (hasURL) {
      // clone
      await federation.settle(dirMindNew, origin);

      // read uuid from cloned repo's version record
      const clonedStorage = csvs(fs, dirMindNew);

      let clonedVersion;

      try {
        [clonedVersion] = await Array.fromAsync(
          clonedStorage.sparql({ kind: "SELECT", query: { _: "." } }),
        );
      } catch (e) {
        // no .csvs.csv
      }

      const clonedUuid =
        clonedVersion && (clonedVersion.uuid ?? clonedVersion.id);

      if (!clonedUuid) {
        console.log(
          `catalog::induct cloned repo has no uuid, skipping ${dirMindNew}`,
        );
        return;
      }

      const mindRecord = await describeMind(
        { fs, dir, federation },
        clonedUuid,
      );

      const dirCatalog = path.join(dir, "root");

      const storage = csvs(fs, dirCatalog);

      await Array.fromAsync(
        storage.sparql({ kind: "UPDATE", query: mindRecord }),
      );

      return;
    } else {
      await fs.promises.mkdir(dirMindNew);

      // write uuid to csvs/.csvs.csv version record
      const newStorage = csvs(fs, dirMindNew);
      await Array.fromAsync(
        newStorage.sparql({ kind: "UPDATE", query: { _: ".", uuid: mind } }),
      );
    }
  } else {
    await fs.promises.rename(dirMind, dirMindNew);
  }

  const storage = csvs(fs, dirMindNew);

  const [schemaRecord, ...metaRecords] = mindToRecords(record.branch);

  await Array.fromAsync(
    storage.sparql({ kind: "UPDATE", query: schemaRecord }),
  );

  for (const metaRecord of metaRecords) {
    await Array.fromAsync(
      storage.sparql({ kind: "UPDATE", query: metaRecord }),
    );
  }

  // gitinit add commit set remote & token
  await federation.settle(dirMindNew, origin);
}

function describe(providers, query) {
  const queries = Array.isArray(query) ? query : [query];

  const dirRoot = path.join(providers.dir, "root");

  const storage = csvs(providers.fs, dirRoot);

  async function* generate() {
    for (const q of queries) {
      if (q._ === "mind" && q.mind === "root") {
        yield await describeMind(providers, q.mind);
      } else {
        const stream = storage.sparql({ kind: "DESCRIBE", query: q });

        for await (const entry of stream) {
          yield entry;
        }
      }
    }
  }

  const iter = generate();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iter.next();

      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

export default (providers) => {
  return {
    locate: (mind) => locate(providers, mind),
    retire: (mind) => retire(providers, mind),
    rebuild: () => rebuild(providers),
    induct: (record) => induct(providers, record),
    describe: (query) => describe(providers, query),
  };
};
