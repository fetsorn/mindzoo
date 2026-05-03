import {
  saveMindRecord,
  loadMindRecord,
  updateMind,
  updateEntry,
  resolve,
} from "@/proxy/record.js";
import db from "@/db.js";

/**
 * This
 * @name updateRecord
 * @function
 * @param {object} mind -
 * @param {String} base -
 * @param {object} recordNew -
 */
export async function updateRecord(fs, mind, recordNew) {
  const isHomeScreen = mind === "root";

  const isMindBranch = recordNew._ === "mind";

  const canSaveMind = isHomeScreen && isMindBranch;

  if (canSaveMind) {
    await saveMindRecord(fs, recordNew);
  } else {
    await updateEntry(fs, mind, recordNew);
  }

  try {
    const syncResult = await resolve(fs, mind);

    //setProxyStore(
    //  produce((state) => {
    //    state.mergeResult = syncResult.ok;
    //    state.syncError = undefined;
    //  }),
    //);
  } catch (e) {
    // sync is best-effort after local save — surface but don't throw
    console.error("sync after save failed:", e);
    //setProxyStore("syncError", e?.message ?? String(e));
  }
}

export async function buildRecord(fs, mind, record) {
  const fetched = await db.buildRecord(fs, mind, record);

  const isHomeScreen = mind === "root";

  const recordNew = isHomeScreen ? await loadMindRecord(fs, fetched) : fetched;

  return recordNew;
}
