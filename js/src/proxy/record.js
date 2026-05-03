import {
  readRemoteTags,
  //readLocalTags,
  writeRemoteTags,
  //writeLocalTags,
} from "@/proxy/tags.js";
import {
  extractSchemaRecords,
  enrichBranchRecords,
  schemaToBranchRecords,
  recordsToSchema,
} from "@/proxy/pure.js";
import { clone } from "@/proxy/open.js";
import schemaRoot from "@/proxy/default_root_schema.json";
import git from "@/git.js";
import io from "@/io.js";
import db from "@/db.js";

/**
 * This
 * @name readSchema
 * @export function
 * @param {String} mind -
 * @returns {object}
 */
export async function readSchema(fs, mind) {
  if (mind === "root") {
    return schemaRoot;
  }

  const [schemaRecord] = await db.select(fs, mind, { _: "_" });

  const branchRecords = await db.select(fs, mind, { _: "branch" });

  const schema = recordsToSchema(schemaRecord, branchRecords);

  return schema;
}

/**
 * This
 * @name sync
 * @export function
 * @param {String} mind
 * @param {String} remoteUrl
 * @param {String} remoteToken
 */
export async function resolve(fs, mind) {
  console.log("[proxy] resolve", { mind });
  const tagsRemote = await readRemoteTags(fs, mind);

  let resolveResult = { ok: true };

  for (const tagRemote of tagsRemote) {
    const resolvePartial = await git.resolve(fs, mind, {
      url: tagRemote.origin_url,
      token: tagRemote.origin_token,
    });

    resolveResult.ok = resolveResult.ok && resolvePartial.ok;
  }

  console.log("[proxy] resolve", { mind, resolveResult });

  return resolveResult;
}

/**
 * This loads git state and schema from folder into the record
 * @name loadMindRecord
 * @export function
 * @param {object} record
 * @returns {object}
 */
export async function loadMindRecord(fs, record) {
  const mind = record.mind;

  const [schemaRecord] = await db.select(fs, mind, { _: "_" });

  // query {_:branch}
  const metaRecords = await db.select(fs, mind, { _: "branch" });

  // add trunk field from schema record to branch records
  const branchRecords = enrichBranchRecords(schemaRecord, metaRecords);

  const branchPartial = { branch: branchRecords };

  const tagsRemote = await readRemoteTags(fs, mind);

  // get remote
  const tagsRemotePartial =
    tagsRemote.length > 0 ? { origin_url: tagsRemote } : {};

  //const tagsLocal = await readLocalTags(fs, mind);

  // get locals
  //const tagsLocalPartial = tagsLocal.length > 0 ? { local_tag: tagsLocal } : {};

  const recordNew = {
    ...record,
    ...branchPartial,
    ...tagsRemotePartial,
    //  ...tagsLocalPartial,
  };

  return recordNew;
}

async function mindIsNew(fs, mind) {
  const query = {
    _: "mind",
    mind,
  };

  // find mind in root folder
  const mindRecords = await db.select(fs, "root", query);

  return mindRecords === undefined || mindRecords.length === 0;
}

/**
 * This writes schema and git state
 * @name saveMindRecord
 * @export function
 * @param {object} record
 */
