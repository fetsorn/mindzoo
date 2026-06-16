import path from "path";
import csvs from "@/providers/csvs.js";
import { recordsToMind, mindToRecords } from "@/providers/pure.js";
import catalogSchemaRecord from "@/providers/catalog_schema_record.json";
import catalogBranchRecords from "@/providers/catalog_branch_records.json";

async function locate({ fs, dir }, mind) {
  const entries = await fs.promises.readdir(dir);

  let found;
  let fallback;

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
          if (found) {
            console.warn(`duplicate uuid ${mind}: ${found} and ${entryPath}`);
          } else {
            found = entryPath;
          }
        }
      }
    } catch (e) {
      // no .csvs.csv, fall through
    }

    // fallback: match folder name
    if (!fallback && entry === mind) {
      fallback = entryPath;
    }
  }

  return found ?? fallback;
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

async function collectMindValues(fs, mindDir) {
  const values = new Set();
  const csvsDir = path.join(mindDir, "csvs");

  let entries;

  try {
    entries = await fs.promises.readdir(csvsDir);
  } catch (e) {
    return values;
  }

  for (const name of entries) {
    // only data tablets: must contain "-", end with ".csv", skip schema and version
    if (
      !name.endsWith(".csv") ||
      !name.includes("-") ||
      name === "_-_.csv" ||
      name === ".csvs.csv"
    ) {
      continue;
    }

    let content;

    try {
      content = await fs.promises.readFile(path.join(csvsDir, name), "utf8");
    } catch (e) {
      continue;
    }

    for (const line of content.split("\n")) {
      if (!line) continue;

      // simple two-column CSV parse: split on first comma
      const idx = line.indexOf(",");

      if (idx === -1) continue;

      const key = line.slice(0, idx).replace(/^"|"$/g, "");
      const val = line.slice(idx + 1).replace(/^"|"$/g, "");

      if (key) values.add(key);
      if (val) values.add(val);
    }
  }

  console.log(
    `catalog::collectMindValues ${mindDir} => ${values.size} distinct values`,
  );

  return values;
}

async function rebuild({ fs, dir, federation }) {
  await retire({ fs, dir }, "root");

  const dirCatalog = path.join(dir, "root");

  await fs.promises.mkdir(dirCatalog);

  const storageCatalog = csvs(fs, dirCatalog);

  await Array.fromAsync(
    storageCatalog.sparql({ kind: "UPDATE", query: catalogSchemaRecord }),
  );

  for (const branchRecord of catalogBranchRecords) {
    await Array.fromAsync(
      storageCatalog.sparql({ kind: "UPDATE", query: branchRecord }),
    );
  }

  const minds = await fs.promises.readdir(dir);

  // collect value sets for overlap computation
  const valueSets = [];

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

    // collect all distinct values from data tablets
    const values = await collectMindValues(fs, dirMind);
    const entityCount = values.size;

    const mind = await describeMind({ fs, dir, federation }, uuid);

    // write mind entry to catalog
    await Array.fromAsync(
      storageCatalog.sparql({ kind: "UPDATE", query: mind }),
    );

    // write entity_count for this mind
    await Array.fromAsync(
      storageCatalog.sparql({
        kind: "UPDATE",
        query: {
          _: "mind",
          mind: uuid,
          entity_count: String(entityCount),
        },
      }),
    );

    valueSets.push({ uuid, values });
  }

  // compute pairwise overlaps (deduped: mind_a < mind_b lexicographically)
  for (let i = 0; i < valueSets.length; i++) {
    for (let j = i + 1; j < valueSets.length; j++) {
      let cardinality = 0;

      for (const v of valueSets[i].values) {
        if (valueSets[j].values.has(v)) cardinality++;
      }

      if (cardinality === 0) continue;

      const [mindA, mindB] =
        valueSets[i].uuid <= valueSets[j].uuid
          ? [valueSets[i].uuid, valueSets[j].uuid]
          : [valueSets[j].uuid, valueSets[i].uuid];

      const overlapId = `${mindA}-${mindB}`;

      console.log(
        `catalog::rebuild overlap ${mindA} ∩ ${mindB} = ${cardinality}`,
      );

      await Array.fromAsync(
        storageCatalog.sparql({
          kind: "UPDATE",
          query: {
            _: "overlap",
            overlap: overlapId,
            mind_a: mindA,
            mind_b: mindB,
            cardinality: String(cardinality),
          },
        }),
      );
    }
  }

  // init & commit catalog
  await federation.settle(dirCatalog);
}

