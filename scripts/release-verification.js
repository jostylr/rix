/** Local release receipt: verify once, publish only the same content and toolchain. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = "rix.release-verification@1";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const receiptPath = (directory) => path.join(directory, "tmp/release-verification.json");
function output(command, cwd) {
    const result = spawnSync(command[0], command.slice(1), { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`${command.join(" ")} failed: ${result.error?.message || result.stderr}`);
    return result.stdout;
}
function fileRecord(filename, label) {
    if (!existsSync(filename)) return [label, "missing"];
    const stat = lstatSync(filename);
    if (stat.isSymbolicLink()) return [label, "symlink", readlinkSync(filename), hash(readFileSync(filename))];
    if (!stat.isFile()) throw new Error(`Expected a release input file: ${label}`);
    return [label, stat.mode & 0o111, hash(readFileSync(filename))];
}
function dependencyDirectory(name, parent) {
    const require = createRequire(path.join(parent, "package.json"));
    try { return realpathSync(path.dirname(require.resolve(`${name}/package.json`))); }
    catch {
        let candidate = path.dirname(require.resolve(name));
        for (;;) {
            const manifest = path.join(candidate, "package.json");
            if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === name) return realpathSync(candidate);
            const previous = candidate; candidate = path.dirname(candidate);
            if (previous === candidate) throw new Error(`Cannot fingerprint installed dependency ${name}`);
        }
    }
}
function dependencyFiles(directory, prefix = "") {
    return readdirSync(path.join(directory, prefix), { withFileTypes: true }).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap((entry) => {
        if (["node_modules", ".git", "tmp", "coverage", ".cache", ".quarto", "_site", ".DS_Store"].includes(entry.name)) return [];
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? dependencyFiles(directory, relative) : [relative];
    });
}
export function captureReleaseState(directory = root) {
    const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    const gitFiles = output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], directory).split("\0").filter(Boolean);
    // Also include ignored files that npm's explicit files list would package.
    const [pack] = JSON.parse(output(["npm", "pack", "--dry-run", "--ignore-scripts", "--json", "--cache", path.join(directory, "tmp/npm-cache")], directory));
    const files = [...new Set([...gitFiles, ...pack.files.map(({ path: filename }) => filename)])].sort();
    if (files.some((filename) => filename.startsWith("tmp/") || filename.startsWith("node_modules/"))) throw new Error("Release inputs must not contain temporary files or node_modules");
    const source = files.map((filename) => fileRecord(path.join(directory, filename), filename));
    // The umbrella lock is outside this Git submodule, but affects its dependency install.
    for (const name of ["bun.lock", "bun.lockb", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]) {
        const filename = path.resolve(directory, "..", name);
        if (existsSync(filename)) source.push(fileRecord(filename, `parent/${name}`));
    }
    const dependencies = [], visited = new Set();
    function visit(name, parent) {
        const location = dependencyDirectory(name, parent);
        if (visited.has(location)) return;
        visited.add(location);
        const info = JSON.parse(readFileSync(path.join(location, "package.json"), "utf8"));
        dependencies.push([name, info.version, dependencyFiles(location).map((file) => fileRecord(path.join(location, file), file))]);
        for (const child of Object.keys(info.dependencies || {}).sort()) {
            if (!(child in (info.optionalDependencies || {}))) visit(child, location);
        }
        for (const child of Object.keys(info.optionalDependencies || {}).sort()) {
            try { dependencyDirectory(child, location); } catch { dependencies.push([child, "optional dependency absent"]); continue; }
            visit(child, location);
        }
        for (const child of Object.keys(info.peerDependencies || {}).sort()) {
            try { dependencyDirectory(child, location); } catch { dependencies.push([child, "peer dependency absent"]); continue; }
            visit(child, location);
        }
    }
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort()) visit(name, directory);
    const runtimes = Object.fromEntries(["node", "bun", "npm"].map((runtime) => [runtime, output([runtime, "--version"], directory).trim()]));
    const executionOptions = Object.fromEntries(["NODE_OPTIONS", "BUN_OPTIONS", "NODE_ENV", "CI"].map((name) => [name, process.env[name] || ""]));
    const state = { package: manifest.name, version: manifest.version, platform: process.platform, arch: process.arch, runtimes, executionOptions, source, dependencies };
    return { package: manifest.name, version: manifest.version, runtimes, fingerprint: hash(JSON.stringify(state)) };
}
export function checkReceipt(filename, current) {
    if (!existsSync(filename)) throw new Error("No successful release verification. Run bun run check:release before npm publish.");
    let receipt;
    try { receipt = JSON.parse(readFileSync(filename, "utf8")); } catch { throw new Error("Invalid release verification receipt. Run bun run check:release again."); }
    if (receipt.schema !== schema || receipt.status !== "passed" || !receipt.completedAt || receipt.state?.fingerprint !== current.fingerprint) {
        throw new Error("Release verification is stale: source, package contents, dependencies, or runtime versions changed. Run bun run check:release again.");
    }
    return receipt;
}
export function verifyRelease({ filename, capture, prepare, checks }) {
    // A failed or interrupted rerun must not leave an older approval behind.
    rmSync(filename, { force: true });
    prepare();
    const before = capture();
    checks();
    const after = capture();
    if (before.fingerprint !== after.fingerprint) throw new Error("Release inputs changed during verification. No receipt was recorded; run check:release again.");
    const receipt = { schema, status: "passed", completedAt: new Date().toISOString(), state: after };
    mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(receipt, null, 2) + "\n");
    renameSync(temporary, filename);
    return receipt;
}
function runScript(name) {
    const result = spawnSync("bun", ["run", name], { cwd: root, stdio: "inherit" });
    if (result.error || result.status !== 0) throw new Error(`${name} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}; no release receipt recorded.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const command = process.argv[2];
        if (command === "run") {
            rmSync(receiptPath(root), { force: true });
            if (process.env.RIX_PLUGIN_TEST) throw new Error("Unset RIX_PLUGIN_TEST before full release verification.");
            verifyRelease({ filename: receiptPath(root), capture: () => captureReleaseState(root), prepare: () => runScript("build:package"), checks: () => runScript("check:release:checks") });
            console.log("Release verification passed and recorded. npm publish can now check this state without rerunning the suite.");
        } else if (command === "check") {
            // Fail immediately when there is no receipt, before fingerprinting dependencies.
            const filename = receiptPath(root);
            if (!existsSync(filename)) checkReceipt(filename, {});
            const receipt = checkReceipt(filename, captureReleaseState(root));
            console.log(`Release state matches successful verification from ${receipt.completedAt}.`);
        } else if (command === "fingerprint") {
            console.log(JSON.stringify(captureReleaseState(root), null, 2));
        } else throw new Error("Usage: bun scripts/release-verification.js run|check|fingerprint");
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
