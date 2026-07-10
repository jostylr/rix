import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function parseAndPrint(code, description) {
    console.log(`\n=== ${description} ===`);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        console.log('AST:', JSON.stringify(ast, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

console.log('RiX Brace Container Examples');
console.log('============================');

// Set examples
parseAndPrint('{1, 2, 3};', 'Set with numbers');
parseAndPrint('{a, b, c};', 'Set with identifiers');
parseAndPrint('{x + 1, y * 2, z / 3};', 'Set with expressions');
parseAndPrint('{}', 'Empty set');

// Map examples
parseAndPrint('{name := "John", age := 30};', 'Map with string and number values');
parseAndPrint('{x := 5, y := x * 2, z := SIN(PI/4)};', 'Map with expression values');
parseAndPrint('{key1 := value1, key2 := value2};', 'Map with identifier values');

// Pattern-Match examples (these should error - use array syntax instead)
parseAndPrint('{(0) :=> "zero", (1) :=> "one"};', 'Pattern match with literals (should error)');
parseAndPrint('{(x) :=> x + 1, (y) :=> y * 2};', 'Pattern match with expressions (should error)');
parseAndPrint('{(n) :=> n^2, (m) :=> SIN(m)};', 'Pattern match with mathematical functions (should error)');

// System examples
parseAndPrint('{x :=: 3*x + 2; y :=: x};', 'System of equations');
parseAndPrint('{a :=: b + c; b :=: 2*a - 1; c :=: a/2};', 'System with multiple equations');
parseAndPrint('{x :>: 0; y :<: 10; z :=: x + y};', 'System with inequalities and equations');

// Error examples
console.log('\n=== Error Examples ===');
parseAndPrint('{a := 1, b, c := 3};', 'Mixed map and set (should error)');
parseAndPrint('{(x) :=> x + 1, a := 2};', 'Brace pattern match syntax (should error)');
parseAndPrint('{x :=: 3, a := 2};', 'Mixed equation and assignment (should error)');
parseAndPrint('{x :=: 3*x + 2, y :=: x};', 'System without semicolons (should error)');