async function induct({ fs, dir, federation }, record) {
  const mind = record.mind;

  // if no name, use uuid as name
  const nameRaw = Array.isArray(record.name) ? record.name[0] : record.name;
  const name = nameRaw !== undefined ? nameRaw : mind;

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

  if (isNew) {
    await fs.promises.mkdir(dirMindNew);

    // write uuid to csvs/.csvs.csv version record
    const newStorage = csvs(fs, dirMindNew);

    await Array.fromAsync(
      newStorage.sparql({
        kind: "UPDATE",
        query: { _: ".", version: "0.0.4", uuid: mind },
      }),
    );
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

  // extract origin for settle (set remote + sync)
  const origin_url = Array.isArray(record.origin_url)
    ? record.origin_url[0]
    : record.origin_url;

  const origin =
    origin_url !== undefined && typeof origin_url === "object"
      ? {
          url: origin_url.origin_url,
          token: origin_url.origin_token,
        }
      : undefined;

  // gitinit add commit set remote & token
  await federation.settle(dirMindNew, origin);

  // write mind entry to root catalog so SELECT finds it immediately
  const dirCatalog = path.join(dir, "root");
  const catalogStorage = csvs(fs, dirCatalog);
  const mindEntry = await describeMind({ fs, dir, federation }, mind);

  await Array.fromAsync(
    catalogStorage.sparql({ kind: "UPDATE", query: mindEntry }),
  );

  await federation.settle(dirCatalog);
}

function describe(providers, query) {
  const queries = Array.isArray(query) ? query : [query];

  const dirRoot = path.join(providers.dir, "root");

  const storage = csvs(providers.fs, dirRoot);

  async function* generate() {
    for (const q of queries) {
      if (q._ === "mind" && q.mind === "root") {
        yield await describeMind(providers, "root");
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

async function merge({ fs, dir, federation }, mind, strategy) {
  console.log(`catalog::merge start`);
  const dirMind = await locate({ fs, dir }, mind);

  // read old uuid before merge (may change after theirs)
  const storageMind = csvs(fs, dirMind);
  const [oldVersion] = await Array.fromAsync(
    storageMind.sparql({ kind: "SELECT", query: { _: "." } }),
  );
  const oldUuid = oldVersion && (oldVersion.uuid ?? oldVersion.id);

  await federation.merge(dirMind, strategy);

  // read new uuid after merge
  const [newVersion] = await Array.fromAsync(
    csvs(fs, dirMind).sparql({ kind: "SELECT", query: { _: "." } }),
  );
  const newUuid = (newVersion && (newVersion.uuid ?? newVersion.id)) || oldUuid;

  // rebuild this mind's entry in the root catalog
  const dirCatalog = path.join(dir, "root");
  const catalogStorage = csvs(fs, dirCatalog);
  const mindEntry = await describeMind({ fs, dir, federation }, newUuid);

  // if uuid changed, delete the old catalog entry
  if (oldUuid && newUuid && oldUuid !== newUuid) {
    await Array.fromAsync(
      catalogStorage.sparql({
        kind: "DELETE",
        query: { _: "mind", mind: oldUuid },
      }),
    );
  }

  await Array.fromAsync(
    catalogStorage.sparql({ kind: "UPDATE", query: mindEntry }),
  );

  await federation.settle(dirCatalog);

  console.log(`catalog::merge complete`);
}

export default (providers) => {
  return {
    locate: (mind) => locate(providers, mind),
    retire: (mind) => retire(providers, mind),
    rebuild: () => rebuild(providers),
    induct: (record) => induct(providers, record),
    describe: (query) => describe(providers, query),
    merge: (mind, strategy) => merge(providers, mind, strategy),
  };
};
