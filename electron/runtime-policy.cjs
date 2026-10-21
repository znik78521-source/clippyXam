const path = require("node:path");
const { getDevURL } = require("./window-policy.cjs");
const APP_URL = "clippyxam://bundle/";
function rendererURL(packaged, devURL) {
  // Packaged code must NEVER take its renderer URL from an environment variable.
  return packaged ? APP_URL : getDevURL(devURL);
}
function bundleFile(raw, root) {
  const url = new URL(raw);
  if (
    url.protocol !== "clippyxam:" ||
    url.hostname !== "bundle" ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("Untrusted bundle URL");
  const name = decodeURIComponent(url.pathname);
  if (
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((p) => p === ".." || p === ".")
  )
    throw new Error("Unsafe bundle path");
  const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw new Error("Outside bundle");
  return file;
}
function contentSecurityPolicy(packaged, url) {
  const websocket = packaged ? "" : new URL(url).origin.replace("http:", "ws:");
  return `default-src 'self'; script-src 'self'${packaged ? "" : " 'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${websocket} https://openrouter.ai https://api.openai.com; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
}
function portableDataDirectory(directory) {
  if (!directory || !path.isAbsolute(directory))
    throw new Error("Portable directory must be absolute");
  return path.join(directory, "clippyXam-data");
}
module.exports = {
  APP_URL,
  rendererURL,
  bundleFile,
  contentSecurityPolicy,
  portableDataDirectory,
};
