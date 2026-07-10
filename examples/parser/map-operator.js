const { parse } = require(../../src/parser/parser');

console.log('Map Operator (|>>) Examples');
console.log('===========================');

function demo(code, description) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    const ast = parse(code);
    console.log('AST Type:', ast[0].expression.type);
    console.log('Left:', JSON.stringify(ast[0].expression.left, null, 2));
    console.log('Right:', JSON.stringify(ast[0].expression.right, null, 2));
}

// Basic map examples
demo('[1, 2, 3] |>> f;', 'Apply function to each element');
demo('[1, 2, 3] |>> (x) -> x^2;', 'Square each element with lambda');
demo('[1, 2, 3] |>> (x) -> x * 2 + 1;', 'Complex transformation');

// Mathematical operations
demo('[0, 30, 45, 90] |>> sin;', 'Apply sine to angle array');
demo('[1, 4, 9, 16] |>> sqrt;', 'Square root of each element');
demo('[-1, 0, 1, 2] |>> abs;', 'Absolute value transformation');

// String operations
demo('["hello", "world"] |>> (s) -> LEN(s);', 'Get length of each string');
demo('["a", "b", "c"] |>> (s) -> s + "!";', 'Append exclamation to each');
demo('words |>> (w) -> UPPER(w);', 'Convert each word to uppercase');

// Nested operations
demo('[[1, 2], [3, 4], [5, 6]] |>> (row) -> row |> sum;', 'Sum each row');
demo('matrices |>> (m) -> m |> determinant;', 'Determinant of each matrix');
demo('points |>> (p) -> p |> magnitude;', 'Magnitude of each vector');

// Complex transformations
demo('[1, 2, 3, 4, 5] |>> (x) -> x % 2 == 0 ? x * 2 : x;', 'Conditional transformation');
demo('data |>> (item) -> { value: item, squared: item^2 };', 'Create objects from values');
demo('coordinates |>> (p) -> (p.x^2 + p.y^2) |> sqrt;', 'Distance from origin');

// Function composition
demo('[1, 2, 3] |>> (x) -> x^2 |>> (y) -> y + 1;', 'Chained map operations');
demo('values |>> normalize |>> (x) -> x * scale;', 'Normalize then scale');

// With different data types
demo('range(1, 10) |>> (i) -> i^2;', 'Map over range');
demo('{1, 2, 3, 4} |>> (x) -> x * x;', 'Map over set');
demo('series |>> (term) -> term / factorial(term);', 'Series transformation');

// Statistical operations
demo('samples |>> (x) -> (x - mean) / stddev;', 'Standardization');
demo('observations |>> (o) -> o > threshold ? 1 : 0;', 'Binary classification');
demo('measurements |>> (m) -> round(m, 2);', 'Round to two decimal places');

// Advanced examples
demo('polynomials |>> (coeffs) -> coeffs |> derivative;', 'Derivative of each polynomial');
demo('signals |>> (s) -> s |> fft |> magnitude;', 'FFT magnitude of each signal');
demo('images |>> (img) -> img |> blur(3) |> sharpen(1.5);', 'Image processing pipeline');

console.log('\nNote: Map operator (|>>) applies a function to each element of an iterable');
console.log('The result is a new iterable with the same structure but transformed elements');
console.log('Map operations preserve the size and type of the input collection');