const { parse } = require(../../src/parser/parser');

console.log('Filter (|>?) and Reduce (|>:) Examples');
console.log('======================================');

function demo(code, description) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    const ast = parse(code);
    console.log('AST Type:', ast[0].expression.type);
    console.log('Left:', JSON.stringify(ast[0].expression.left, null, 2));
    console.log('Right:', JSON.stringify(ast[0].expression.right, null, 2));
}

console.log('\n=== FILTER OPERATOR (|>?) ===');

// Basic filter examples
demo('[1, 2, 3, 4, 5] |>? (x) -> x > 3;', 'Filter numbers greater than 3');
demo('[1, 2, 3, 4, 5] |>? (x) -> x % 2 == 0;', 'Filter even numbers');
demo('[-2, -1, 0, 1, 2] |>? (x) -> x >= 0;', 'Filter non-negative numbers');

// String filtering
demo('["a", "bb", "ccc", "dddd"] |>? (s) -> LEN(s) > 2;', 'Filter strings by length');
demo('words |>? (w) -> w[0] == "A";', 'Filter words starting with A');
demo('["hello", "world", "test"] |>? (s) -> "e" in s;', 'Filter strings containing "e"');

// Mathematical filtering
demo('[1, 4, 9, 16, 25] |>? (x) -> isPrime(sqrt(x));', 'Filter perfect squares of primes');
demo('angles |>? (a) -> sin(a) > 0.5;', 'Filter angles with sine > 0.5');
demo('numbers |>? (n) -> abs(n - mean) < 2 * stddev;', 'Filter outliers (2-sigma rule)');

// Complex conditions
demo('points |>? (p) -> distance(p, origin) < radius;', 'Filter points within circle');
demo('students |>? (s) -> s.grade >= 85 && s.attendance > 0.9;', 'Filter high-performing students');
demo('data |>? (item) -> item.valid && item.timestamp > cutoff;', 'Filter valid recent data');

// Function composition with filter
demo('[1, 2, 3, 4, 5] |>> (x) -> x^2 |>? (y) -> y > 10;', 'Map then filter');
demo('values |>? (x) -> x > 0 |>> log;', 'Filter then map');

console.log('\n=== REDUCE OPERATOR (|>:) ===');

// Basic reduce examples
demo('[1, 2, 3, 4, 5] |>: (a, b) -> a + b;', 'Sum all elements');
demo('[1, 2, 3, 4, 5] |>: (acc, x) -> acc * x;', 'Product of all elements');
demo('[5, 2, 8, 1, 9] |>: (max, x) -> x > max ? x : max;', 'Find maximum value');

// String reduction
demo('["Hello", " ", "World", "!"] |>: (acc, s) -> acc + s;', 'Concatenate strings');
demo('words |>: (longest, word) -> LEN(word) > LEN(longest) ? word : longest;', 'Find longest word');
demo('sentences |>: (acc, s) -> acc + LEN(s);', 'Count total characters');

// Mathematical reductions
demo('measurements |>: (sum, x) -> sum + x^2;', 'Sum of squares');
demo('vectors |>: (acc, v) -> acc + magnitude(v);', 'Sum of vector magnitudes');
demo('series |>: (acc, term) -> acc + term / factorial(term);', 'Series summation');

// Statistical reductions
demo('samples |>: (acc, x) -> { sum: acc.sum + x, count: acc.count + 1 };', 'Accumulate sum and count');
demo('data |>: (acc, x) -> acc + (x - mean)^2;', 'Sum of squared deviations');
demo('observations |>: (acc, x) -> acc + x > threshold ? 1 : 0;', 'Count above threshold');

// Complex reductions
demo('transactions |>: (acc, t) -> acc + t.amount * t.rate;', 'Total converted amount');
demo('grades |>: (acc, g) -> { total: acc.total + g, min: min(acc.min, g), max: max(acc.max, g) };', 'Grade statistics');
demo('points |>: (centroid, p) -> (centroid + p) / 2;', 'Iterative centroid calculation');

// Matrix/tensor reductions
demo('matrix |>: (acc, row) -> acc + (row |>: sum);', 'Sum all matrix elements');
demo('tensor |>: (acc, slice) -> acc + determinant(slice);', 'Sum of determinants');

console.log('\n=== COMBINED FILTER AND REDUCE ===');

// Filter then reduce
demo('[1, 2, 3, 4, 5, 6] |>? (x) -> x % 2 == 0 |>: (a, b) -> a + b;', 'Sum of even numbers');
demo('scores |>? (s) -> s >= passingGrade |>: (acc, s) -> acc + 1;', 'Count passing scores');
demo('data |>? (x) -> x > 0 |>: (acc, x) -> acc * x;', 'Product of positive numbers');

// Map, filter, then reduce
demo('[1, 2, 3, 4, 5] |>> (x) -> x^2 |>? (y) -> y > 10 |>: (a, b) -> a + b;', 'Sum of large squares');
demo('words |>> (w) -> w.toLowerCase() |>? (w) -> w.length > 3 |>: (acc, w) -> acc + " " + w;', 'Concatenate long words');

// Real-world examples
demo('sales |>? (s) -> s.date >= startDate |>: (total, s) -> total + s.amount;', 'Revenue in period');
demo('sensors |>? (s) -> s.status == "active" |>: (sum, s) -> sum + s.reading;', 'Sum active sensor readings');
demo('students |>? (s) -> s.major == "CS" |>: (acc, s) -> acc + s.gpa;', 'Total CS student GPA');

console.log('\nNote: Filter (|>?) keeps elements where the predicate returns true');
console.log('Reduce (|>:) accumulates elements into a single value using a binary function');
console.log('Both operators work with any iterable and can be chained with other pipe operations');
console.log('All pipe operators are left-associative, so operations flow left-to-right through the pipeline');