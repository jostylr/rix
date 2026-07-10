const { parse } = require(../../src/parser/parser');

console.log('Explicit Pipe (||>) Examples');
console.log('============================');

function demo(code, description) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    const ast = parse(code);
    console.log('AST Type:', ast[0].expression.type);
    console.log('Left:', JSON.stringify(ast[0].expression.left, null, 2));
    console.log('Right:', JSON.stringify(ast[0].expression.right, null, 2));
    console.log('Placeholders:', ast[0].expression.placeholders);
}

// Basic explicit pipe examples
demo('(3, 4) ||> f(_2, _1);', 'Swap two arguments');
demo('(1, 2, 3) ||> g(_3, _2, _1);', 'Reverse three arguments');
demo('(a, b) ||> func(_1, _1, _2);', 'Duplicate first argument');

// Selective argument usage
demo('(a, b, c, d) ||> h(_4, _1, _3);', 'Use selective arguments');
demo('(x, y, z) ||> process(_2, _3);', 'Skip first argument');
demo('(p, q, r, s, t) ||> combine(_5, _1, _3);', 'Non-sequential selection');

// Mathematical examples
demo('(x, y) ||> pow(_2, _1);', 'Swap exponent and base: y^x instead of x^y');
demo('(a, b, c) ||> quadratic(_2, _1, _3);', 'Reorder quadratic coefficients');
demo('(radius, height) ||> cylinderVolume(PI, _1, _1, _2);', 'Add constants and duplicate radius');

// Function composition with explicit pipes
demo('(m, n) ||> gcd(_2, _1) |> log;', 'Explicit pipe in larger pipeline');
demo('data ||> transform(_1) |> validate;', 'Identity transformation with pipeline');

// Complex rearrangements
demo('(x1, y1, x2, y2) ||> distance(_3, _4, _1, _2);', 'Swap point coordinates');
demo('(a, b, c, d, e) ||> matrix2x2(_4, _2, _1, _3);', 'Complex matrix element rearrangement');

// With tuple destructuring
demo('((a, b), (c, d)) ||> combine(_2, _1);', 'Swap nested tuples');
demo('(point1, point2, point3) ||> triangle(_3, _1, _2);', 'Rotate triangle vertices');

// Edge cases
demo('(x) ||> f(_1);', 'Identity explicit pipe - same as simple pipe');
demo('(a, b, c) ||> func(_1, _2, _3);', 'Sequential order - same as simple pipe');

console.log('\nNote: Explicit pipes use placeholders (_1, _2, etc.) to specify argument positions');
console.log('This allows precise control over how tuple elements are fed to functions');
console.log('Placeholders can be duplicated, skipped, or reordered as needed');