import git from "isomorphic-git";
import lfs from "@fetsorn/isogit-lfs";

export const lfsDir = "lfs";

/**
 * This
 * @name createLFS
 * @function
 * @param {String} mind -
 */
export async function createLFS(fs, dir) {
  await fs.promises.writeFile(
    `${dir}/.gitattributes`,
    `${lfsDir}/** filter=lfs diff=lfs merge=lfs -text\n`,
    "utf8",
  );

  await fs.promises.writeFile(`${dir}/.git/config`, "\n", "utf8");

  await git.setConfig({
    fs,
    dir,
    path: "filter.lfs.clean",
    value: "git-lfs clean -- %f",
  });

  await git.setConfig({
    fs,
    dir,
    path: "filter.lfs.smudge",
    value: "git-lfs smudge -- %f",
  });

  await git.setConfig({
    fs,
    dir,
    path: "filter.lfs.process",
    value: "git-lfs filter-process",
  });

  await git.setConfig({
    fs,
    dir,
    path: "filter.lfs.required",
    value: true,
  });
}

/**
 * This
 * @name addLFS
 * @function
 * @param {String} dir -
 * @param {String} filepath -
 */
export async function addLFS(fs, dir, filepath) {
  if (filepath.startsWith(lfsDir)) {
    // stage files in remoteEndpoint as LFS pointers
    await lfs.addLFS({
      fs,
      dir,
      filepath,
    });
  } else {
    throw Error("not lfs filepath");
  }
}

/**
 * This
 * @name downloadUrlFromPointer
 * @function
 * @param {String} url -
 * @param {String} token -
 * @param {object} pointerInfo -
 * @returns {String}
 */
export async function downloadUrlFromPointer(url, token, pointerInfo) {
  const http = await import("isomorphic-git/http/web");

  return lfs.downloadUrlFromPointer({
    http,
    url,
    auth: {
      username: token,
      password: token,
    },
    info: pointerInfo,
  });
}

/**
 * This
 * @name setAssetPath
 * @function
 * @param {String} mind -
 * @param {String} assetPath -
 */
export async function setAssetPath(fs, dir, assetPath) {
  await git.setConfig({
    fs,
    dir,
    path: "asset.path",
    value: assetPath,
  });
}

/**
 * This
 * @name getAssetPath
 * @function
 * @param {String} mind -
 * @returns {String}
 */
export async function getAssetPath(fs, dir) {
  return git.getConfigAll({
    fs,
    dir,
    path: "asset.path",
  });
}

/**
 * This
 * @name putAsset
 * @function
 * @param {String} mind -
 * @param {String} filename -
 * @param {String} content -
 */
export async function putAsset(fs, mind, filename, content) {
  // write buffer to assetEndpoint/filename
  const assetEndpoint = `${lfsDir}/${filename}`;

  //await writeFile(fs, mind, assetEndpoint, content);
}

/**
 * This returns file contents
 * @name fetchAsset
 * @function
 * @param {String} mind -
 * @param {String} filename -
 * @returns {Uint8Array}
 */
export async function fetchAsset(fs, dir, filename) {
  let assetEndpoint;

  let content;

  try {
    assetEndpoint = await git.getConfig({
      fs,
      dir,
      path: "asset.path",
    });

    if (assetEndpoint) {
      const assetPath = `${assetEndpoint}/${filename}`;

      // skip URL-based fetch to prevent SSRF from malicious git config
      // Only allow filesystem reads for asset paths

      // otherwise try to read from fs
      content = await fs.promises.readFile(assetPath);

      return content;
    }
  } catch {
    // do nothing
  }

  assetEndpoint = `${dir}/${lfsDir}`;

  const assetPath = `${assetEndpoint}/${filename}`;

  content = await fs.promises.readFile(assetPath);

  const contentUTF8 = new TextDecoder().decode(content);

  if (lfs.pointsToLFS(contentUTF8)) {
    const pointer = await lfs.readPointer({ dir, content: contentUTF8 });

    const remoteUrl = await git.getConfig({
      fs,
      dir,
      path: `remote.origin.url`,
    });

    const remoteToken = await git.getConfig({
      fs,
      dir,
      path: `remote.origin.token`,
    });

    const http = await import("isomorphic-git/http/web");

    try {
      content = await lfs.downloadBlobFromPointer({
        fs,
        http,
        url: remoteUrl,
        auth: {
          username: remoteToken,
          password: remoteToken,
        },
        pointer,
      });

      return content;
    } catch {
      // do nothing
    }
  }

  return content;
}

/**
 * This
 * @name uploadBlobsLFS
 * @note called without "files" on push
 * @function
 * @param {String} mind -
 * @param {String} remoteUrl -
 * @param {String} remoteToken -
 * @param {File[]} files -
 */
export async function uploadBlobsLFS(fs, dir, remoteUrl, remoteToken, files) {
  let assets;

  // if no files are specified
  // for every file in remoteEndpoint/
  // if file is not LFS pointer,
  // upload file to remote
  if (files === undefined) {
    const filenames = await fs.promises.readdir(`${dir}/${lfsDir}/`);

    assets = (
      await Promise.all(
        filenames.map(async (filename) => {
          //const file = await fetchFile(fs, mind, `${lfsDir}/${filename}`);

          if (!lfs.pointsToLFS(file)) {
            return file;
          }

          return undefined;
        }),
      )
    ).filter(Boolean);
  } else {
    assets = files;
  }

  await lfs.uploadBlobs(
    {
      url: remoteUrl,
      auth: {
        username: remoteToken,
        password: remoteToken,
      },
    },
    assets,
  );
}

/**
 * This will pick file, write file and return metadata
 * @name uploadFile
 * @function
 * @param {String} mind -
 */
export async function uploadFile(fs, mind, files) {
  let metadata = [];

  for (const file of files) {
    const fileArrayBuffer = await file.arrayBuffer();

    const hashArrayBuffer = await crypto.subtle.digest(
      "SHA-256",
      fileArrayBuffer,
    );

    const hashByteArray = Array.from(new Uint8Array(hashArrayBuffer));

    const hashHexString = hashByteArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const name = file.name.replace(/\.[^/.]+$/, "");

    const extension = /(?:\.([^.]+))?$/.exec(file.name)[1]?.trim();

    const assetname =
      extension !== undefined ? `${hashHexString}.${extension}` : hashHexString;

    await putAsset(fs, mind, assetname, fileArrayBuffer);

    const metadatum = { hash: hashHexString, name, extension };

    metadata.push(metadatum);
  }

  return metadata;
}

export default {
  uploadFile,
  uploadBlobsLFS,
  fetchAsset,
  putAsset,
  getAssetPath,
  setAssetPath,
  downloadUrlFromPointer,
  addLFS,
  createLFS,
};
