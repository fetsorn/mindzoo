import git from "isomorphic-git";
import diff3Merge from "diff3";
// move to @fetsorn/isogit-lfs
import { addLFS } from "@/providers/lfs.js";

export const MergeStrategy = Object.freeze({
  AUTO: "auto",
  THEIRS: "theirs",
  OURS: "ours",
});

export async function gitinit(fs, dir) {
  const hasGit = (await fs.promises.readdir(dir)).includes(".git");

  if (!hasGit) {
    await git.init({ fs, dir, defaultBranch: "main" });

    await fs.promises.writeFile(`${dir}/.gitignore`, `.DS_Store`, "utf8");
  }
}

/**
 * This
 * @name commit
 * @function
 * @param {String} mind -
 */
export async function commit(fs, dir) {
  const message = [];

  const matrix = await git.statusMatrix({
    fs,
    dir,
  });

  for (let [filepath, HEADStatus, workingDirStatus, stageStatus] of matrix) {
    if (HEADStatus === workingDirStatus && workingDirStatus === stageStatus) {
      await git.resetIndex({
        fs,
        dir,
        filepath,
      });

      [filepath, HEADStatus, workingDirStatus, stageStatus] =
        await git.statusMatrix({
          fs,
          dir,
          filepaths: [filepath],
        });

      if (HEADStatus === workingDirStatus && workingDirStatus === stageStatus) {
        continue;
      }
    }

    if (workingDirStatus !== stageStatus) {
      let status;

      if (workingDirStatus === 0) {
        status = "deleted";

        await git.remove({
          fs,
          dir,
          filepath,
        });
      } else {
        try {
          // fails if filepath is not lfs
          await addLFS(fs, dir, filepath);
        } catch {
          await git.add({
            fs,
            dir,
            filepath,
          });
        }

        if (HEADStatus === 1) {
          status = "modified";
        } else {
          status = "added";
        }
      }

      message.push(`${filepath} ${status}`);
    }
  }

  if (message.length !== 0) {
    await git.commit({
      fs,
      dir,
      author: {
        name: "name",
        email: "name@mail.com",
      },
      message: message.toString(),
    });
  }
}

export async function setOrigin(fs, dir, origin) {
  await git.addRemote({
    fs,
    dir,
    remote: "origin",
    url: origin.url,
    force: true, // overwrite existing origin
  });

  if (origin.token !== undefined) {
    await git.setConfig({
      fs,
      dir,
      path: `remote.origin.token`,
      value: origin.token,
      force: true,
    });
  }
}

/**
 * This
 * @name getOrigin
 * @function
 * @param {String} mind -
 * @returns {object}
 */
export async function getOrigin(fs, dir) {
  const url = await git.getConfig({
    fs,
    dir,
    path: `remote.origin.url`,
  });

  //if (url === undefined) throw Error("no remote");

  const token = await git.getConfig({
    fs,
    dir,
    path: `remote.origin.token`,
  });

  return { url, token };
}

const LINEBREAKS = /^.*(\r?\n|$)/gm;

function mergeDriverFactory(conflicts, resolutions) {
  return ({ branches, contents }) => {
    const ourName = branches[1];
    const theirName = branches[2];

    const baseContent = contents[0];
    const ourContent = contents[1];
    const theirContent = contents[2];

    const ours = ourContent.match(LINEBREAKS);
    const base = baseContent.match(LINEBREAKS);
    const theirs = theirContent.match(LINEBREAKS);

    // Here we let the diff3 library do the heavy lifting.
    const result = diff3Merge(ours, base, theirs);

    const markerSize = 7;

    // Here we note whether there are conflicts and format the results
    let mergedText = "";
    let cleanMerge = true;

    for (const item of result) {
      if (item.ok) {
        mergedText += item.ok.join("");
      }

      if (item.conflict) {
        const resolution = resolutions[item.conflict.oIndex];

        if (resolution === undefined) {
          cleanMerge = false;

          conflicts[item.conflict.oIndex] = item.conflict;
        } else {
          mergedText += item.conflict[resolution].join("");
        }
      }
    }

    return { cleanMerge, mergedText };
  };
}

