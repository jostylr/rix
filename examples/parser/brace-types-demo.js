import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function demo(code, description) {
    console.log(`\n${description}:`);
    console.log(`Input: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const containerType = ast[0].expression.type;
        console.log(`Result: ${containerType} container`);
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
}

console.log('RiX Brace Container Types Demo');
console.log('==============================');

// Set: literals and expressions without special operators
demo('{1, 2, 3};', 'Set with numbers');
demo('{a, b, c};', 'Set with identifiers');
demo('{x + 1, y * 2};', 'Set with expressions');

// Map: key-value pairs with :=
demo('{name := "John", age := 30};', 'Map with assignments');
demo('{x := 5, y := x * 2};', 'Map with expressions');

// PatternMatch: patterns with :=> (these should error - use array syntax instead)
demo('{(0) :=> "zero", (1) :=> "one"};', 'Pattern match (should error)');
demo('{(x) :=> x + 1, (y) :=> y * 2};', 'Pattern match with expressions (should error)');

// System: equations with :=:, :>:, etc. and semicolons
demo('{x :=: 3*x + 2; y :=: x};', 'System of equations');
demo('{a :>: 0; b :<: 10; c :=: a + b};', 'System with inequalities');

console.log('\nError Cases:');
demo('{a := 1, b, c := 3};', 'Mixed map and set (invalid)');
demo('{(x) :=> x + 1, a := 2};', 'Brace pattern syntax (invalid)');
demo('{x :=: 3, a := 2};', 'Mixed equation and assignment (invalid)');
demo('{x :=: 3*x + 2, y :=: x};', 'System without semicolons (invalid)');