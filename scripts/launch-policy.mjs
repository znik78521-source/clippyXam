import { createHash } from "node:crypto";
export function supportedNode(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}
export function installFingerprint(lock, platform, arch, nodeVersion) {
  return createHash("sha256")
    .update(lock)
    .update(`\n${platform}/${arch}/node${nodeVersion.split(".")[0]}`)
    .digest("hex");
}
// Fixed command lines only. Never interpolate project paths or user input into cmd.exe.
const COMMANDS = new Map([
  ["install", ["ci", "--include=dev", "--ignore-scripts=false"]],
  ["check", ["run", "verify"]],
  ["desktop", ["run", "desktop:dev"]],
]);
export function npmInvocation(
  kind,
  platform = process.platform,
  comspec = process.env.ComSpec || "cmd.exe",
) {
  const args = COMMANDS.get(kind);
  if (!args) throw new TypeError("Unknown launch operation");
  return platform === "win32"
    ? {
        command: comspec,
        args: ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`],
      }
    : { command: "npm", args: [...args] };
}
export function loopbackURL(address) {
  if (
    !address ||
    typeof address === "string" ||
    !Number.isInteger(address.port) ||
    address.port < 1 ||
    address.port > 65535
  )
    throw new Error("The local desktop server has no valid port");
  return `http://127.0.0.1:${address.port}/`;
}
