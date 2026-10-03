/** Experimental IR-to-JavaScript emitter for a small, explicit RiX subset. */
import { createHash } from "node:crypto";
import { parse } from "../parser/parser.js";
import { lower } from "../eval/lower.js";

const supportedName = /^[A-Za-z][A-Za-z0-9]*$/;

function unsupported(message) {
    throw new Error(`RiX-to-JS experiment does not support ${message}`);
}

function unwrapDefer(node) {
    if (node?.fn !== "DEFER" || node.args?.length !== 1) unsupported("a non-deferred branch");
    return node.args[0];
}

class Emitter {
    constructor({ freshLiterals = false } = {}) {
        this.integers = new Map();
        this.strings = new Map();
        this.tempIndex = 0;
        this.bindings = new Set();
        this.freshLiterals = freshLiterals;
    }

    temp() { return `d${this.tempIndex++}`; }

    constant(map, value, prefix) {
        if (!map.has(value)) map.set(value, `${prefix}${map.size}`);
        return map.get(value);
    }

    params(spec, { variant = false } = {}) {
        if (!spec || spec.keyword?.length || spec.conditionals?.length || spec.prepStrict || spec.prepUndecided !== "stop") {
            unsupported("keyword arguments, conditional parameters, or strict/undecided prep modes");
        }
        if (spec.positional?.length !== 1) unsupported("functions with other than one positional parameter");
        if (!variant && spec.prep?.length) unsupported("preparation on an ordinary function");
        const env = new Map();
        const names = [];
        for (const [index, param] of (spec.positional || []).entries()) {
            if (!supportedName.test(param.name) || param.holeDefault !== null) {
                unsupported("parameter patterns or defaults");
            }
            const local = `p${index}`;
            env.set(param.name, local);
            names.push(local);
        }
        return { env, names };
    }

    expression(node, env) {
        if (!node?.fn) unsupported("a non-IR expression");
        const args = node.args || [];
        switch (node.fn) {
            case "LITERAL": {
                const value = String(args[0]);
                if (!/^-?\d+$/.test(value)) unsupported(`numeric literal ${value}`);
                if (this.freshLiterals) return `new Integer(${value}n)`;
                return this.constant(this.integers, value, "i");
            }
            case "STRING":
                if (this.freshLiterals) return `({ type: "string", value: ${JSON.stringify(String(args[0]))} })`;
                return this.constant(this.strings, String(args[0]), "s");
            case "RETRIEVE": {
                const name = args[0];
                if (env.has(name)) return env.get(name);
                if (this.bindings.has(name)) return `v_${name}`;
                unsupported(`an unresolved name ${name}`);
                break;
            }
            case "CALL": {
                const name = args[0];
                if (!this.bindings.has(name) || args.length !== 2) unsupported(`call to ${name}`);
                return `rixInvoke(v_${name}, ${this.expression(args[1], env)})`;
            }
            case "MOD":
                return `rixModulo(${this.expression(args[0], env)}, ${this.expression(args[1], env)})`;
            case "EQ":
                return `rixEqual(${this.expression(args[0], env)}, ${this.expression(args[1], env)})`;
            case "UNDECIDED":
                return "UNDECIDED";
            case "ARRAY": {
                if (args.length !== 1 || args[0]?.fn !== "GENERATOR") unsupported("non-generator arrays");
                const generator = args[0].args || [];
                if (generator.length !== 3 || generator[1]?.fn !== "GEN_ADD" || generator[2]?.fn !== "GEN_EAGER_LIMIT") {
                    unsupported("generator forms other than eager arithmetic addition");
                }
                return `rixGenerator(${this.expression(generator[0], env)}, ${this.expression(generator[1].args[0], env)}, ${this.expression(generator[2].args[0], env)})`;
            }
            case "PMAP":
                return `rixMap(${this.expression(args[0], env)}, ${this.expression(args[1], env)})`;
            case "MULTIFUNCTION":
                return `rixMultifunction("<anonymous>", [\n${args.map((variant) => this.variant(variant, false)).join(",\n")}\n])`;
            default:
                unsupported(`IR operation ${node.fn}`);
        }
    }

    returnBody(node, env, indent = "    ") {
        const args = node?.args || [];
        if (node?.fn === "TERNARY") {
            const state = this.temp();
            return `${indent}const ${state} = decisionState(${this.expression(args[0], env)});\n`
                + `${indent}if (${state} === "truth") {\n${this.returnBody(unwrapDefer(args[1]), env, indent + "    ")}${indent}}\n`
                + `${indent}if (${state} === "null") {\n${this.returnBody(unwrapDefer(args[2]), env, indent + "    ")}${indent}}\n`
                + this.returnBody(unwrapDefer(args[3]), env, indent);
        }
        if (node?.fn === "CASE") {
            let output = "";
            for (const branch of args) {
                const inner = unwrapDefer(branch);
                if (inner?.fn !== "CONDITION") {
                    return output + this.returnBody(inner, env, indent);
                }
                const state = this.temp();
                output += `${indent}const ${state} = decisionState(${this.expression(inner.args[0], env)});\n`
                    + `${indent}if (${state} === "truth") {\n${this.returnBody(inner.args[1], env, indent + "    ")}${indent}}\n`
                    + `${indent}if (${state} === "undecided") return UNDECIDED;\n`;
            }
            return output + `${indent}return null;\n`;
        }
        return `${indent}return ${this.expression(node, env)};\n`;
    }

