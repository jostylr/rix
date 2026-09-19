/** Bounded, host-granted assets for inert portable output documents. */
import { encodeOutputJSON, decodeOutputJSON, snapshotOutputDocument } from "./output-json.js";

export const OUTPUT_BUNDLE_SCHEMA = "rix.output.bundle@1";
export const OUTPUT_ASSET_MANIFEST_SCHEMA = "rix.output.asset-manifest@1";
export const OUTPUT_ASSET_LIMITS = Object.freeze({ maxAssets: 128, maxAssetBytes: 16_000_000, maxTotalBytes: 64_000_000, maxPixels: 16_000_000, maxDimension: 32768, maxReadMs: 5000 });
const EXTENSIONS = Object.freeze({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm", "text/plain": "txt", "application/json": "json", "application/pdf": "pdf" });
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const error = (message, code = "asset-invalid") => Object.assign(new Error(message), { code });
function limits(options = {}) {
    const result = { ...OUTPUT_ASSET_LIMITS };
    for (const key of Object.keys(result)) {
        if (options[key] !== undefined) result[key] = options[key];
        if (!Number.isSafeInteger(result[key]) || result[key] < 1 || result[key] > OUTPUT_ASSET_LIMITS[key] * 16) throw error(`Invalid ${key}`, "asset-limit-invalid");
    }
    return result;
}
export function normalizeAssetReference(value) {
    const ref = String(value || "");
    if (!ref || ref.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(ref) || ref.startsWith("/") || /[?#]/.test(ref)) throw error("Asset references must be safe relative paths or explicit package/content references", "asset-path-invalid");
    if (/^sha256:[a-f0-9]{64}$/.test(ref)) return ref;
    let path = ref;
    if (ref.startsWith("package:")) {
        const match = /^package:([a-z0-9][a-z0-9._-]*)\/(.+)$/i.exec(ref);
        if (!match) throw error("Invalid package asset reference", "asset-path-invalid");
        path = match[2];
    } else if (ref.includes(":")) throw error("Unsupported asset reference scheme", "asset-path-invalid");
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { throw error("Invalid asset path encoding", "asset-path-invalid"); }
    if (decoded !== path || path.split("/").some(part => !part || part === "." || part === "..") || /[:\\]/.test(path)) throw error("Asset traversal or encoded paths are not allowed", "asset-path-invalid");
    return ref;
}
export function isExternalAssetReference(ref) {
    try {
        if (typeof ref !== "string" || ref.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(ref)) return false;
        const url = new URL(ref);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
}
function bytes(value, budget) {
    const data = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : typeof value === "string" ? textEncoder.encode(value) : null;
    if (!data) throw error("Asset store must return bytes or text", "asset-store-invalid");
    if (data.byteLength > budget) throw error("Asset byte budget exceeded", "asset-byte-limit");
    return data;
}
export function createMemoryAssetStore(entries = new Map()) {
    const source = entries instanceof Map ? entries : new Map(Object.entries(entries));
    return Object.freeze({
        async readAsset(ref, { maxBytes = OUTPUT_ASSET_LIMITS.maxAssetBytes } = {}) {
            normalizeAssetReference(ref);
            if (!source.has(ref)) throw error("Asset is not present in the host's granted store", "asset-missing");
            const value = source.get(ref);
            return bytes(value?.bytes ?? value, maxBytes).slice();
        },
    });
}
export async function hashAssetBytes(data) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
function signature(data, prefix, at = 0) { return prefix.every((value, index) => data[at + index] === value); }
function ascii(data, start, end) { return String.fromCharCode(...data.subarray(start, end)); }
function dimensions(data, mime) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (mime === "image/png" && data.length >= 45 && signature(data, [137,80,78,71,13,10,26,10]) && ascii(data, 12, 16) === "IHDR" && ascii(data, data.length - 8, data.length - 4) === "IEND") return { width: view.getUint32(16), height: view.getUint32(20) };
    if (mime === "image/gif" && data.length >= 14 && ["GIF87a", "GIF89a"].includes(ascii(data, 0, 6)) && data.at(-1) === 59) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (mime === "image/jpeg" && signature(data, [255,216]) && signature(data, [255,217], data.length - 2)) {
        let offset = 2;
        while (offset + 4 < data.length) {
            if (data[offset++] !== 255) throw error("Invalid JPEG segment");
            const marker = data[offset++];
            if (marker === 255) { offset--; continue; }
            const size = view.getUint16(offset);
            if (size < 2 || offset + size > data.length) break;
            if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 8) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
            offset += size;
        }
    }
    if (mime === "image/svg+xml") {
        const source = textDecoder.decode(data);
        if (!/<svg(?:\s|>)/i.test(source) || /<\s*(?:script|style|foreignObject|animate|set|!DOCTYPE|!ENTITY)\b|\bon[a-z]+\s*=|@import|<\?xml-stylesheet|xml:base\s*=|&#|\\/i.test(source) || /(?:href|src)\s*=\s*["'](?!#)[^"']+/i.test(source) || [...source.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^["']|["']$/g, "").startsWith("#"))) throw error("SVG must be a self-contained static image", "asset-svg-active");
        const tag = source.match(/<svg\b[^>]*>/i)[0];
        const width = Number(tag.match(/\bwidth=["']([\d.]+)(?:px)?["']/i)?.[1]);
        const height = Number(tag.match(/\bheight=["']([\d.]+)(?:px)?["']/i)?.[1]);
        const box = tag.match(/\bviewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i);
        return { width: width || Number(box?.[1]), height: height || Number(box?.[2]) };
    }
    if (mime.startsWith("image/")) throw error(`Bytes do not identify a supported ${mime} image`, "asset-mime-mismatch");
    const valid = mime === "audio/wav" ? ascii(data,0,4)==="RIFF" && ascii(data,8,12)==="WAVE"
        : mime === "audio/mpeg" ? ascii(data,0,3)==="ID3" || (data[0]===255 && (data[1]&224)===224)
        : mime === "audio/ogg" ? ascii(data,0,4)==="OggS"
        : mime === "video/mp4" ? ascii(data,4,8)==="ftyp"
        : mime === "video/webm" ? signature(data,[26,69,223,163])
        : mime === "application/pdf" ? ascii(data,0,5)==="%PDF-"
        : mime === "text/plain" || mime === "application/json";
    if (!valid) throw error(`Asset bytes do not match ${mime}`, "asset-mime-mismatch");
    if (mime === "text/plain" || mime === "application/json") {
        const value = textDecoder.decode(data);
        if (mime === "application/json") JSON.parse(value);
    }
    return {};
}
function validate(data, asset, policy) {
    if (!EXTENSIONS[asset.mime]) throw error(`Unsupported asset MIME ${asset.mime}`, "asset-mime-unsupported");
    const size = dimensions(data, asset.mime);
    if (asset.bytes != null && asset.bytes !== data.length) throw error("Declared asset size does not match bytes", "asset-size-mismatch");
    if (asset.mime.startsWith("image/")) {
        if (![size.width, size.height].every(value => Number.isFinite(value) && value > 0 && value <= policy.maxDimension) || size.width * size.height > policy.maxPixels) throw error("Image dimension/pixel budget exceeded or unknown", "asset-dimension-limit");
        for (const key of ["width", "height"]) if (asset[key] != null && Number(asset[key]) !== size[key]) throw error(`Declared image ${key} does not match bytes`, "asset-dimension-mismatch");
    }
    return size;
}
async function readBounded(reader, reference, policy) {
    const abort = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => reader(reference, { maxBytes: policy.maxAssetBytes, signal: abort.signal })),
            new Promise((_,reject) => { timer=setTimeout(() => { abort.abort(); reject(error("Asset read timed out", "asset-read-timeout")); }, policy.maxReadMs); }),
        ]);
    } finally { clearTimeout(timer); }
}

/** Resolve records in order; unresolved entries stay visible and never trigger ambient I/O. */
export async function resolveAssetManifest(assets, options = {}) {
    const policy = limits(options);
    if (!Array.isArray(assets) || assets.length > policy.maxAssets) throw error("Asset count budget exceeded", "asset-count-limit");
    const files = new Map(), pathsByHash = new Map(), entries = [], diagnostics = [];
    let totalBytes = 0;
    for (let index = 0; index < assets.length; index++) {
        const asset = assets[index] || {}, id = String(asset.id || `asset-${index + 1}`), source = String(asset.source || `$.assets[${index}]`);
        const base = { id, source, mime: String(asset.mime || "").toLowerCase() };
        try {
            const ref = String(asset.ref || asset.path || "");
            if (isExternalAssetReference(ref) && !options.authorizeExternal) {
                entries.push({ ...base, status: "reference", ref });
                diagnostics.push({ code: "asset-external-inert", source, assetId: id, message: "External media remains a link; no bytes were fetched" });
                continue;
            }
            let data;
            if (isExternalAssetReference(ref)) {
                if (await readBounded(() => options.authorizeExternal(ref, asset), ref, policy) !== true || typeof options.store?.readExternalAsset !== "function") throw error("External asset is not authorized by this host", "asset-external-denied");
                data = await readBounded(options.store.readExternalAsset.bind(options.store), ref, policy);
            } else {
                normalizeAssetReference(ref);
                if (typeof options.store?.readAsset !== "function") throw error("Host has no granted asset store", "asset-store-unavailable");
                data = await readBounded(options.store.readAsset.bind(options.store), ref, policy);
            }
            data = bytes(data, policy.maxAssetBytes);
            const size = validate(data, { ...asset, mime: base.mime }, policy);
            const digest = await hashAssetBytes(data);
            if (ref.startsWith("sha256:") && ref.slice(7) !== digest) throw error("Content-addressed asset hash mismatch", "asset-hash-mismatch");
            if (asset.integrity && ![`sha256:${digest}`, `sha256-${base64(Uint8Array.from(digest.match(/../g), part => parseInt(part,16)))}`].includes(asset.integrity)) throw error("Asset integrity hash mismatch", "asset-hash-mismatch");
            const path = pathsByHash.get(digest) || `assets/${digest}.${EXTENSIONS[base.mime]}`;
            if (!files.has(path)) {
                if (totalBytes + data.length > policy.maxTotalBytes) throw error("Total asset byte budget exceeded", "asset-total-limit");
                files.set(path, data.slice()); pathsByHash.set(digest, path); totalBytes += data.length;
            }
            entries.push({ ...base, status: "resolved", ref: path, digest, bytes: data.length, ...size });
        } catch (failure) {
            entries.push({ ...base, status: "unavailable", ref: `unavailable:asset-${index + 1}` });
            diagnostics.push({ code: failure.code?.startsWith("asset-") ? failure.code : "asset-read-failed", source, assetId: id, message: failure.code?.startsWith("asset-") ? failure.message : "Asset could not be read or validated" });
        }
    }
    return { schema: OUTPUT_ASSET_MANIFEST_SCHEMA, entries, diagnostics, files, totalBytes };
}
function scalar(value) { return value?.type === "string" ? value.value : typeof value?.value === "bigint" ? Number(value.value) : value; }
function collectAssets(value) {
    const records = [], seen = new Set();
    function walk(node, path) {
        if (!node || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        if (node.type === "output" && node.kind === "asset") records.push({ node, asset: { ...node, id: `asset-${records.length+1}`, source: path } });
        if (node.type === "map" && node.entries instanceof Map && node.entries.get("schema")?.value === "rix.document.assets@1") {
            for (const [index, asset] of (node.entries.get("assets")?.values || []).entries()) {
                const fields = Object.fromEntries([...asset.entries].map(([key, entry]) => [key, scalar(entry)]));
                records.push({ node: asset, manifest: true, asset: { ...fields, ref: fields.path, integrity: fields.checksum, source: `${path}.assets[${index}]` } });
            }
        }
        if (Array.isArray(node)) node.forEach((entry,index) => walk(entry, `${path}[${index}]`));
        else if (node instanceof Map) for (const [key,entry] of node) walk(entry, `${path}.${key}`);
        else if ([Object.prototype, null].includes(Object.getPrototypeOf(node))) for (const [key,entry] of Object.entries(node)) if (key !== "_ext") walk(entry, `${path}.${key}`);
    }
    walk(value, "$");
    return records;
}
function rewrite(value, replacements, seen = new Map()) {
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) { const result=[]; seen.set(value,result); result.push(...value.map(entry => rewrite(entry,replacements,seen))); return result; }
    if (value instanceof Map) { const result=new Map(); seen.set(value,result); for (const [key,entry] of value) result.set(key,rewrite(entry,replacements,seen)); return result; }
    if (![Object.prototype,null].includes(Object.getPrototypeOf(value))) return value;
    const result={}; seen.set(value,result);
    for (const [key,entry] of Object.entries(value)) result[key] = key === "_ext" ? entry : rewrite(entry,replacements,seen);
    const replacement=replacements.get(value);
    if (replacement) {
        if (value.type === "map") {
            result.entries.set("path",{type:"string",value:replacement.ref});
            if (replacement.digest) result.entries.set("checksum",{type:"string",value:`sha256:${replacement.digest}`});
        }
        else Object.assign(result,{ref:replacement.ref,bytes:replacement.bytes??value.bytes,width:replacement.width??value.width,height:replacement.height??value.height,integrity:replacement.digest?`sha256:${replacement.digest}`:value.integrity});
    }
    return result;
}
export async function bundleOutputDocument(value, options = {}) {
    const snapshot = decodeOutputJSON(encodeOutputJSON(snapshotOutputDocument(value), options.documentLimits), { ...options.documentLimits, unknownTags: "strict-error" }).value;
    const records = collectAssets(snapshot);
    const resolved = await resolveAssetManifest(records.map(record => record.asset), options);
    const replacements = new Map(records.map((record,index) => [record.node,resolved.entries[index]]));
    return { schema: OUTPUT_BUNDLE_SCHEMA, document: rewrite(snapshot,replacements), manifest: { schema: resolved.schema, entries: resolved.entries, diagnostics: resolved.diagnostics, totalBytes: resolved.totalBytes }, files: resolved.files };
}
function base64(data) { let binary=""; for (let start=0;start<data.length;start+=32768) binary+=String.fromCharCode(...data.subarray(start,start+32768)); return btoa(binary); }
export function encodeOutputBundle(bundle, options = {}) {
    const policy=limits(options);
    if (bundle.schema !== OUTPUT_BUNDLE_SCHEMA || !(bundle.files instanceof Map) || bundle.files.size>policy.maxAssets || bundle.manifest?.schema!==OUTPUT_ASSET_MANIFEST_SCHEMA) throw error("Invalid output bundle");
    let total=0;
    const files=[...bundle.files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,value])=>{
        normalizeAssetReference(path);
        if (!/^assets\/[a-f0-9]{64}\.[a-z]+$/.test(path)) throw error("Invalid bundled path");
        const data=bytes(value,policy.maxAssetBytes);
        if ((total+=data.length)>policy.maxTotalBytes) throw error("Total bundled asset byte budget exceeded");
        return {path,encoding:"base64",content:base64(data)};
    });
    return JSON.stringify({schema:OUTPUT_BUNDLE_SCHEMA,document:JSON.parse(encodeOutputJSON(bundle.document,options.documentLimits)),manifest:bundle.manifest,files});
}

/** Decode validates all bytes and references without invoking a host, evaluator, or network. */
export async function decodeOutputBundle(source, options = {}) {
    const policy=limits(options);
    if (typeof source!=="string" || source.length>policy.maxTotalBytes*2+8_000_000) throw error("Output bundle byte budget exceeded");
    const value=JSON.parse(source);
    if (value.schema!==OUTPUT_BUNDLE_SCHEMA || !Array.isArray(value.files) || value.files.length>policy.maxAssets || value.manifest?.schema!==OUTPUT_ASSET_MANIFEST_SCHEMA || !Array.isArray(value.manifest.entries) || !Array.isArray(value.manifest.diagnostics)) throw error("Invalid output bundle schema");
    const files=new Map(), digests=new Set(); let total=0;
    for (const file of value.files) {
        normalizeAssetReference(file.path);
        if (!/^assets\/[a-f0-9]{64}\.[a-z]+$/.test(file.path) || files.has(file.path) || file.encoding!=="base64" || typeof file.content!=="string" || file.content.length>Math.ceil(policy.maxAssetBytes/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw error("Invalid bundled file");
        const data=bytes(Uint8Array.from(atob(file.content),value=>value.charCodeAt(0)),policy.maxAssetBytes);
        if ((total+=data.length)>policy.maxTotalBytes) throw error("Total bundled asset byte budget exceeded");
        const digest=await hashAssetBytes(data);
        if (!file.path.startsWith(`assets/${digest}.`) || !Object.values(EXTENSIONS).includes(file.path.split(".").at(-1))) throw error("Bundled asset digest/path mismatch");
        if (digests.has(digest)) throw error("Duplicate bundled content hash");
        digests.add(digest); files.set(file.path,data);
    }
    if (value.manifest.totalBytes!==total || value.manifest.entries.length>policy.maxAssets || value.manifest.diagnostics.length>policy.maxAssets) throw error("Invalid manifest size/count");
    for (const item of value.manifest.diagnostics) {
        if (!item || ["code", "source", "assetId", "message"].some(key => typeof item[key] !== "string")) throw error("Invalid asset diagnostic");
    }
    const declared=new Map(), referenced=new Set();
    for (const entry of value.manifest.entries) {
        if (typeof entry.id!=="string" || typeof entry.source!=="string" || typeof entry.mime!=="string" || typeof entry.ref!=="string") throw error("Invalid asset manifest entry");
        if (entry.status==="resolved") {
            const data=files.get(entry.ref);
            if (!data || entry.digest!==entry.ref.split("/")[1].split(".")[0] || !Number.isSafeInteger(entry.bytes)) throw error("Dangling or malformed bundled asset");
            validate(data,entry,policy); referenced.add(entry.ref);
        } else if (entry.status==="reference") { if (!isExternalAssetReference(entry.ref)) throw error("Invalid external asset reference"); }
        else if (entry.status!=="unavailable" || !/^unavailable:[^\s]+$/.test(entry.ref)) throw error("Invalid asset resolution status");
        const previous=declared.get(`${entry.ref}\0${entry.mime}`);
        if (previous && previous.status!==entry.status) throw error("Conflicting asset manifest entries");
        declared.set(`${entry.ref}\0${entry.mime}`,entry);
    }
    if (referenced.size!==files.size) throw error("Undeclared bundled file");
    const document=decodeOutputJSON(JSON.stringify(value.document), {...options.documentLimits,unknownTags:"strict-error"}).value;
    for (const {asset} of collectAssets(document)) {
        const entry=declared.get(`${asset.ref}\0${asset.mime}`);
        if (!entry) throw error("Document asset is absent from manifest");
        if (entry.status==="resolved") {
            const data=files.get(asset.ref); validate(data,asset,policy);
            if (asset.integrity && asset.integrity!==`sha256:${entry.digest}`) throw error("Document asset integrity does not match manifest");
        }
    }
    return {schema:OUTPUT_BUNDLE_SCHEMA,document,manifest:value.manifest,files};
}
