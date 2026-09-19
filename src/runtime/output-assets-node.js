/** Filesystem asset access is opt-in and confined to explicitly granted roots. */
import { realpathSync, fstatSync, openSync, readSync, closeSync, constants } from "node:fs";
import path from "node:path";
import { normalizeAssetReference, OUTPUT_ASSET_LIMITS } from "./output-assets.js";

function within(root, target) {
    const relative=path.relative(root,target);
    return relative==="" || (!relative.startsWith(`..${path.sep}`) && relative!==".." && !path.isAbsolute(relative));
}
export function createNodeAssetStore({ roots = [], packages = {}, contentPaths = {} } = {}) {
    const granted=roots.map(root=>realpathSync(root));
    const packageRoots=new Map(Object.entries(packages).map(([id,root])=>[id,realpathSync(root)]));
    return Object.freeze({
        async readAsset(reference,{ maxBytes=OUTPUT_ASSET_LIMITS.maxAssetBytes, signal }={}) {
            normalizeAssetReference(reference);
            if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > OUTPUT_ASSET_LIMITS.maxAssetBytes * 16) throw new Error("Invalid asset byte budget");
            if (reference.startsWith("sha256:")) {
                reference = contentPaths[reference];
                if (!reference) throw Object.assign(new Error("Content hash is absent from the granted host index"),{code:"asset-missing"});
                normalizeAssetReference(reference);
            }
            signal?.throwIfAborted();
            const match=/^package:([^/]+)\/(.+)$/.exec(reference);
            const candidates=match ? (packageRoots.has(match[1])?[packageRoots.get(match[1])]:[]) : granted;
            const relative=match?match[2]:reference;
            for(const root of candidates){
                let target;
                try { target=realpathSync(path.resolve(root,relative)); } catch(failure) { if(failure.code==="ENOENT")continue; throw Object.assign(new Error("Asset cannot be read within the granted root"),{code:"asset-read-failed"}); }
                if(!within(root,target))throw Object.assign(new Error("Asset escapes the host's granted root"),{code:"asset-root-denied"});
                const descriptor=openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
                try {
                    const info=fstatSync(descriptor);
                    if(!info.isFile() || info.size>maxBytes)throw Object.assign(new Error("Asset is not a regular file within the byte budget"),{code:"asset-byte-limit"});
                    const data=new Uint8Array(info.size);
                    let offset=0;
                    while(offset<data.length){ signal?.throwIfAborted(); const amount=readSync(descriptor,data,offset,data.length-offset,offset); if(!amount)throw new Error("Asset changed while reading"); offset+=amount; }
                    const extra=new Uint8Array(1);
                    if(readSync(descriptor,extra,0,1,data.length)!==0)throw new Error("Asset grew while reading");
                    return data;
                }finally{closeSync(descriptor);}
            }
            throw Object.assign(new Error("Asset is absent from the host's granted roots"),{code:"asset-missing"});
        },
    });
}
