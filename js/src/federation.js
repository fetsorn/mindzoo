import { commit } from "./git.js";

async function settle(fs, dir, origin) {
    // clone

    // init

    // commit
    await commit(fs, dir);

    // fetch

    // merge

    // push
}

export default (fs) => {
    return { settle: (dir) => settle(fs, dir) };
};
