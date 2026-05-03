import csvs from "@fetsorn/csvs-js";
import { findMind } from "@/io.js";

export async function csvsinit(fs, mind) {
    const dir = await findMind(fs, mind);

    await csvs.init({ fs, dir });
}

export async function select(fs, mind, query) {
    const dir = await findMind(fs, mind);

    const records = await csvs.selectRecord({
        fs,
        dir,
        query,
    });

    return records ?? [];
}

export async function buildRecord(fs, mind, record) {
    const dir = await findMind(fs, mind);

    return csvs.buildRecord({ fs, dir, query: [record] });
}

export async function selectStream(fs, mind, record) {
    const dir = await findMind(fs, mind);

    return csvs.selectRecordStreamPull({
        fs,
        dir,
        query: record,
        light: true,
    });
}

export async function updateRecord(fs, mind, record) {
    const dir = await findMind(fs, mind);

    await csvs.updateRecord({
        fs,
        dir,
        query: record,
    });
}

export async function deleteRecord(fs, mind, record) {
    const dir = await findMind(fs, mind);

    await csvs.deleteRecord({
        fs,
        dir,
        query: record,
    });
}

export default {
    csvsinit,
    select,
    buildRecord,
    selectStream,
    updateRecord,
    deleteRecord,
};
