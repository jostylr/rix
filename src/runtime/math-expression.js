/** Core expression construction. Algorithms belong to consumers, not constructors. */
import { Integer, Rational } from "@ratmath/core";
import { UNDECIDED } from "./decision.js";
import {constantKey,constantEquality,constantProviderInfo,isExpressionScalar,isEnclosureConstant} from "./math-constant.js";
import {adaptRealConstant,refineRealConstant} from "./math-real.js";

// The schema rename and identity-aware consumer conversion are a separate stage.
export const EXPRESSION_SCHEMA = "rix.calculus.expression@1";
export const expressionField = (value, key) => value?.entries?.get(key.toLowerCase());
const string = value => ({ type: "string", value });
let nextSymbolId = 1;
const SYMBOLS = "__math_symbols__";
const DEFINITION_TOKEN = "__math_definition_token";
// An opaque function token is preserved by RiX value copies. Only this module
// can associate it with definition state; no execution context is retained.
const definitions = new WeakMap();
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
    if (!symbols.has(name)) {
        if (context.localScopes.at(-1)?.readOnly || (!context.localScopes.length && context.globalReadOnly)) throw new Error("Cannot introduce a symbol in a read-only scope");
        const symbol=freshExpressionSymbol(name);
        symbols.set(name,symbol);
    }
    return symbols.get(name);
}

export function freshExpressionSymbol(name, bound = false) {
    const symbol=expressionRecord("variable",[
        ["name",string(name)], ["symbolid",string(`symbol:${nextSymbolId++}`)],
        ...(bound ? [["bound",new Integer(1n)]] : []),
    ]);
    const token=()=> { throw new Error("Opaque mathematical identity is not callable"); };
    definitions.set(token,{value:null,id:expressionField(symbol,"symbolid").value,name});
    symbol._ext.set(DEFINITION_TOKEN,token);
    return symbol;
}

function symbolState(symbol) {
    const id=expressionField(symbol,"symbolid")?.value;
    if (!id) return null;
    const state=definitions.get(symbol?._ext?.get(DEFINITION_TOKEN));
    if (!isMathExpression(symbol) || expressionField(symbol,"kind")?.value !== "variable" || !state || state.id !== id || state.name !== expressionField(symbol,"name")?.value) {
        throw new Error("Invalid scoped symbol identity");
    }
    return state;
}

export function expressionDefinition(symbol) {
    return symbolState(symbol)?.value ?? null;
}

/** Loader-only installation: fresh identities, never programming-scope writes. */
export function restoreExpressionDefinition(symbol, value) {
    const state=symbolState(symbol);
    if (!state || state.value || expressionField(symbol,"bound")) throw new Error("Invalid saved symbolic definition");
    const expression=promoteExpression(value);
    if (referencesSymbol(expression,state.id)) throw new Error("Cyclic saved symbolic definition");
    state.value=expression;
}

function referencesSymbol(expression, id, seen = new Set()) {
    if (!isMathExpression(expression) || seen.has(expression)) return false;
    seen.add(expression);
    if (expressionField(expression,"symbolid")?.value === id) return true;
    const definition=expressionDefinition(expression);
    if (definition && referencesSymbol(definition,id,seen)) return true;
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(value=>referencesSymbol(value,id,seen)));
}

function defineExpressionSymbol(name, node, context, evaluate) {
    if (context.localScopes.at(-1)?.readOnly || (!context.localScopes.length && context.globalReadOnly)) throw new Error("Cannot define a symbol in a read-only scope");
    const symbol=scopedExpressionVariable(context,name);
    const state=definitions.get(symbol._ext.get(DEFINITION_TOKEN));
    if (state.value) throw new Error(`Symbolic definition ::${name} is immutable`);
    const finish=value=> {
        if (state.value) throw new Error(`Symbolic definition ::${name} is immutable`);
        const expression=promoteExpression(value);
        if (referencesSymbol(expression,expressionField(symbol,"symbolid").value)) throw new Error(`Cyclic symbolic definition for ::${name}`);
        state.value=expression;
        return symbol;
    };
    const value=evaluate(node,context);
    return value instanceof Promise ? value.then(finish) : finish(value);
}

