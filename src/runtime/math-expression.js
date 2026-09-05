/** Core expression construction. Algorithms belong to consumers, not constructors. */
import { Integer, Rational } from "@ratmath/core";
import { UNDECIDED } from "./decision.js";

// The schema rename and identity-aware consumer conversion are a separate stage.
export const EXPRESSION_SCHEMA = "rix.calculus.expression@1";
export const expressionField = (value, key) => value?.entries?.get(key.toLowerCase());
const string = value => ({ type: "string", value });
let nextSymbolId = 1;
const SYMBOLS = "__math_symbols__";
export function initializeSymbolScope(environment) {
    if (!environment.has(SYMBOLS)) environment.set(SYMBOLS,new Map());
    return environment;
}

/** Symbol tables follow the same scoped environments retained by closures. */
export function scopedExpressionVariable(context, name, outer = false) {
    const environments = [context.globalScopedEnv, ...context.localScopes.map(scope=>scope.scopedEnv)];
    if (outer) {
        for (let i=environments.length-2; i>=0; i--) {
            const symbol = environments[i].get(SYMBOLS)?.get(name);
            if (symbol) return symbol;
        }
        throw new Error(`No enclosing symbolic variable ::${name}`);
    }
    const environment = environments.at(-1);
    initializeSymbolScope(environment);
    const symbols = environment.get(SYMBOLS);
    if (!symbols.has(name)) symbols.set(name,expressionRecord("variable",[
        ["name",string(name)], ["symbolid",string(`symbol:${nextSymbolId++}`)],
    ]));
    return symbols.get(name);
}

export function hasScopedSymbols(expression) {
    if (!isMathExpression(expression)) return false;
    if (expressionField(expression,"symbolid")) return true;
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(hasScopedSymbols));
}

export function expressionStructuralKey(expression) {
    if (!isMathExpression(expression)) return expressionStructuralKey(expressionConstant(expression));
    const kind=expressionField(expression,"kind")?.value;
    if (kind === "variable") return JSON.stringify([kind,expressionField(expression,"symbolid")?.value ?? ["named",expressionField(expression,"name")?.value]]);
    if (kind === "constant") return JSON.stringify([kind,String(expressionField(expression,"value"))]);
    if (kind === "operator") return JSON.stringify([kind,expressionField(expression,"operation")?.value,expressionField(expression,"operands").values.map(expressionStructuralKey)]);
    if (kind === "apply") return JSON.stringify([kind,expressionField(expression,"semanticid")?.value,expressionField(expression,"arguments").values.map(expressionStructuralKey)]);
    throw new Error("Unsupported mathematical expression kind");
}

export function isMathExpression(value) {
    return value?.type === "map" && expressionField(value, "schema")?.value === EXPRESSION_SCHEMA;
}

export function expressionRecord(kind, fields = []) {
    const method = (name, fn) => ({ type:"method_builtin", name, impl:args => fn(args[0]) });
    const proto = { type:"map", entries:new Map([
        ["RECORD", method("Record", self => self)],
        ["KIND", method("Kind", self => expressionField(self,"kind"))],
        ["OPERANDS", method("Operands", self => expressionField(self,"operands") || {type:"sequence",values:[]})],
        ["SEMANTICID", method("SemanticId", self => expressionField(self,"semanticid") || null)],
    ]) };
    proto.entries.set("SYMBOLID",method("SymbolId",self=>expressionField(self,"symbolid") || null));
    const record = {
        type: "map",
        entries: new Map([
            ["valuekind", string("calculusExpression")],
            ["schema", string(EXPRESSION_SCHEMA)],
            ["kind", string(kind)],
            ...fields,
        ]),
        _ext: new Map([
            ["__type", string("CalculusExpression")],
            ["_type", string("calculus_expression")],
            ["immutable", new Integer(1n)],
            ["_proto", proto],
        ]),
    };
    return record;
}

export function expressionVariable(name) {
    const text = typeof name === "string" ? name : name?.type === "string" ? name.value : null;
    if (!text) throw new Error("Expression variable name must be a nonempty string");
    return expressionRecord("variable", [["name", string(text)]]);
}

export function expressionConstant(value) {
    if (!(value instanceof Integer || value instanceof Rational)) {
        throw new Error("Expression constant currently requires an exact Integer or Rational");
    }
    return expressionRecord("constant", [["value", value]]);
}

