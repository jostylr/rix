import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

console.log('Simple Pipe (|>) Examples');
console.log('=========================');

function demo(code, description) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    const tokens = tokenize(code);
    const ast = parse(tokens);
    console.log('AST Type:', ast[0].expression.type);
    console.log('Left:', JSON.stringify(ast[0].expression.left, null, 2));
    console.log('Right:', JSON.stringify(ast[0].expression.right, null, 2));
}

// Basic simple pipe examples
demo('3 |> f;', 'Single value to function');
demo('x |> sqrt;', 'Variable to function'); 
demo('(3, 4) |> add;', 'Tuple unpacked as arguments');
demo('[1, 2, 3] |> sum;', 'Array to aggregation function');

// Function composition with pipes  
demo('x |> f |> g;', 'Left-associative chaining: (x |> f) |> g');
demo('data |> clean |> process |> output;', 'Multi-stage pipeline');

// Mathematical examples
demo('angle |> sin |> abs;', 'Trigonometric pipeline');
demo('(a, b) |> gcd |> log;', 'GCD then logarithm');
demo('matrix |> determinant |> sign;', 'Matrix operations');

// With system functions
demo('values |> SUM;', 'Pipe to system function');
demo('numbers |> MAX |> sqrt;', 'System function in pipeline');

console.log('\nNote: Pipes are left-associative, so a |> f |> g means (a |> f) |> g');
console.log('This allows data to flow naturally from left to right through the pipeline.');