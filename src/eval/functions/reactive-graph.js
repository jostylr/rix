import {
    createReactiveGraph,
    isReactiveNode,
    REACTIVE_READ_ENV,
} from "../../runtime/reactive-graph.js";
import { containsOuterRead, deferredSource } from "./formula-sheet.js";

function reactiveGraphCapability(args, context, evaluate) {
    if (args.length > 1) throw new Error(".ReactiveGraph accepts at most one identifier string");
    const requestedId = args[0]?.type === "string" ? args[0].value : args[0] ?? null;
    if (requestedId !== null && typeof requestedId !== "string") {
        throw new Error(".ReactiveGraph identifier must be a string");
    }

    let graph = null;
    graph = createReactiveGraph({
        id: requestedId || undefined,
        formulaSource: deferredSource,
        evaluateFormula(formula) {
            if (containsOuterRead(formula.args[0])) {
                throw new Error("Reactive formulas cannot access caller bindings with @; use graph nodes");
            }
            const bindings = graph.bindings();
            const previousRead = context.getEnv(REACTIVE_READ_ENV, undefined);
            context.push(bindings, {
                isolated: true,
                callableBoundary: true,
            });
            context.setEnv(REACTIVE_READ_ENV, (value) => {
                if (isReactiveNode(value) && value.graph === graph) return value.get();
                return typeof previousRead === "function" ? previousRead(value) : value;
            });
            try {
                return context.withSharedBody(formula.args[0], () => evaluate(formula.args[0]));
            } finally {
                context.setEnv(REACTIVE_READ_ENV, previousRead);
                context.pop();
            }
        },
    });
    return graph;
}

export const reactiveGraphFunctions = {
    REACTIVEGRAPH: {
        pure: false,
        impl: reactiveGraphCapability,
        doc: "Create a transactional graph of reactive source and computed nodes",
    },
};