async function canReach(url, token) {
  if (!url) return false;

  try {
    const headers = {};

    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    const probe = `${url.replace(/\/$/, "")}/info/refs?service=git-upload-pack`;

    const response = await fetch(probe, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

// Safe auto-merge: fast-forward or three-way. Throws on conflict.
async function mergeAuto(fs, dir) {
  const r = await git.merge({
    fs,
    dir,
    theirs: "origin/main",
    author: {
      name: "evenor",
      email: "evenor@norcivilianlabs.org",
    },
  });

  if (r.alreadyMerged === true) {
    // nothing to do
  } else if (r.fastForward === true) {
    await git.checkout({ fs, dir, force: true });
  } else {
    await git.add({ fs, dir, filepath: "." });

    await git.commit({
      fs,
      dir,
      ref: "main",
      message: "Merge origin into main",
      parent: ["main", "origin/main"],
    });
  }
}

// Discard local, checkout origin/main. This IS clone / force-pull.
async function mergeTheirs(fs, dir) {
  const remoteOid = await git.resolveRef({
    fs,
    dir,
    ref: "refs/remotes/origin/main",
  });

  await git.writeRef({
    fs,
    dir,
    ref: "refs/heads/main",
    value: remoteOid,
    force: true,
  });

  await git.checkout({ fs, dir, ref: "main", force: true });
}

// Keep local tree, create merge commit with origin/main as parent.
// Next settle pushes it. This IS force-push.
async function mergeOurs(fs, dir) {
  const ourOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
  const theirOid = await git.resolveRef({
    fs,
    dir,
    ref: "refs/remotes/origin/main",
  });

  await git.commit({
    fs,
    dir,
    message: "Merge (ours): keep local",
    parent: [ourOid, theirOid],
    author: {
      name: "evenor",
      email: "evenor@norcivilianlabs.org",
    },
  });
}

async function merge(fs, dir, strategy) {
  if (strategy === MergeStrategy.AUTO) {
    await mergeAuto(fs, dir);
  } else if (strategy === MergeStrategy.THEIRS) {
    await mergeTheirs(fs, dir);
  } else if (strategy === MergeStrategy.OURS) {
    await mergeOurs(fs, dir);
  } else {
    throw new Error(`unknown merge strategy: ${strategy}`);
  }
}

async function captureDirty(fs, dir) {
  const dirty = new Map();

  // fresh repo with no commits — nothing committed worth preserving.
  // statusMatrix doesn't throw here (returns H=0 for all files), so we
  // must check explicitly; otherwise we'd capture scaffolding files
  // (e.g. the throwaway UUID that induct writes before settle clones
  // the remote) and reapplyDirty would overwrite the remote content.
  try {
    await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    return dirty;
  }

  let matrix;
  try {
    matrix = await git.statusMatrix({ fs, dir });
  } catch {
    return dirty;
  }

  for (const [filepath, H, W] of matrix) {
    if (H === W) continue; // unchanged between HEAD and working dir

    if (W === 0) {
      // deleted in working dir
      dirty.set(filepath, null);
    } else {
      // added or modified — read content
      const content = await fs.promises.readFile(`${dir}/${filepath}`);
      dirty.set(filepath, content);
    }
  }

  return dirty;
}

async function reapplyDirty(fs, dir, dirty) {
  for (const [filepath, content] of dirty) {
    const fullPath = `${dir}/${filepath}`;

    if (content === null) {
      try {
        await fs.promises.unlink(fullPath);
      } catch {
        /* already gone */
      }
    } else {
      // ensure parent directory exists
      const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await fs.promises.mkdir(parent, { recursive: true }).catch(() => {});
      await fs.promises.writeFile(fullPath, content);
    }
  }
}

async function settle(fs, http, dir, origin) {
  const tag = `git::settle ${dir.split("/").pop()}`;
  console.time(tag);

  // 0. ensure repo exists
  console.log(`${tag} gitinit`);
  await gitinit(fs, dir);

  // 1. set remote if provided (induct passes origin)
  if (origin !== undefined && origin.url !== undefined) {
    console.log(`${tag} setOrigin ${origin.url}`);
    await setOrigin(fs, dir, origin);
  }

  const remote = await getOrigin(fs, dir);

  // 2. no remote configured → local-only repo, just commit
  if (!remote.url) {
    console.log(`${tag} local-only, commit`);
    await commit(fs, dir);
    console.timeEnd(tag);
    return;
  }

  // 3. remote unreachable → leave dirty files for next settle
  console.log(`${tag} canReach?`);
  const reachable = await canReach(remote.url, remote.token);
  if (!reachable) {
    console.log(`${tag} unreachable, skip`);
    console.timeEnd(tag);
    return;
  }

  const tokenPartial = remote.token
    ? {
        onAuth: () => ({
          headers: { Authorization: `token ${remote.token}` },
        }),
      }
    : {};

  // 4. capture local dirty state
  console.log(`${tag} captureDirty`);
  const dirty = await captureDirty(fs, dir);
  console.log(`${tag} ${dirty.size} dirty files`);

  // 5. fetch remote
  try {
    console.log(`${tag} fetch`);
    console.time(`${tag} fetch`);
    await git.fetch({
      fs,
      http,
      dir,
      url: remote.url,
      ...tokenPartial,
    });
    console.timeEnd(`${tag} fetch`);
  } catch (e) {
    // fetch failed — commit locally so work isn't lost, skip push
    console.log(`${tag} fetch error:`, e);

    await reapplyDirty(fs, dir, dirty);

    await commit(fs, dir);
    console.timeEnd(tag);
    return;
  }

  // 6. reset to remote tip (if it exists)
  let remoteOid;
  try {
    remoteOid = await git.resolveRef({
      fs,
      dir,
      ref: "refs/remotes/origin/main",
    });
  } catch {
    remoteOid = null; // remote repo is empty, no main branch yet
  }

  if (remoteOid) {
    console.log(`${tag} checkout ${remoteOid.slice(0, 7)}`);
    await git.writeRef({
      fs,
      dir,
      ref: "refs/heads/main",
      value: remoteOid,
      force: true,
    });
    await git.checkout({ fs, dir, ref: "main", force: true });
  }

  // 7. reapply local changes on top of remote
  if (dirty.size > 0) {
    console.log(`${tag} reapplyDirty`);
  }
  await reapplyDirty(fs, dir, dirty);

  // 8. commit (uses existing commit function — stages + commits if dirty)
  console.log(`${tag} commit`);
  await commit(fs, dir);

  // 9. push if we have something remote doesn't
  let localOid;
  try {
    localOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    console.timeEnd(tag);
    return; // fresh repo, no commits at all
  }

  if (remoteOid && localOid === remoteOid) {
    console.log(`${tag} nothing to push`);
    console.timeEnd(tag);
    return; // nothing new to push
  }

  try {
    console.log(`${tag} push`);
    console.time(`${tag} push`);
    await git.push({
      fs,
      http,
      dir,
      url: remote.url,
      remote: "origin",
      ...tokenPartial,
    });
    console.timeEnd(`${tag} push`);
  } catch (e) {
    console.log(`${tag} push error:`, e);
  }
  console.timeEnd(tag);
}

async function fetchRemote(fs, http, dir) {
  const tag = `git::fetch ${dir.split("/").pop()}`;
  const remote = await getOrigin(fs, dir);

  if (!remote.url) return;

  const reachable = await canReach(remote.url, remote.token);

  if (!reachable) {
    console.log(`${tag} unreachable`);
    return;
  }

  const tokenPartial = remote.token
    ? {
        onAuth: () => ({
          headers: { Authorization: `token ${remote.token}` },
        }),
      }
    : {};

  console.time(tag);
  await git.fetch({ fs, http, dir, url: remote.url, ...tokenPartial });
  console.timeEnd(tag);
}

async function pushRemote(fs, http, dir) {
  const tag = `git::push ${dir.split("/").pop()}`;
  const remote = await getOrigin(fs, dir);

  if (!remote.url) return;

  const reachable = await canReach(remote.url, remote.token);

  if (!reachable) {
    console.log(`${tag} unreachable`);
    return;
  }

  const tokenPartial = remote.token
    ? {
        onAuth: () => ({
          headers: { Authorization: `token ${remote.token}` },
        }),
      }
    : {};

  try {
    console.time(tag);
    await git.push({
      fs,
      http,
      dir,
      url: remote.url,
      remote: "origin",
      ...tokenPartial,
    });
    console.timeEnd(tag);
  } catch (e) {
    console.log(`${tag} error:`, e);
  }
}

export default (fs, http) => {
  return {
    settle: (dir, origin) => settle(fs, http, dir, origin),
    merge: (dir, strategy) => merge(fs, dir, strategy),
    fetch: (dir) => fetchRemote(fs, http, dir),
    push: (dir) => pushRemote(fs, http, dir),
    getOrigin: (dir) => getOrigin(fs, dir),
  };
};
