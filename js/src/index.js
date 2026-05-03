import { deleteRecord, createCatalog } from "@/proxy/record.js";
import { buildRecord, updateRecord } from "@/proxy/impure.js";
import { open } from "@/proxy/store.js";
import { selectStream } from "@/db.js";

export default {
    createCatalog,
    open,
    selectStream,
    updateRecord,
    deleteRecord,
    buildRecord,
};
