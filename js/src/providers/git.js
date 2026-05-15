import git from "isomorphic-git";
import diff3Merge from "diff3";
// move to @fetsorn/isogit-lfs
import { addLFS } from "@/providers/lfs.js";

async function exists(fs, dir) {
  try {
    await fs.promises.stat(dir);

    return true;
  } catch {
    return false;
  }
}

export async function gitinit(fs, dir) {
  const hasGit = (await fs.promises.readdir(dir)).includes(".git");

  if (!hasGit) {
    await git.init({ fs, dir, defaultBranch: "main" });

    await fs.promises.writeFile(`${dir}/.gitignore`, `.DS_Store`, "utf8");
  }
}

export async function clone(fs, http, dir, remote) {
  const options = {
    fs,
    http,
    dir,
    url: remote.url,
    //singleBranch: true,
  };

  if (remote.token !== undefined) {
    options.onAuth = () => ({
      username: remote.token,
    });
  }

  return git.clone(options);
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

export async function resolve(fs, http, dir, resolutions) {
  const remote = await getOrigin(fs, dir);

  const reachable = await canReach(remote.url, remote.token);
  console.error("resolve: remote=", remote.url, "reachable=", reachable);
  if (!reachable) {
    return { ok: true };
  }

  // soft-serve uses "token ${remote.token}". first word CAN be Token
  // gitea uses "token ${remote.token}". first word MUST be lower-case "token"
  const tokenPartial = remote.token
    ? {
        onAuth: () => ({
          headers: {
            Authorization: `token ${remote.token}`,
          },
        }),
      }
    : {};

  await git.fetch({
    fs,
    http,
    dir,
    url: remote.url,
    ref: "HEAD",
    ...tokenPartial,
  });

  let conflicts;

  try {
    // TODO collect hunks to conflicts
    // throws if can't merge
    const r = await git.merge({
      fs,
      dir,
      theirs: "origin/main",
      //mergeDriver: mergeDriverFactory(conflicts, resolutions),
      author: {
        name: "evenor",
        email: "evenor@norcivilianlabs.org",
      },
    });

    if (r.alreadyMerged === true) {
      //do nothing
    } else if (r.fastForward === true) {
      // checkout main after fastForward
      await git.checkout({
        fs,
        dir,
        force: true,
      });
    } else {
      await git.add({
        fs,
        dir,
        filepath: ".",
      });

      await git.commit({
        fs,
        dir,
        ref: "main",
        message: "Merge origin into main",
        parent: ["main", "origin/main"], // Be sure to specify the parents when creating a merge commit
      });
    }
  } catch (e) {
    console.log("merge", e);

    return { ok: false, conflicts };
  }

  try {
    await git.push({
      fs,
      http,
      dir,
      url: remote.url,
      remote: "origin",
      ...tokenPartial,
    });
  } catch (e) {
    console.log("push", e);

    return { ok: false, conflicts };
  }

  return { ok: true };
}

async function settle(fs, http, dir, origin) {
  const dirExists = await exists(fs, dir);

  // clone
  if (origin && !dirExists) {
    await clone(fs, http, dir, origin);
  }

  // init
  await gitinit(fs, dir);

  // commit
  await commit(fs, dir);

  // set remote and token in .git/config
  if (origin !== undefined && origin.url !== undefined) {
    await setOrigin(fs, dir, origin);
  }

  try {
    // fetch
    // merge
    // push
    await resolve(fs, http, dir);
  } catch (e) {
    console.error("settle resolve error:", e);
  }
}

export default (fs, http) => {
  return {
    settle: (dir, origin) => settle(fs, http, dir, origin),
    getOrigin: (dir) => getOrigin(fs, dir),
  };
};
