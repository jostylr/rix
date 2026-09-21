import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { captureReleaseState, checkReceipt, verifyRelease } from "../../scripts/release-verification.js";
const directories = [];
function temporary() {
    const base = path.resolve(import.meta.dir, "../../tmp");
    mkdirSync(base, { recursive: true });
    const directory = mkdtempSync(path.join(base, "release-receipt-test-"));
    directories.push(directory);
    return directory;
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const state = { fingerprint: "test-state" };
function verify(filename, overrides = {}) {
    return verifyRelease({ filename, capture: () => state, prepare: () => {}, checks: () => {}, ...overrides });
}
test("publish rejects absent, corrupt, and stale receipts; success does not rerun checks", () => {
    const filename = path.join(temporary(), "receipt.json");
    expect(() => checkReceipt(filename, state)).toThrow("No successful release verification");
    let checked = 0;
    verify(filename, { checks: () => checked++ });
    expect(checkReceipt(filename, state).status).toBe("passed");
    expect(checkReceipt(filename, state).status).toBe("passed");
    expect(checked).toBe(1);
    expect(() => checkReceipt(filename, { fingerprint: "changed" })).toThrow("stale");
    writeFileSync(filename, "not json");
    expect(() => checkReceipt(filename, state)).toThrow("Invalid");
});
test("failed preparation or verification removes an old receipt and cannot approve publication", () => {
    const filename = path.join(temporary(), "receipt.json");
    for (const step of ["prepare", "checks"]) {
        verify(filename);
        expect(() => verify(filename, { [step]: () => { throw new Error("intentional failure"); } })).toThrow("intentional failure");
        expect(existsSync(filename)).toBe(false);
    }
});
test("changing inputs during verification prevents a receipt", () => {
    const filename = path.join(temporary(), "receipt.json");
    let calls = 0;
    expect(() => verify(filename, { capture: () => ({ fingerprint: String(calls++) }) })).toThrow("changed during verification");
    expect(existsSync(filename)).toBe(false);
});
test("fingerprints cover source, npm-only assets, dependencies and version, but survive commits", () => {
    const directory = temporary();
    const git = (...args) => {
        const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
    };
    git("init", "--quiet");
    writeFileSync(path.join(directory, ".gitignore"), "tmp/\nnode_modules/\nassets/\n");
    const manifest = { name: "rix-release-receipt-fixture", version: "0.1.0", files: ["index.js", "assets/"], dependencies: { "fixture-dep": "1.0.0" } };
    writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
    writeFileSync(path.join(directory, "index.js"), "export const value = 1;\n");
    mkdirSync(path.join(directory, "assets"));
    writeFileSync(path.join(directory, "assets/ignored.txt"), "included by npm\n");
    const dependency = path.join(directory, "node_modules/fixture-dep");
    mkdirSync(dependency, { recursive: true });
    writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ name: "fixture-dep", version: "1.0.0", main: "index.js" }));
    writeFileSync(path.join(dependency, "index.js"), "module.exports = 1;\n");
    const capture = () => captureReleaseState(directory);
    const original = capture();
    const filename = path.join(directory, "tmp/release-verification.json");
    verify(filename, { capture });
    git("add", ".");
    git("-c", "user.name=RiX Tests", "-c", "user.email=tests@example.invalid", "commit", "--quiet", "-m", "Verified content");
    expect(capture().fingerprint).toBe(original.fingerprint);
    for (const file of ["index.js", "assets/ignored.txt", "node_modules/fixture-dep/index.js", "package.json"]) {
        const target = path.join(directory, file), previous = readFileSync(target, "utf8");
        writeFileSync(target, file === "package.json" ? JSON.stringify({ ...manifest, version: "0.1.1" }) : previous + "changed\n");
        expect(() => checkReceipt(filename, capture())).toThrow("stale");
        writeFileSync(target, previous);
    }
    writeFileSync(path.join(directory, "new-test.js"), "// new verification input\n");
    expect(capture().fingerprint).not.toBe(original.fingerprint);
    rmSync(path.join(directory, "new-test.js"));
    expect(checkReceipt(filename, capture()).status).toBe("passed");
}, 60000);
