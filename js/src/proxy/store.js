import { readSchema, createCatalog, resolve } from "@/proxy/record.js";
import { changeMind } from "@/proxy/action.js";
import { getDefaultBase } from "@/proxy/pure.js";

/**
 * This
 * @name onMindChange
 * @export function
 * @param {String} pathname -
 * @param {String} searchString -
 */
export async function onMindChange(fs, pathname, searchString) {
  console.log("[proxy] onMindChange", { pathname, searchString });
  //  await queryStore.abortPreviousStream();

  //setQueryStore(
  //  produce((state) => {
  //    // this updates the overview on change of params
  //    // and removes focus from the filter
  //    // erase searchParams to re-render the filter index
  //    state.searchParams = "";
  //    // erase records to re-render the overview
  //    state.recordSet = [];
  //    state.record = undefined;
  //  }),
  //);

  let result;

  // in case of error fallback to root
  try {
    result = await changeMind(fs, pathname, searchString);
  } catch (e) {
    console.error("[proxy] onMindChange: changeMind failed", e);

    // TODO set template to defaultroot
    result = await changeMind(fs, "/", "_=mind");
  }

  const { mind, schema, searchParams, template } = result;

  try {
    const syncResult = await resolve(fs, mind.mind);

    //setProxyStore(
    //  produce((state) => {
    //    state.mergeResult = syncResult.ok;
    //    state.syncError = undefined;
    //  }),
    //);
  } catch (e) {
    // sync is best-effort on navigation — surface but don't fail
    console.error("sync on mind change failed:", e);
    //setProxyStore("syncError", e?.message ?? String(e));
  }

  return { mind, schema, searchParams, template };

  // TODO move to onMount if config true
  //// only search by default in the root mind
  //if (mind.mind === "root") {
  //  // start a search stream
  //  await onSearch(fs);
  //}
}

export async function open(fs, mind) {
  console.log("[proxy] onMindOpen", { mind });
  const schema = await readSchema(fs, mind);
  console.log("[proxy] onMindOpen: schema", schema);

  const base = await getDefaultBase(schema);
  console.log("[proxy] onMindOpen: base", base);

  return onMindChange(fs, `/${mind}`, `_=${base}`);
}
