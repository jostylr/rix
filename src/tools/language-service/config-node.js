import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const RIX_WORKSPACE_CONFIG_VERSION = 1;
export const RIX_WORKSPACE_CONFIG_FILENAME = "rix.json";

export const DEFAULT_RIX_WORKSPACE_CONFIG = Object.freeze({
    version: 1,
    plugins: ["standard"],
    operatorFiles: [],
    preamble: null,
    lint: Object.freeze({ level: "standard", profiles: ["default"] }),
    format: Object.freeze({ enabled: true, profile: "readable", printWidth: 100, indentWidth: 4 }),
    numbers: Object.freeze({ input: "z[10]", display: ".." }),
    execution: Object.freeze({ mode: "isolated", timeoutMs: 10000, capabilityGroups: ["standard"], artifactDirectory: ".rix-output" }),
});

const ROOT_KEYS = new Set(["$schema", "version", "extends", "plugins", "operatorFiles", "preamble", "lint", "format", "numbers", "execution"]);
const NESTED_KEYS = Object.freeze({
    lint: new Set(["level", "profiles"]),
    format: new Set(["enabled", "profile", "printWidth", "indentWidth"]),
    numbers: new Set(["input", "display"]),
    execution: new Set(["mode", "timeoutMs", "capabilityGroups", "artifactDirectory"]),
});

function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
    return value;
}

function rejectUnknown(value, allowed, label) {
    for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unknown key '${key}'`);
}

function stringArray(value, label) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} must be an array of non-empty strings`);
    return [...new Set(value.map((item) => item.trim()))];
}

export function validateRixWorkspaceConfig(value, filename = RIX_WORKSPACE_CONFIG_FILENAME) {
    object(value, filename);
    rejectUnknown(value, ROOT_KEYS, filename);
    if (value.version !== undefined && value.version !== RIX_WORKSPACE_CONFIG_VERSION) throw new Error(`${filename}: unsupported version '${value.version}'`);
    for (const section of Object.keys(NESTED_KEYS)) {
        if (value[section] !== undefined) {
            object(value[section], `${filename}:${section}`);
            rejectUnknown(value[section], NESTED_KEYS[section], `${filename}:${section}`);
        }
    }
    if (value.extends !== undefined && (typeof value.extends !== "string" || !value.extends.trim())) throw new Error(`${filename}: extends must be a non-empty relative path`);
    if (value.extends && path.isAbsolute(value.extends)) throw new Error(`${filename}: extends must be relative`);
    if (value.plugins !== undefined) stringArray(value.plugins, `${filename}:plugins`);
    if (value.operatorFiles !== undefined) stringArray(value.operatorFiles, `${filename}:operatorFiles`);
    if (value.preamble !== undefined && value.preamble !== null && typeof value.preamble !== "string") throw new Error(`${filename}:preamble must be a path or null`);
    if (value.lint?.level && !["essential", "standard", "thorough", "pedantic"].includes(value.lint.level)) throw new Error(`${filename}: invalid lint.level`);
    if (value.lint?.profiles !== undefined) stringArray(value.lint.profiles, `${filename}:lint.profiles`);
    if (value.format?.profile && !["readable", "compact"].includes(value.format.profile)) throw new Error(`${filename}: invalid format.profile`);
    if (value.format?.printWidth !== undefined && (!Number.isInteger(value.format.printWidth) || value.format.printWidth < 40)) throw new Error(`${filename}: format.printWidth must be an integer of at least 40`);
    if (value.format?.indentWidth !== undefined && (!Number.isInteger(value.format.indentWidth) || value.format.indentWidth < 1 || value.format.indentWidth > 8)) throw new Error(`${filename}: format.indentWidth must be between 1 and 8`);
    for (const key of ["input", "display"]) {
        if (value.numbers?.[key] !== undefined && (typeof value.numbers[key] !== "string" || !value.numbers[key].trim())) throw new Error(`${filename}: numbers.${key} must be a non-empty string`);
    }
    if (value.execution?.mode && !["isolated", "session"].includes(value.execution.mode)) throw new Error(`${filename}: invalid execution.mode`);
    if (value.execution?.timeoutMs !== undefined && (!Number.isInteger(value.execution.timeoutMs) || value.execution.timeoutMs < 100 || value.execution.timeoutMs > 120000)) throw new Error(`${filename}: execution.timeoutMs must be between 100 and 120000`);
    if (value.execution?.capabilityGroups !== undefined) stringArray(value.execution.capabilityGroups, `${filename}:execution.capabilityGroups`);
    return structuredClone(value);
}

