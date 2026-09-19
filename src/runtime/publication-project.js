import { PUBLICATION_PROJECT_SCHEMA, publicationField, publicationRecord, safePublicationPath, resolvePublicationPlan, validatePublicationTree, visitPublicationTree } from "./publication-plan.js";

const text = value => value?.type === "string" ? value.value : value;
const seq = value => Array.isArray(value) ? value : value?.values;
const fail = message => { throw new Error(`Publication project: ${message}`); };

export function createPublicationProject(documents, options = {}) {
    const entries=seq(documents);
    if(!entries?.length || entries.length>256) fail("requires 1…256 documents");
    const type=text(publicationField(options,"type","website"));
    const title=text(publicationField(options,"title","RiX publication"));
    if(!["website","book","default"].includes(type) || typeof title!=="string" || title.length>4096) fail("invalid project type/title");
    const paths=new Map();
    const docs=entries.map(entry=>{
        const path=safePublicationPath(publicationField(entry,"path"));
        const value=publicationField(entry,"value"),name=text(publicationField(entry,"title",path));
        if(!path.endsWith(".qmd") || paths.has(path) || value?.type!=="output" || typeof name!=="string" || name.length>4096) fail("documents require unique .qmd paths, titles and retained outputs");
        const labels=validatePublicationTree(value,resolvePublicationPlan(value)).labels;
        paths.set(path,labels);return {path,title:name,value};
    });
    if(type==="book" && docs[0].path!=="index.qmd") fail("book projects require index.qmd as their first document");
    // Cross-document links reuse ordinary Link nodes and their existing source spelling.
    for(const doc of docs) visitPublicationTree(doc.value,(node,path)=>{
        if(node.kind!=="link" || typeof node.href!=="string" || /^[a-z][a-z0-9+.-]*:/i.test(node.href) || !node.href.split("#")[0].endsWith(".qmd")) return;
        const [ref,fragment,...extra]=node.href.split("#");
        if(extra.length) fail(`invalid cross-document link at ${path}`);
        const parts=doc.path.split("/").slice(0,-1);
        for(const part of ref.split("/")) {
            if(part==="..") {if(!parts.length) fail(`link leaves project at ${path}`);parts.pop();}
            else if(part!==".") parts.push(part);
        }
        const target=parts.join("/");
        if(!paths.has(target) || fragment && !paths.get(target).has(fragment)) fail(`unresolved cross-document link ${node.href} at ${path}`);
    });
    return publicationRecord({schema:PUBLICATION_PROJECT_SCHEMA,projectType:type,title,documents:docs});
}

export function readPublicationProject(value) {
    if(text(publicationField(value,"schema"))!==PUBLICATION_PROJECT_SCHEMA) fail("unsupported project schema");
    // Revalidate imported, potentially edited records before generating files.
    const checked=createPublicationProject(publicationField(value,"documents"),{type:publicationField(value,"projectType"),title:publicationField(value,"title")});
    return {type:text(publicationField(checked,"projectType")),title:text(publicationField(checked,"title")),documents:seq(publicationField(checked,"documents")).map(entry=>({
        path:text(publicationField(entry,"path")),title:text(publicationField(entry,"title")),value:publicationField(entry,"value"),
    }))};
}
