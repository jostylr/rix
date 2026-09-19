/** Conservative source optimization after certified coordinate lowering.
 * No geometry is removed, merged, reordered, or rounded; vertex/marker counts,
 * IDs, semantic attributes, and the lowering evidence remain unchanged.
 */
function decimal(value) {
    const match = value.match(/^(-?)(\d*)(?:\.(\d*))?$/);
    if (!match) return value;
    const integer = (match[2] || "0").replace(/^0+(?=\d)/, "");
    const fraction = (match[3] || "").replace(/0+$/, "");
    const zero = integer === "0" && !fraction;
    return `${zero ? "" : match[1]}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function optimizePathData(source) {
    // This intentionally recognizes only the absolute commands emitted by RiX.
    // Foreign syntax, including exponent notation, is preserved verbatim.
    const tokens = source.match(/[MLHVQCAZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/g);
    if (!tokens || source.replace(/[MLHVQCAZ\s,\d.\-]/g, "")) return source;
    const sizes = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0 };
    const output = [];
    let x = null, y = null, startX = null, startY = null;
    for (let index = 0; index < tokens.length;) {
        let command = tokens[index++];
        const count = sizes[command];
        if (count === undefined || index + count > tokens.length) return source;
        const values = tokens.slice(index, index + count).map(decimal);
        if (values.some((value) => !/^-?\d+(?:\.\d+)?$/.test(value))) return source;
        index += count;
        if (command === "L") {
            const [nextX, nextY] = values;
            if (nextY === y) { command = "H"; values.splice(1, 1); }
            else if (nextX === x) { command = "V"; values.splice(0, 1); }
            x = nextX; y = nextY;
        } else if (command === "Z") { x = startX; y = startY; }
        else if (command === "H") x = values[0];
        else if (command === "V") y = values[0];
        else {
            x = values.at(-2); y = values.at(-1);
            if (command === "M") { startX = x; startY = y; }
        }
        output.push(command + values.join(" "));
    }
    const compact = output.join("");
    return compact.length < source.length ? compact : source;
}

export function optimizeSvgSource(source) {
    let paths = 0, gradients = 0;
    let content = source.replace(/(<path\b[^>]*?\sd=")([^"]*)(")/g, (all, before, path, after) => {
        const optimized = optimizePathData(path);
        if (optimized !== path) paths += 1;
        return before + optimized + after;
    });
    const definitions = new Map();
    content = content.replace(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/g, (all, attributes, children) => {
        const id = attributes.match(/\bid="([^"]+)"/)?.[1];
        if (!id) return all;
        const key = attributes.replace(/\s*\bid="[^"]+"/, "") + children;
        const original = definitions.get(key);
        if (!original) { definitions.set(key, id); return all; }
        if (original === id) return all;
        const alias = `<linearGradient id="${id}" href="#${original}"/>`;
        if (alias.length >= all.length) return all;
        gradients += 1;
        return alias;
    });
    return { content, metadata: { schema: "rix.svg.optimization@1", paths, gradients, savedCharacters: source.length - content.length } };
}