export function promoteExpression(value) {
    return isMathExpression(value) ? value : expressionConstant(value);
}

export function expressionOperation(operation, operands) {
    const arity = {add:2,subtract:2,multiply:2,divide:2,power:2,negate:1}[operation];
    if (!arity || !Array.isArray(operands) || operands.length !== arity) throw new Error("Invalid expression operator or arity");
    return expressionRecord("operator", [
        ["operation", string(operation)],
        ["operands", { type: "sequence", values: operands.map(promoteExpression) }],
    ]);
}

export function expressionApplication(semanticId, name, args) {
    return expressionRecord("apply", [
        ["semanticid", string(semanticId)], ["name", string(name)],
        ["arguments", { type: "sequence", values: args.map(promoteExpression) }],
    ]);
}

export function installExpressionVariants(registry) {
    for (const [fn, operation] of Object.entries({ ADD:"add", SUB:"subtract", MUL:"multiply", DIV:"divide", POW:"power", NEG:"negate" })) {
        registry.installVariant(fn, {
            name: `CoreExpression_${fn}`,
            priority: 250,
            prep: args => args.length === (fn === "NEG" ? 1 : 2) && args.some(isMathExpression),
            impl: args => expressionOperation(operation,args),
        });
    }
    for (const operation of ["EQ","NEQ"]) registry.installVariant(operation, {
        name:`CoreExpression_${operation}`, priority:250,
        prep:args=>args.some(isMathExpression),
        impl:args=> {
            if (!args.every(value=>isMathExpression(value) || value instanceof Integer || value instanceof Rational)) return UNDECIDED;
            if (expressionStructuralKey(args[0]) === expressionStructuralKey(args[1])) return operation === "EQ" ? new Integer(1n) : null;
            if (args.every(value=>!isMathExpression(value) || expressionField(value,"kind")?.value === "constant")) return operation === "EQ" ? null : new Integer(1n);
            // Distinct free symbols or trees do not establish mathematical inequality.
            return UNDECIDED;
        },
    });
}

export const expressionSyntaxFunctions = {
    SYMBOL_RETRIEVE: { impl:([name,outer],context)=>scopedExpressionVariable(context,name,outer), lazy:true, pure:false },
};

export const expressionCapabilities = {
    ExpressionKey: { impl:([value])=>string(expressionStructuralKey(value)), pure:true, groups:["Symbolic"], doc:"Identity-aware structural key, not a proof of mathematical inequality" },
    ExpressionHasScopedSymbols: { impl:([value])=>hasScopedSymbols(value) ? new Integer(1n) : null, pure:true, groups:["Symbolic"], doc:"Recognize expressions requiring identity-aware mathematical consumers" },
    SameSymbol: { impl:([left,right])=> {
        const a=expressionField(left,"symbolid")?.value, b=expressionField(right,"symbolid")?.value;
        if (!a || !b) throw new Error("SameSymbol requires two scoped symbolic variables");
        return a===b ? new Integer(1n) : null;
    }, pure:true, groups:["Symbolic"], doc:"Compare symbol identities independently of mathematical equality" },
    ExpressionVariable: { impl: ([name]) => expressionVariable(name), pure:true, groups:["Symbolic"], doc:"Construct a mathematical variable expression without loading a plugin" },
    ExpressionConstant: { impl: ([value]) => expressionConstant(value), pure:true, groups:["Symbolic"], doc:"Construct an exact mathematical constant expression" },
    ExpressionOperation: { impl: ([operation, operands]) => expressionOperation(operation?.value,operands?.values), pure:true, groups:["Symbolic"], doc:"Construct a validated mathematical arithmetic node" },
    ExpressionApply: { impl: ([id, name, args]) => {
        if (id?.type !== "string" || name?.type !== "string" || !Array.isArray(args?.values)) throw new Error("ExpressionApply requires semantic ID, name, and arguments");
        return expressionApplication(id.value,name.value,args.values);
    }, pure:true, groups:["Symbolic"], doc:"Construct a mathematical function application" },
    IsExpression: { impl: ([value]) => isMathExpression(value) ? new Integer(1n) : null, pure:true, groups:["Symbolic"], doc:"Recognize a core mathematical expression" },
};
