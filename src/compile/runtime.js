/** Runtime bridge for trusted, ahead-of-time RiX modules. */
import { dirname } from "node:path";
import { evaluate, formatValue, parseAndEvaluate, parseAndEvaluateAsync } from "../eval/index-node.js";
import { Context } from "../runtime/context.js";
import { isHole } from "../runtime/hole.js";

export { evaluate, formatValue, isHole };

function checkOptions(options) {
    if (options.sourceLimits || options.operatorDefinitions || options.systemLookup || options.operatorOwner) {
        throw new Error("Compiled RiX uses the operator and source policy fixed at build time; interpret this source to change those options");
    }
}

function scriptOptions(options) {
    const context = options.context || new Context();
    if (!context.env.has("scriptBaseDir") && options.file) {
        context.setEnv("scriptBaseDir", dirname(options.file));
    }
    return { ...options, context };
}

export function runCompiled(source, irNodes, dispatch, options = {}) {
    checkOptions(options);
    return parseAndEvaluate(source, { ...scriptOptions(options), preLoweredIR: irNodes, compiledDispatch: dispatch });
}

export function runCompiledAsync(source, irNodes, options = {}) {
    checkOptions(options);
    // Async constructs retain the async evaluator for now. The source is still
    // parsed and lowered at build time, so no source parsing occurs here.
    return parseAndEvaluateAsync(source, { ...scriptOptions(options), preLoweredIR: irNodes });
}