function mergeConfig(base, local) {
    return {
        ...base,
        ...local,
        lint: { ...base.lint, ...local.lint },
        format: { ...base.format, ...local.format },
        numbers: { ...base.numbers, ...local.numbers },
        execution: { ...base.execution, ...local.execution },
    };
}

function isInside(root, target) {
    const relative = path.relative(root, target);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertNoSymlink(root, target, label) {
    if (!isInside(root, target)) throw new Error(`${label} escapes workspace root`);
    let current = root;
    const relative = path.relative(root, target);
    for (const component of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, component);
        if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses symbolic link '${current}'`);
    }
}

function readConfigFile(filename, workspaceRoot, seen = new Set()) {
    const absolute = path.resolve(filename);
    assertNoSymlink(workspaceRoot, absolute, absolute);
    const canonical = realpathSync(absolute);
    if (!isInside(realpathSync(workspaceRoot), canonical)) throw new Error(`${absolute} resolves outside workspace root`);
    if (seen.has(canonical)) throw new Error(`RiX configuration extends cycle at '${absolute}'`);
    seen.add(canonical);
    let parsed;
    try { parsed = JSON.parse(readFileSync(absolute, "utf8")); }
    catch (error) { throw new Error(`${absolute}: invalid JSON (${error.message})`); }
    const local = validateRixWorkspaceConfig(parsed, absolute);
    let base = DEFAULT_RIX_WORKSPACE_CONFIG;
    if (local.extends) {
        const parent = path.resolve(path.dirname(absolute), local.extends);
        if (!isInside(workspaceRoot, parent)) throw new Error(`${absolute}: extends escapes workspace root`);
        base = readConfigFile(parent, workspaceRoot, seen).config;
    }
    seen.delete(canonical);
    const config = mergeConfig(base, local);
    delete config.extends;
    return { filename: absolute, config };
}

export function findNearestRixConfig(documentPath, workspaceRoot) {
    const boundary = path.resolve(workspaceRoot);
    let directory = path.dirname(path.resolve(documentPath));
    if (!isInside(boundary, directory)) return null;
    while (isInside(boundary, directory)) {
        const candidate = path.join(directory, RIX_WORKSPACE_CONFIG_FILENAME);
        if (existsSync(candidate)) return candidate;
        if (directory === boundary) break;
        directory = path.dirname(directory);
    }
    return null;
}

export function resolveRixWorkspaceConfig(documentPath, workspaceRoot) {
    const filename = findNearestRixConfig(documentPath, workspaceRoot);
    return filename
        ? readConfigFile(filename, path.resolve(workspaceRoot))
        : { filename: null, config: structuredClone(DEFAULT_RIX_WORKSPACE_CONFIG) };
}

export function resolveContainedOperatorFiles(configResult, workspaceRoot, limits = {}) {
    const root = path.resolve(workspaceRoot);
    const base = configResult.filename ? path.dirname(configResult.filename) : path.dirname(root);
    const maximumFiles = Math.min(256, limits.maximumFiles || 256);
    const maximumBytes = Math.min(10 * 1024 * 1024, limits.maximumBytes || 10 * 1024 * 1024);
    const perFileBytes = Math.min(1024 * 1024, limits.perFileBytes || 1024 * 1024);
    const paths = [];
    let bytes = 0;
    for (const relative of configResult.config.operatorFiles || []) {
        if (path.isAbsolute(relative)) throw new Error(`operatorFiles entry '${relative}' must be relative`);
        const target = path.resolve(base, relative);
        assertNoSymlink(root, target, `operatorFiles entry '${relative}'`);
        if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`operatorFiles entry '${relative}' is not a regular file`);
        const canonical = realpathSync(target);
        if (!isInside(realpathSync(root), canonical)) throw new Error(`operatorFiles entry '${relative}' resolves outside workspace root`);
        const size = statSync(canonical).size;
        if (size > perFileBytes) throw new Error(`operatorFiles entry '${relative}' exceeds ${perFileBytes} bytes`);
        bytes += size;
        if (bytes > maximumBytes) throw new Error(`operatorFiles exceed the ${maximumBytes}-byte workspace budget`);
        paths.push(canonical);
        if (paths.length > maximumFiles) throw new Error(`operatorFiles exceed the ${maximumFiles}-file workspace budget`);
    }
    return paths;
}
