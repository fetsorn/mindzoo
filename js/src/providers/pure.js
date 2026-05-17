export function recordsToMind(
  uuid,
  name,
  schemaRecord,
  metaRecords,
  url,
  token,
) {
  // [[branch1, [branch2]]]
  const schemaRelations = Object.entries(schemaRecord).filter(
    ([key]) => key !== "_",
  );

  // list of unique branches in the schema
  const branches = [...new Set(schemaRelations.flat(Infinity))];

  // for each branch in the schema, put trunk into its metarecord
  const branchRecords = branches.map((branch) => {
    const metaRecord =
      metaRecords.find((record) => record.branch === branch) ?? {};

    const trunks = schemaRelations.reduce((accTrunk, [trunk, leaves]) => {
      const trunkPartial = leaves.includes(branch) ? [trunk] : [];

      return [...accTrunk, ...trunkPartial];
    }, []);

    const trunkPartial = trunks.length > 0 ? { trunk: trunks } : {};

    return { _: "branch", branch, ...metaRecord, ...trunkPartial };
  });

  const tokenPartial = token !== undefined ? { origin_token: token } : {};

  const originPartial =
    url !== undefined
      ? {
          origin_url: {
            _: "origin_url",
            origin_url: url,
            ...tokenPartial,
          },
        }
      : {};

  const mind = {
    _: "mind",
    mind: uuid,
    name,
    branch: branchRecords,
    ...originPartial,
  };

  return mind;
}

/**
 * This extracts schema record with trunks from branch records
 * @name mindToRecords
 * @function
 * @param {object} branchRecords -
 * @returns {object[]}
 */
// Extract base value string from a value that may be a string or an object
// with prose (e.g. { _: "trunk", trunk: "event", "@en": "Record" } → "event")
function baseValue(v) {
  if (typeof v === "object" && v !== null && v._ !== undefined) return v[v._];
  return v;
}

export function mindToRecords(branchRecords) {
  const records = branchRecords.reduce(
    (withBranch, branchRecord) => {
      const { trunk, leaf: omit, ...branchRecordOmitted } = branchRecord;

      const trunks = Array.isArray(trunk) ? trunk : [trunk];

      const schemaRecord = trunks
        .filter((t) => t !== undefined)
        .map(baseValue)
        .reduce((withTrunk, trunk) => {
          const leaves = withBranch.schemaRecord[trunk] ?? [];

          const schemaRecord = {
            ...withBranch.schemaRecord,
            [trunk]: [...new Set([baseValue(branchRecord.branch), ...leaves.map(baseValue)])],
          };

          return schemaRecord;
        }, withBranch.schemaRecord);

      const metaRecords = [branchRecordOmitted, ...withBranch.metaRecords];

      return { schemaRecord, metaRecords };
    },
    { schemaRecord: { _: "_" }, metaRecords: [] },
  );

  return [records.schemaRecord, ...records.metaRecords];
}
