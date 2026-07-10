import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

// Function definition examples for RiX language

// Test system lookup function
function testSystemLookup(name) {
    const systemSymbols = {
        'COS': { type: 'function', name: 'COS' },
        'SIN': { type: 'function', name: 'SIN' },
        'PI': { type: 'constant', name: 'PI' }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function parseCode(code) {
    const tokens = tokenize(code);
    return parse(tokens, testSystemLookup);
}

console.log('=== Function Definition Examples ===\n');

// Example 1: Standard function definition with :->
console.log('1. Standard function definition:');
console.log('   f(x) :-> x + 1');
try {
    const ast1 = parseCode('f(x) :-> x + 1;');
    console.log('   ✓ Parsed successfully');
    console.log('   AST:', JSON.stringify(ast1, null, 2));
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 2: Function with default parameters
console.log('2. Function with default parameters:');
console.log('   f(x, n := 5) :-> x^n');
try {
    const ast2 = parseCode('f(x, n := 5) :-> x^n;');
    console.log('   ✓ Parsed successfully');
    console.log('   Parameters:', JSON.stringify(ast2[0].expression.parameters, null, 2));
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 3: Function with keyword-only parameters
console.log('3. Function with positional and keyword-only parameters:');
console.log('   f(x, n := 5; a := 0) :-> (x-a)^n + 1');
try {
    const ast3 = parseCode('f(x, n := 5; a := 0) :-> (x-a)^n + 1;');
    console.log('   ✓ Parsed successfully');
    console.log('   Positional params:', ast3[0].expression.parameters.positional.length);
    console.log('   Keyword params:', ast3[0].expression.parameters.keyword.length);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 4: Function with condition
console.log('4. Function with conditional parameter:');
console.log('   h(x, y; n := 2 ? x^2 + y^2 = 1) :-> COS(x; n) * SIN(y; n)');
try {
    const ast4 = parseCode('h(x, y; n := 2 ? x^2 + y^2 = 1) :-> COS(x; n) * SIN(y; n);');
    console.log('   ✓ Parsed successfully');
    const keywordParam = ast4[0].expression.parameters.keyword[0];
    console.log('   Has condition:', keywordParam.condition !== null);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 5: Pattern matching function with array syntax
console.log('5. Pattern matching function (array syntax):');
console.log('   g :=> [ (x ? x < 0) -> -x, (x) -> x ]');
try {
    const ast5 = parseCode('g :=> [ (x ? x < 0) -> -x, (x) -> x ];');
    console.log('   ✓ Parsed successfully');
    console.log('   Number of patterns:', ast5[0].expression.patterns.length);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 6: Pattern matching function with metadata
console.log('6. Pattern matching function with metadata:');
console.log('   g :=> [ [(x ? x < 0) -> -x+n, (x) -> x-n] , n := 4]');
try {
    const ast6 = parseCode('g :=> [ [(x ? x < 0) -> -x+n, (x) -> x-n] , n := 4];');
    console.log('   ✓ Parsed successfully');
    console.log('   Has metadata:', Object.keys(ast6[0].expression.metadata).length > 0);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 7: Function call with semicolon separator
console.log('7. Function call with keyword arguments:');
console.log('   f(2, 3; a := 4)');
try {
    const ast7 = parseCode('f(2, 3; a := 4);');
    console.log('   ✓ Parsed successfully');
    const args = ast7[0].expression.arguments;
    console.log('   Positional args:', args.positional.length);
    console.log('   Keyword args:', Object.keys(args.keyword).length);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 8: Function call with shorthand keyword argument
console.log('8. Function call with shorthand keyword:');
console.log('   f(2; n)  // equivalent to f(2; n := n)');
try {
    const ast8 = parseCode('f(2; n);');
    console.log('   ✓ Parsed successfully');
    const keywordArgs = ast8[0].expression.arguments.keyword;
    console.log('   Shorthand keyword "n":', keywordArgs.n.type === 'UserIdentifier');
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 9: Assignment-style function definition
console.log('9. Assignment-style function definition:');
console.log('   f := (x, n := 5; a := 0) -> (x-a)^n + 1');
try {
    const ast9 = parseCode('f := (x, n := 5; a := 0) -> (x-a)^n + 1;');
    console.log('   ✓ Parsed successfully');
    console.log('   Assignment operator:', ast9[0].expression.operator);
} catch (e) {
    console.log('   ✗ Parse error:', e.message);
}
console.log('');

// Example 10: Multiple pattern matching definitions
console.log('10. Multiple pattern matching definitions:');
console.log('    g :=> (x ? x < 0) -> -x;');
console.log('    g :=> (x) -> x');
try {
    const ast10a = parseCode('g :=> (x ? x < 0) -> -x;');
    const ast10b = parseCode('g :=> (x) -> x;');
    console.log('    ✓ Both parsed successfully');
    console.log('    Pattern 1 type:', ast10a[0].expression.type);
    console.log('    Pattern 2 type:', ast10b[0].expression.type);
} catch (e) {
    console.log('    ✗ Parse error:', e.message);
}

console.log('\n=== Function Definition Examples Complete ===');