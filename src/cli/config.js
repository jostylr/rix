import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const RIX_CLI_CONFIG_VERSION = 1;
export const RIX_CLI_CONFIG_FILENAME = "config.json";
export const RIX_CLI_PREAMBLE_FILENAME = "cli-preamble.rix";

const EMPTY_PREAMBLE = `/**
plugins: []
operator-files: []
**/
`;

function normalizedSelector(value) {
    return String(value).trim().toLowerCase();
}

export function resolveRixConfigDir(options = {}) {
    const env = options.env || process.env;
    const userHome = options.home || homedir();
    if (env.RIX_CONFIG_DIR?.trim()) return path.resolve(env.RIX_CONFIG_DIR.trim());
    const configHome = env.XDG_CONFIG_HOME?.trim()
        ? path.resolve(env.XDG_CONFIG_HOME.trim())
        : path.join(userHome, ".config");
    return path.join(configHome, "rix");
}

function validateConfig(value, filename) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${filename}: RiX CLI configuration must be a JSON object`);
    }
    if (value.version !== undefined && value.version !== RIX_CLI_CONFIG_VERSION) {
        throw new Error(`${filename}: unsupported RiX CLI configuration version '${value.version}'`);
    }
    if (value.plugins !== undefined && (!Array.isArray(value.plugins) || value.plugins.some((item) => typeof item !== "string"))) {
        throw new Error(`${filename}: plugins must be an array of plugin or group names`);
    }
    return {
        version: RIX_CLI_CONFIG_VERSION,
        plugins: [...new Set((value.plugins || []).map(String).map((item) => item.trim()).filter(Boolean))],
    };
}

export function readRixCliConfig(configDir) {
    const filename = path.join(configDir, RIX_CLI_CONFIG_FILENAME);
    if (!existsSync(filename)) return validateConfig({}, filename);
    let value;
    try {
        value = JSON.parse(readFileSync(filename, "utf8"));
    } catch (error) {
        throw new Error(`${filename}: invalid JSON (${error.message})`);
    }
    return validateConfig(value, filename);
}

export function writeRixCliConfig(configDir, config) {
    const filename = path.join(configDir, RIX_CLI_CONFIG_FILENAME);
    const value = validateConfig(config, filename);
    mkdirSync(configDir, { recursive: true });
    const temporary = path.join(configDir, `${RIX_CLI_CONFIG_FILENAME}.new`);
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, filename);
    return filename;
}

export function ensureRixCliPreamble(configDir) {
    const filename = path.join(configDir, RIX_CLI_PREAMBLE_FILENAME);
    mkdirSync(configDir, { recursive: true });
    if (!existsSync(filename)) writeFileSync(filename, EMPTY_PREAMBLE, "utf8");
    return filename;
}

export function availablePluginGroups(pluginCatalog) {
    const groups = new Map();
    for (const metadata of pluginCatalog.list()) {
        for (const group of metadata.groups || []) {
            const key = normalizedSelector(group);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(metadata.id);
        }
    }
    return new Map(Array.from(groups, ([group, ids]) => [group, [...new Set(ids)].sort()]));
}

export function resolvePluginSelectors(pluginCatalog, selectors, options = {}) {
    const entries = pluginCatalog.list();
    const byId = new Map(entries.map((metadata) => [normalizedSelector(metadata.id), metadata.id]));
    const groups = availablePluginGroups(pluginCatalog);
    const standardIds = new Set(options.standardIds || []);
    const resolved = [];

    for (const rawSelector of selectors || []) {
        const selector = normalizedSelector(rawSelector);
        if (!selector) continue;
        if (selector === "full") {
            for (const metadata of entries) {
                if (standardIds.has(metadata.id)) resolved.push(metadata.id);
            }
            continue;
        }
        if (byId.has(selector)) {
            resolved.push(byId.get(selector));
            continue;
        }
        if (groups.has(selector)) {
            resolved.push(...groups.get(selector));
            continue;
        }
        const availableGroups = Array.from(groups.keys()).sort();
        throw new Error(
            `Unknown plugin or group '${rawSelector}'. Available plugins: ${entries.map(({ id }) => id).join(", ") || "none"}; groups: ${availableGroups.join(", ") || "none"}`,
        );
    }
    return [...new Set(resolved)];
}
