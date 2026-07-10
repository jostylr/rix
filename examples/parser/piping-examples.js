import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

// Helper function to parse and display results
function parseAndShow(code, description) {
    console.log(`\n=== ${description} ===`);
    console.log(`Code: ${code}`);
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens);
        console.log('AST:', JSON.stringify(ast, null, 2));
    } catch (error) {
        console.error('Parse Error:', error.message);
    }
}

console.log('RiX Piping Operations Examples');
console.log('==============================');

// Simple Pipe (|>) Examples
parseAndShow('3 |> f;', 'Simple pipe - single value');
parseAndShow('(3, 4) |> f;', 'Simple pipe - tuple argument');
parseAndShow('[1, 2, 3] |> sum;', 'Simple pipe - array to function');
parseAndShow('x |> f |> g;', 'Chained pipes (left-associative)');
parseAndShow('(a, b, c) |> max;', 'Pipe tuple to max function');

// Explicit Pipe (||>) Examples  
parseAndShow('(3, 4) ||> f(_2, _1);', 'Explicit pipe - swap arguments');
parseAndShow('(1, 2, 3) ||> g(_3, _2, _1);', 'Explicit pipe - reverse three args');
parseAndShow('(x, y) ||> func(_1, _1, _2);', 'Explicit pipe - duplicate argument');
parseAndShow('(a, b, c, d) ||> h(_4, _1, _3);', 'Explicit pipe - selective arguments');

// Map (|>>) Examples
parseAndShow('[1, 2, 3] |>> f;', 'Map - function over array');
parseAndShow('[1, 2, 3] |>> (x) -> x^2;', 'Map - lambda function');
parseAndShow('[1, 2, 3] |>> (x) -> x * 2 + 1;', 'Map - complex expression');
parseAndShow('[[1, 2], [3, 4]] |>> (row) -> row |> sum;', 'Map - nested operations');

// Filter (|>?) Examples
parseAndShow('[1, 2, 3, 4] |>? (x) -> x > 2;', 'Filter - greater than condition');
parseAndShow('[1, 2, 3, 4] |>? (x) -> x % 2 == 0;', 'Filter - even numbers');
parseAndShow('["a", "bb", "ccc"] |>? (s) -> LEN(s) > 1;', 'Filter - string length');
parseAndShow('[1, 2, 3, 4, 5] |>? isEven;', 'Filter - named predicate function');

// Reduce (|>:) Examples
parseAndShow('[1, 2, 3, 4] |>: (a, b) -> a + b;', 'Reduce - sum');
parseAndShow('[1, 2, 3, 4] |>: (acc, x) -> acc * x;', 'Reduce - product');
parseAndShow('[1, 5, 3, 9, 2] |>: (max, x) -> x > max ? x : max;', 'Reduce - maximum');
parseAndShow('["a", "b", "c"] |>: (acc, s) -> acc + s;', 'Reduce - string concatenation');

// Complex Pipeline Examples
parseAndShow('[1, 2, 3, 4, 5] |>> (x) -> x^2 |>? (y) -> y > 10;', 'Map then filter');
parseAndShow('[1, 2, 3, 4, 5] |>? (x) -> x % 2 == 0 |>> (y) -> y * 3;', 'Filter then map');
parseAndShow('[1, 2, 3, 4, 5] |>> (x) -> x * 2 |>? (y) -> y > 5 |>: (a, b) -> a + b;', 'Map, filter, then reduce');

// Real-world Mathematical Examples
parseAndShow('data |>> normalize |>? (x) -> x > threshold |>: average;', 'Data processing pipeline');
parseAndShow('matrix |>> (row) -> row |>: (a, b) -> a + b;', 'Matrix row sums');
parseAndShow('points |>> (p) -> distance(origin, p) |>? (d) -> d < radius;', 'Geometric filtering');

// Advanced Explicit Pipe Examples
parseAndShow('(matrix, vector) ||> multiply(_1, _2);', 'Matrix-vector multiplication');
parseAndShow('(x, y, z) ||> distance3D(_1, _2, _3, 0, 0, 0);', 'Distance calculation with explicit args');
parseAndShow('(a, b, c) ||> solve(_1, _2, _3) |> validate;', 'Explicit pipe in larger pipeline');

// Mixed with Other Operators
parseAndShow('result := data |>> transform |>? validate |>: combine;', 'Pipeline with assignment');
parseAndShow('func := (arr) -> arr |>> (x) -> x^2 |>: (a, b) -> a + b;', 'Function definition with pipeline');
parseAndShow('[arr1, arr2] |>> (a) -> a |>: sum ||> compare(_2, _1);', 'Complex mixed operations');

// Edge Cases and Special Scenarios
parseAndShow('x |> f |> g |> h;', 'Long chain - left associativity');
parseAndShow('(()) |> f;', 'Empty tuple pipe');
parseAndShow('[1] |>> identity;', 'Single element map');
parseAndShow('[42] |>: (a, b) -> a;', 'Single element reduce');

console.log('\n=== End of Piping Examples ===');