export async function saveMindRecord(fs, record) {
  console.log("[proxy] saveMindRecord", {
    mind: record.mind,
    name: record.name,
    hasOrigin: !!record.origin_url,
  });
  const mind = record.mind;

  // create mind directory
  const name = Array.isArray(record.name) ? record.name[0] : record.name;

  const origin = Array.isArray(record.origin_url)
    ? record.origin_url[0]
    : record.origin_url;

  // if record has origin_url it can be cloned
  const hasURL = origin !== undefined && origin.origin_url !== undefined;

  // search root for mind
  const isNew = await mindIsNew(fs, mind);

  // TODO this is not strictly correct because if clone fails
  // it should fall through to the initialization

  console.log("[proxy] saveMindRecord", { hasURL, isNew, mind });

  if (hasURL && isNew) {
    console.log("[proxy] saveMindRecord: cloning", {
      mind,
      url: origin.origin_url,
    });
    // pass a uuid to clone so that it can clone to proper place
    const recordClone = await clone(
      fs,
      mind,
      origin.origin_url,
      origin.origin_token,
    );

    const recordNew = { ...recordClone, mind };

    await updateMind(fs, recordNew);

    // if there is no such mind
    //if (mindExists === false) {
    //} else {
    //  // TODO if there is such remote, do nothing
    //  // TODO if this is a new remote, ask user
    //  // TODO if user rejects, do nothing
    //  // TODO if user approves write new remote to mind
    //}

    console.log("[proxy] saveMindRecord: clone done", { mind });
    // no need to write schema or init since clone has everything
    return undefined;
  }

  if (isNew) {
    try {
      await updateMind(fs, record);

      // fails if exists
      await git.gitinit(fs, mind, name);

      await db.csvsinit(fs, mind);

      //await lfs.createLFS(fs, mind);
    } catch (e) {
      // EEXIST if repo is in fs but not root dataset
      // should never happen
      console.log(e);
    }
  } else {
    console.log("repo exists, renaming");
    await updateMind(fs, record);

    await io.rename(fs, mind, name);
  }

  // extract schema record with trunks from branch records
  const [schemaRecord, ...metaRecords] = extractSchemaRecords(record.branch);

  // write schema to mind
  await db.updateRecord(fs, mind, schemaRecord);

  for (const metaRecord of metaRecords) {
    await db.updateRecord(fs, mind, metaRecord);
  }

  // write remotes to .git/config
  await writeRemoteTags(fs, mind, record.origin_url);

  // write locals to .git/config
  //await writeLocalTags(fs, mind, record.local_tag);

  await git.commit(fs, mind);

  return undefined;
}

/**
 * This
 * @name deleteRecord
 * @export function
 * @param {object} mind -
 * @param {object} record -
 */
export async function deleteRecord(fs, mind, record) {
  await db.deleteRecord(fs, mind, record);

  await git.commit(fs, mind);

  try {
    const syncResult = await resolve(fs, mind);

    //setProxyStore(
    //  produce((state) => {
    //    state.mergeResult = syncResult.ok;
    //    state.syncError = undefined;
    //  }),
    //);
  } catch (e) {
    // sync is best-effort after local delete — surface but don't fail
    console.error("sync after delete failed:", e);
    //setProxyStore("syncError", e?.message ?? String(e));
  }
}

/**
 * This
 * @name updateMind
 * @export function
 * @param {object} recordNew -
 */
export async function updateMind(fs, recordNew) {
  // won't save root/branch-trunk.csv to disk as it's read from mind/_-_.csv
  // TODO move this outside and merge updateMind with updateEntry
  const branchesPartial =
    recordNew.branch !== undefined
      ? {
          branches: recordNew.branch.map(
            // eslint-disable-next-line
            ({ trunk, ...branchWithoutTrunk }) => branchWithoutTrunk,
          ),
        }
      : {};

  const recordPruned = { ...recordNew, ...branchesPartial };

  await db.updateRecord(fs, "root", recordPruned);

  await git.commit(fs, "root");
}

/**
 * This
 * @name updateEntry
 * @export function
 * @param {object} mind -
 * @param {object} recordNew -
 */
export async function updateEntry(fs, mind, recordNew) {
  await db.updateRecord(fs, mind, recordNew);

  await git.commit(fs, mind);
}

/**
 * This
 * @name createCatalog
 * @export function
 */
export async function createCatalog(fs) {
  try {
    // fails if root exists
    await git.gitinit(fs, "root");

    await db.csvsinit(fs, "root");

    const branchRecords = schemaToBranchRecords(schemaRoot);

    for (const branchRecord of branchRecords) {
      await db.updateRecord(fs, "root", branchRecord);
    }

    await git.commit(fs, "root");
  } catch (e) {
    if (e.message === "EEXIST") {
      console.log("root exists");
    } else {
      console.log(e);
    }
    // do nothing
  }
}
