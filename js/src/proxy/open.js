import {
  enrichBranchRecords,
  schemaToBranchRecords,
  digestMessage,
} from "@/proxy/pure.js";
import git from "@/git.js";
import db from "@/db.js";

/**
 * This
 * @name find
 * @function
 * @param {String} mind -
 * @param {String} name -
 * @returns {object}
 */
export async function find(fs, mind, name) {
  console.log("[proxy] find", { mind, name });
  if (mind === "root")
    return {
      mind: { _: "mind", mind: "root", name: "minds" },
    };

  const mindPartial = mind !== undefined ? { mind: mind } : {};

  const namePartial = name !== undefined ? { name } : {};

  const query = {
    _: "mind",
    ...mindPartial,
    ...namePartial,
  };

  // find mind in root folder
  const [mindRecord] = await db.select(fs, "root", query);

  if (mindRecord === undefined) throw Error("where is my mind");

  return { mind: mindRecord };
}

/**
 * This
 * @name clone
 * @function
 * @param {String} mind -
 * @param {String} name -
 * @param {String} url -
 * @param {String} token -
 * @returns {object}
 */
export async function clone(fs, mind, url, token) {
  console.log("[proxy] clone", { mind, url, token });
  // if uri specifies a remote
  // try to clone remote
  // where mind string is a digest of remote
  // and mind name is uri-encoded remote
  const mindRemote = mind ?? (await digestMessage(url));

  await git.clone(fs, mindRemote, { url, token });

  // TODO validate and sanitize cloned dataset, get uuid

  const pathname = new URL(url).pathname;

  // get mind name from remote
  const nameClone = pathname.substring(pathname.lastIndexOf("/") + 1);

  const [schemaRecordClone] = await db.select(fs, mindRemote, { _: "_" });

  const metaRecordsClone = await db.select(fs, mindRemote, { _: "branch" });

  const branchRecordsClone = enrichBranchRecords(
    schemaRecordClone,
    metaRecordsClone,
  );

  const recordClone = {
    _: "mind",
    mind: mindRemote,
    name: nameClone,
    branch: branchRecordsClone,
    origin_url: {
      _: "origin_url",
      origin_url: url,
      origin_token: token,
    },
  };

  return recordClone;
}