    function(node) {
        const [name, spec, body] = node.args;
        if (!supportedName.test(name)) unsupported(`function name ${name}`);
        const { env, names } = this.params(spec);
        return `const v_${name} = rixFunction(${JSON.stringify(name)}, (${names.join(", ")}) => {\n`
            + this.returnBody(body, env) + `});\n`;
    }

    variant(node, named) {
        const spec = named ? node.args[2] : node.args[0];
        const body = named ? node.args[3] : node.args[1];
        if (!named && node.fn !== "LAMBDA") unsupported("non-lambda multifunction entries");
        const { env, names } = this.params(spec, { variant: true });
        let output = `    { name: ${JSON.stringify(spec.metadata?.variantName || null)}, invoke: (${names.join(", ")}) => {\n`;
        for (const guard of spec.prep || []) {
            const state = this.temp();
            output += `        const ${state} = decisionState(${this.expression(guard, env)});\n`
                + `        if (${state} === "null") return NO_MATCH;\n`
                + `        if (${state} === "undecided") return UNDECIDED;\n`;
        }
        output += this.returnBody(body, env, "        ") + "    } }";
        return output;
    }

    definitions(nodes) {
        const groups = [];
        const seen = new Set();
        for (const node of nodes) {
            if (node.fn === "FUNCDEF") {
                const name = node.args[0];
                if (seen.has(name)) unsupported(`duplicate definition ${name}`);
                seen.add(name);
                groups.push({ name, kind: "function", nodes: [node] });
            } else if (node.fn === "MULTIFUNCDEF") {
                const name = node.args[0];
                if (node.args[1] !== "append") unsupported("multifunction insertion modes other than append");
                const previous = groups.find((group) => group.name === name);
                if (previous) {
                    if (previous.kind !== "multifunction") unsupported(`mixed definition ${name}`);
                    previous.nodes.push(node);
                } else {
                    seen.add(name);
                    groups.push({ name, kind: "multifunction", nodes: [node] });
                }
            } else {
                unsupported(`top-level IR operation ${node.fn}`);
            }
        }
        const definitions = groups.map((group) => {
            this.bindings.add(group.name);
            return group.kind === "function"
                ? this.function(group.nodes[0])
                : `const v_${group.name} = rixMultifunction(${JSON.stringify(group.name)}, [\n${group.nodes.map((node) => this.variant(node, true)).join(",\n")}\n]);\n`;
        }).join("\n");
        return { groups, seen, definitions };
    }

    constants() {
        const integers = [...this.integers].map(([value, name]) => `const ${name} = new Integer(${value}n);`).join("\n");
        const strings = [...this.strings].map(([value, name]) => `const ${name} = Object.freeze({ type: "string", value: ${JSON.stringify(value)} });`).join("\n");
        return `${integers}\n${strings}\n`;
    }

    fastProgram(nodes) {
        if (nodes.length < 2) unsupported("a final expression after definitions");
        const { definitions } = this.definitions(nodes.slice(0, -1));
        const entry = this.expression(nodes.at(-1), new Map());
        return `${this.constants()}${definitions}\nfunction fastRun() { return ${entry}; }\n`;
    }

    module(nodes, { source, sourceName, runtimeImport }) {
        const { groups, seen, definitions } = this.definitions(nodes);
        if (!seen.has("RUN")) unsupported("a missing Run(count) entry point");
        const hash = createHash("sha256").update(source).digest("hex");
        return `// Generated from ${sourceName.replace(/[\r\n]/g, " ")}; trusted build artifact only.\n`
            + `import { Integer } from "@ratmath/core";\n`
            + `import { decisionState, UNDECIDED, NO_MATCH, rixModulo, rixEqual, rixGenerator, rixMap, rixFunction, rixMultifunction, rixInvoke } from ${JSON.stringify(runtimeImport)};\n`
            + `export const sourceHash = ${JSON.stringify(hash)};\n`
            + `${this.constants()}${definitions}\n`
            + `export const rixExports = Object.freeze({ ${groups.map((group) => `${group.name}: v_${group.name}`).join(", ")} });\n`
            + `export function run(count) { return rixInvoke(v_RUN, count instanceof Integer ? count : new Integer(count)); }\n`;
    }
}

export function compileFastRiXProgram(nodes) {
    return new Emitter({ freshLiterals: true }).fastProgram(nodes);
}

export function compileRixToJavaScript(source, options = {}) {
    const nodes = lower(parse(source));
    return new Emitter().module(nodes, {
        source,
        sourceName: options.sourceName || "<source>",
        runtimeImport: options.runtimeImport || "../src/compile/js-runtime.js",
    });
}