export function expandExpression(expression, memo = new Map()) {
    expression=promoteExpression(expression);
    if (memo.has(expression)) return memo.get(expression);
    const definition=expressionDefinition(expression);
    if (definition) {
        const result=expandExpression(definition,memo);
        memo.set(expression,result);
        return result;
    }
    const kind=expressionField(expression,"kind")?.value;
    let result=expression;
    if (kind === "operator") result=expressionOperation(expressionField(expression,"operation").value,
        expressionField(expression,"operands").values.map(value=>expandExpression(value,memo)));
    if (kind === "apply") result=expressionApplication(expressionField(expression,"semanticid").value,expressionField(expression,"name").value,
        expressionField(expression,"arguments").values.map(value=>expandExpression(value,memo)));
    memo.set(expression,result);
    return result;
}

function equalityTree(expression) {
    const operation=expressionField(expression,"operation")?.value;
    if (!operation) return expressionStructuralTree(expression);
    const operands=expressionField(expression,"operands").values;
    const keys=operands.map(equalityTree);
    const isNumber=(tree,value)=>tree?.[0] === "constant" && tree[1]?.[0] === "rational" && tree[1][1] === `${value}/1`;
    // Neutral-element rules preserve partial-expression domains. Deliberately
    // do not erase domains using x/x=1, 0*x=0, or x^0=1.
    if (["add","subtract"].includes(operation) && isNumber(keys[1],0)) return keys[0];
    if (operation === "add" && isNumber(keys[0],0)) return keys[1];
    if (["multiply","divide","power"].includes(operation) && isNumber(keys[1],1)) return keys[0];
    if (operation === "multiply" && isNumber(keys[0],1)) return keys[1];
    return ["operator",operation,keys];
}

const equalityKey=expression=>JSON.stringify(equalityTree(expression));

export function hasScopedSymbols(expression) {
    if (!isMathExpression(expression)) return false;
    if (expressionField(expression,"symbolid")) return true;
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(hasScopedSymbols));
}

export function hasExtendedConstants(expression) {
    if (!isMathExpression(expression)) return false;
    if (expressionField(expression,"kind")?.value === "constant") {
        const value=expressionField(expression,"value");
        return !(value instanceof Integer || value instanceof Rational);
    }
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(hasExtendedConstants));
}

function hasEnclosures(expression) {
    if (expressionField(expression,"kind")?.value === "constant") return isEnclosureConstant(expressionField(expression,"value"));
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(hasEnclosures));
}

export function expressionStructuralKey(expression) {
    return JSON.stringify(expressionStructuralTree(expression));
}

function expressionStructuralTree(expression) {
    if (!isMathExpression(expression)) return expressionStructuralTree(expressionConstant(expression));
    const kind=expressionField(expression,"kind")?.value;
    if (kind === "variable") return [kind,symbolState(expression)?.id ?? ["named",expressionField(expression,"name")?.value]];
    if (kind === "constant") return [kind,constantKey(expressionField(expression,"value"))];
    if (kind === "operator") return [kind,expressionField(expression,"operation")?.value,expressionField(expression,"operands").values.map(expressionStructuralTree)];
    if (kind === "apply") return [kind,expressionField(expression,"semanticid")?.value,expressionField(expression,"arguments").values.map(expressionStructuralTree)];
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
    // Use the current evaluator and capability policy, just like a direct system call.
    for (const [name,capability] of [["Eval","MathEvaluate"],["Substitute","MathSubstitute"]]) {
        proto.entries.set(name.toUpperCase(),{type:"method_builtin",name,
            impl:(args,context,evaluate)=>evaluate({fn:"SYS_CALL",args:[capability,...args]},context)});
    }
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
    constantKey(value);
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
            // Null is absence, not an unresolved mathematical scalar. Plugin
            // result sentinels must remain decidable for every expression kind.
            if (args.some(value=>value === null)) return operation === "EQ" ? null : new Integer(1n);
            if (!args.every(value=>isMathExpression(value) || isExpressionScalar(value))) return UNDECIDED;
            const expanded=args.map(value=>expandExpression(value));
            if (expanded.every(value=>expressionField(value,"kind")?.value === "constant")) {
                const equal=constantEquality(...expanded.map(value=>expressionField(value,"value")));
                return equal === null ? UNDECIDED : equal === (operation === "EQ") ? new Integer(1n) : null;
            }
            if (expanded.some(hasEnclosures)) return UNDECIDED;
            if (equalityKey(expanded[0]) === equalityKey(expanded[1])) return operation === "EQ" ? new Integer(1n) : null;
            // Distinct free symbols or trees do not establish mathematical inequality.
            return UNDECIDED;
        },
    });
}

