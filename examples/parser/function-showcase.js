import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

// Comprehensive function definition showcase for RiX language

function testSystemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', name: 'SIN', arity: 1 },
        'COS': { type: 'function', name: 'COS', arity: 1 },
        'TAN': { type: 'function', name: 'TAN', arity: 1 },
        'LOG': { type: 'function', name: 'LOG', arity: 2 },
        'SQRT': { type: 'function', name: 'SQRT', arity: 1 },
        'ABS': { type: 'function', name: 'ABS', arity: 1 },
        'PI': { type: 'constant', name: 'PI', value: Math.PI },
        'E': { type: 'constant', name: 'E', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function parseCode(code) {
    const tokens = tokenize(code);
    return parse(tokens, testSystemLookup);
}

function showExample(title, code) {
    console.log(`\n=== ${title} ===`);
    console.log(`Code: ${code}`);
    try {
        const ast = parseCode(code);
        console.log('✓ Parsed successfully');
        
        // Show relevant structure
        const expr = ast[0].expression;
        if (expr.type === 'FunctionDefinition') {
            console.log(`  Function: ${expr.name.name}`);
            console.log(`  Positional params: ${expr.parameters.positional.length}`);
            console.log(`  Keyword params: ${expr.parameters.keyword.length}`);
            const hasConditions = expr.parameters.positional.some(p => p.condition) || 
                                expr.parameters.keyword.some(p => p.condition);
            if (hasConditions) console.log('  Has conditional parameters');
        } else if (expr.type === 'FunctionCall') {
            console.log(`  Function call: ${expr.function.name}`);
            console.log(`  Positional args: ${expr.arguments.positional.length}`);
            console.log(`  Keyword args: ${Object.keys(expr.arguments.keyword).length}`);
        } else if (expr.type === 'BinaryOperation' && expr.operator === ':=') {
            if (expr.right.type === 'FunctionLambda') {
                console.log(`  Assignment to lambda function`);
                console.log(`  Parameters: ${expr.right.parameters.positional.length + expr.right.parameters.keyword.length}`);
            }
        }
    } catch (e) {
        console.log(`✗ Parse error: ${e.message}`);
    }
}

console.log('RiX Language Function Definition Showcase');
console.log('========================================');

// 1. Basic Functions
showExample('Simple Function', 'square(x) :-> x^2;');
showExample('Multi-parameter Function', 'add(x, y) :-> x + y;');
showExample('Function with System Calls', 'hypotenuse(a, b) :-> SQRT(a^2 + b^2);');

// 2. Default Parameters
showExample('Single Default Parameter', 'power(x, n := 2) :-> x^n;');
showExample('Multiple Default Parameters', 'line(x, m := 1, b := 0) :-> m*x + b;');
showExample('Mixed Parameters', 'poly(x, a, b := 1, c := 0) :-> a*x^2 + b*x + c;');

// 3. Keyword-Only Parameters
showExample('Keyword-Only Parameters', 'trig(x; precision := 10, units := "radians") :-> SIN(x; precision);');
showExample('Complex Parameter Mix', 'func(x, y, scale := 1; offset := 0, normalize := false) :-> (x + y) * scale + offset;');

// 4. Conditional Parameters
showExample('Simple Condition', 'safeDivide(x, y; check := true ? y != 0) :-> x / y;');
showExample('Complex Condition', 'constrainedPower(x, n := 2 ? x > 0 AND n >= 0) :-> x^n;');
showExample('Multiple Conditions', 'constrainedFunc(x, y; a := 1 ? x^2 + y^2 <= 1, b := 0 ? a > 0) :-> a*x + b*y;');

// 5. Pattern Matching Functions

// 6. Pattern Matching with Metadata

// 7. Advanced Pattern Matching

// 8. Function Calls with New Syntax
showExample('Basic Function Call', 'result := func(5, 10);');
showExample('Function Call with Keywords', 'result := transform(x; scale := 2, offset := 5);');
showExample('Mixed Argument Call', 'result := poly(x, 3; b := 2, c := 1);');
showExample('Shorthand Keywords', 'result := process(data; verbose, debug);');

// 9. Assignment-Style Function Definitions
showExample('Lambda Assignment', 'double := (x) -> 2 * x;');
showExample('Lambda with Defaults', 'scale := (x, factor := 2) -> x * factor;');
showExample('Lambda with Keywords', 'adjust := (x; offset := 0, scale := 1) -> x * scale + offset;');
showExample('Complex Lambda', 'polynomial := (x, coeffs; degree := 2) -> coeffs[0] + coeffs[1]*x + coeffs[2]*x^degree;');

// 10. Real-world Examples
showExample('Distance Function', 'distance(p1, p2; metric := "euclidean") :-> SQRT((p1[0] - p2[0])^2 + (p1[1] - p2[1])^2);');
showExample('Statistical Function', 'mean(data; weights := []; normalized := true ? weights != []) :-> SUM(data * weights) / SUM(weights);');
showExample('Trigonometric Helper', 'sincos(angle; precision := 6, units := "radians" ? units = "radians" OR units = "degrees") :-> [SIN(angle; precision), COS(angle; precision)];');

// 11. Pattern Matching for Mathematical Functions

// 12. Advanced Mathematical Functions
showExample('Newton Method Step', 'newtonStep(f, df, x; tolerance := 1e-6 ? df(x) != 0) :-> x - f(x) / df(x);');
showExample('Integration Helper', 'trapezoid(f, a, b; n := 100 ? n > 0 AND b > a) :-> (b - a) / n * (f(a) + f(b)) / 2;');
showExample('Matrix Operation', 'matmul(A, B; validate := true ? A.cols = B.rows) :-> A * B;');

console.log('\n========================================');
console.log('Function Definition Showcase Complete');
console.log('All examples demonstrate the rich function definition capabilities of RiX');
