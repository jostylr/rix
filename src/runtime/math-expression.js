/** Core expression construction. Algorithms belong to consumers, not constructors. */
import { Integer, Rational } from "@ratmath/core";
import { UNDECIDED } from "./decision.js";

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

function equalityKey(expression) {
    const operation=expressionField(expression,"operation")?.value;
    if (!operation) return expressionStructuralKey(expression);
    const operands=expressionField(expression,"operands").values;
    const keys=operands.map(equalityKey);
    const zero=expressionStructuralKey(expressionConstant(new Integer(0n)));
    const one=expressionStructuralKey(expressionConstant(new Integer(1n)));
    // Neutral-element rules preserve partial-expression domains. Deliberately
    // do not erase domains using x/x=1, 0*x=0, or x^0=1.
    if (["add","subtract"].includes(operation) && keys[1] === zero) return keys[0];
    if (operation === "add" && keys[0] === zero) return keys[1];
    if (["multiply","divide","power"].includes(operation) && keys[1] === one) return keys[0];
    if (operation === "multiply" && keys[0] === one) return keys[1];
    return JSON.stringify(["operator",operation,keys]);
}

export function hasScopedSymbols(expression) {
    if (!isMathExpression(expression)) return false;
    if (expressionField(expression,"symbolid")) return true;
    return ["operands","arguments"].some(key=>expressionField(expression,key)?.values?.some(hasScopedSymbols));
}

export function expressionStructuralKey(expression) {
    if (!isMathExpression(expression)) return expressionStructuralKey(expressionConstant(expression));
    const kind=expressionField(expression,"kind")?.value;
    if (kind === "variable") return JSON.stringify([kind,symbolState(expression)?.id ?? ["named",expressionField(expression,"name")?.value]]);
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
            const expanded=args.map(value=>expandExpression(value));
            if (equalityKey(expanded[0]) === equalityKey(expanded[1])) return operation === "EQ" ? new Integer(1n) : null;
            if (expanded.every(value=>expressionField(value,"kind")?.value === "constant")) return operation === "EQ" ? null : new Integer(1n);
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
    ExpressionConstant: { impl: ([value]) => expressionConstant(value), pure:true, groups:["Symbolic"], doc:"Construct an exact mathematical constant expression" },
    ExpressionOperation: { impl: ([operation, operands]) => expressionOperation(operation?.value,operands?.values), pure:true, groups:["Symbolic"], doc:"Construct a validated mathematical arithmetic node" },
    ExpressionApply: { impl: ([id, name, args]) => {
        if (id?.type !== "string" || name?.type !== "string" || !Array.isArray(args?.values)) throw new Error("ExpressionApply requires semantic ID, name, and arguments");
        return expressionApplication(id.value,name.value,args.values);
    }, pure:true, groups:["Symbolic"], doc:"Construct a mathematical function application" },
    IsExpression: { impl: ([value]) => isMathExpression(value) ? new Integer(1n) : null, pure:true, groups:["Symbolic"], doc:"Recognize a core mathematical expression" },
};
