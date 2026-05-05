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

        return { ...metaRecord, ...trunkPartial };
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
    };

    return mind;
}

/**
 * This converts schema to schema record and branch records
 * @name schemaToBranchRecords
 * @function
 * @param {object} schema -
 * @returns {object}
 */
export function schemaToBranchRecords(schema) {
    const records = Object.entries(schema).reduce(
        (withEntry, [branch, { leaves, task, cognate, description }]) => {
            const leavesPartial = withEntry.schemaRecord[branch] ?? [];

            const schemaRecord =
                leaves.length > 0
                    ? {
                          ...withEntry.schemaRecord,
                          [branch]: [...new Set([...leaves, ...leavesPartial])],
                      }
                    : withEntry.schemaRecord;

            const partialEn =
                description && description.en !== undefined
                    ? { description_en: description.en }
                    : {};

            const partialRu =
                description && description.ru !== undefined
                    ? { description_ru: description.ru }
                    : {};

            const partialTask = task ? { task } : {};

            const partialCognate = cognate ? { cognate } : {};

            const metaRecords = [
                ...withEntry.metaRecords,
                {
                    _: "branch",
                    branch,
                    ...partialTask,
                    ...partialCognate,
                    ...partialEn,
                    ...partialRu,
                },
            ];

            return { schemaRecord, metaRecords };
        },
        { schemaRecord: { _: "_" }, metaRecords: [] },
    );

    return [records.schemaRecord, ...records.metaRecords];
}

/**
 * This extracts schema record with trunks from branch records
 * @name extractSchemaRecords
 * @function
 * @param {object} branchRecords -
 * @returns {object[]}
 */
export function extractSchemaRecords(branchRecords) {
    const records = branchRecords.reduce(
        (withBranch, branchRecord) => {
            const { trunk, leaf: omit, ...branchRecordOmitted } = branchRecord;

            const trunks = Array.isArray(trunk) ? trunk : [trunk];

            const schemaRecord = trunks
                .filter((t) => t !== undefined)
                .reduce((withTrunk, trunk) => {
                    const leaves = withBranch.schemaRecord[trunk] ?? [];

                    const schemaRecord = {
                        ...withBranch.schemaRecord,
                        [trunk]: [...new Set([branchRecord.branch, ...leaves])],
                    };

                    return schemaRecord;
                }, withBranch.schemaRecord);

            const metaRecords = [
                branchRecordOmitted,
                ...withBranch.metaRecords,
            ];

            return { schemaRecord, metaRecords };
        },
        { schemaRecord: { _: "_" }, metaRecords: [] },
    );

    return [records.schemaRecord, ...records.metaRecords];
}