export const expressionSyntaxFunctions = {
    SYMBOL_RETRIEVE: { impl:([name,outer],context)=>scopedExpressionVariable(context,name,outer), lazy:true, pure:false },
    SYMBOL_DEFINE: { impl:([name,node],context,evaluate)=>defineExpressionSymbol(name,node,context,evaluate), lazy:true, pure:false },
};

export const expressionCapabilities = {
    ExpressionReal: {impl:([source,options],context,evaluate)=> {
        const adapted=adaptRealConstant(source,options,context,evaluate);
        return adapted instanceof Promise ? adapted.then(expressionConstant) : expressionConstant(adapted);
    },pure:false,groups:["Symbolic"],doc:"Adapt a certified singleton provider with one bounded initial refinement"},
    ExpressionRefine: {impl:([value,options],context,evaluate)=>refineRealConstant(isMathExpression(value) && expressionField(value,"kind")?.value === "constant" ? expressionField(value,"value") : value,options,context,evaluate),pure:false,groups:["Symbolic"],doc:"Explicitly refine an adapted real constant and check its enclosure"},
    ExpressionConstantInfo: { impl:([value])=>constantProviderInfo(isMathExpression(value) && expressionField(value,"kind")?.value === "constant" ? expressionField(value,"value") : value), pure:false,groups:["Symbolic"],doc:"Inspect core constant denotation and algebraic laws without refinement" },
    ExpressionHasExtendedConstants: { impl:([value])=>hasExtendedConstants(value) ? new Integer(1n) : null,pure:true,groups:["Symbolic"],doc:"Recognize constants requiring provider-aware consumers" },
    ExpressionDefinition: { impl:([symbol])=> {
        if (!expressionField(symbol,"symbolid")) throw new Error("ExpressionDefinition requires a scoped symbol");
        return expressionDefinition(symbol);
    }, pure:false, groups:["Symbolic"], doc:"Inspect a symbol's immutable definition, or null if it has none" },
    ExpressionExpand: { impl:([value])=>expandExpression(value), pure:false, groups:["Symbolic"], doc:"Expand immutable symbol definitions without changing identities or applying general simplification" },
    ExpressionKey: { impl:([value])=>string(expressionStructuralKey(value)), pure:true, groups:["Symbolic"], doc:"Identity-aware structural key, not a proof of mathematical inequality" },
    ExpressionHasScopedSymbols: { impl:([value])=>hasScopedSymbols(value) ? new Integer(1n) : null, pure:true, groups:["Symbolic"], doc:"Recognize expressions requiring identity-aware mathematical consumers" },
    SameSymbol: { impl:([left,right])=> {
        const a=symbolState(left)?.id, b=symbolState(right)?.id;
        if (!a || !b) throw new Error("SameSymbol requires two scoped symbolic variables");
        return a===b ? new Integer(1n) : null;
    }, pure:true, groups:["Symbolic"], doc:"Compare symbol identities independently of mathematical equality" },
    ExpressionVariable: { impl: ([name]) => expressionVariable(name), pure:true, groups:["Symbolic"], doc:"Construct a mathematical variable expression without loading a plugin" },
    ExpressionConstant: { impl: ([value]) => expressionConstant(value), pure:true, groups:["Symbolic"], doc:"Construct a mathematical constant from a supported core scalar provider" },
    ExpressionOperation: { impl: ([operation, operands]) => expressionOperation(operation?.value,operands?.values), pure:true, groups:["Symbolic"], doc:"Construct a validated mathematical arithmetic node" },
    ExpressionApply: { impl: ([id, name, args]) => {
        if (id?.type !== "string" || name?.type !== "string" || !Array.isArray(args?.values)) throw new Error("ExpressionApply requires semantic ID, name, and arguments");
        return expressionApplication(id.value,name.value,args.values);
    }, pure:true, groups:["Symbolic"], doc:"Construct a mathematical function application" },
    IsExpression: { impl: ([value]) => isMathExpression(value) ? new Integer(1n) : null, pure:true, groups:["Symbolic"], doc:"Recognize a core mathematical expression" },
};
