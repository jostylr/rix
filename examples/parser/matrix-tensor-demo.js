import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// Demo function to parse and display results
function parseAndDisplay(code, description) {
    console.log(`\n${description}:`);
    console.log(`Input: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, () => null);
        console.log('AST:', JSON.stringify(ast, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }
}

console.log('=== Matrix and Tensor Parsing Examples ===');

// 2D Matrix Examples
parseAndDisplay(
    '[1, 2; 3, 4];',
    '1. Simple 2x2 Matrix'
);

parseAndDisplay(
    '[1, 2, 3; 4, 5, 6; 7, 8, 9];',
    '2. 3x3 Matrix'
);

parseAndDisplay(
    '[x, y; z, w];',
    '3. Matrix with Variables'
);

parseAndDisplay(
    '[1, 2; 3, 4; 5, 6];',
    '4. 3x2 Matrix (rectangular)'
);

parseAndDisplay(
    '[1, 2, 3; ];',
    '5. Matrix with Empty Row'
);

parseAndDisplay(
    '[; 1, 2, 3];',
    '6. Matrix Starting with Empty Row'
);

// 3D Tensor Examples
parseAndDisplay(
    '[1, 2; 3, 4 ;; 5, 6; 7, 8];',
    '7. 3D Tensor (2x2x2)'
);

parseAndDisplay(
    '[1, 2, 3; 4, 5, 6 ;; 7, 8, 9; 10, 11, 12];',
    '8. 3D Tensor (2x3x2)'
);

parseAndDisplay(
    '[a, b; c, d ;; e, f; g, h ;; i, j; k, l];',
    '9. 3D Tensor with Variables (3x2x2)'
);

// Higher Dimensional Tensors
parseAndDisplay(
    '[1, 2; 3, 4 ;; 5, 6; 7, 8 ;;; 9, 10; 11, 12 ;; 13, 14; 15, 16];',
    '10. 4D Tensor'
);

parseAndDisplay(
    '[1; 2 ;; 3; 4 ;;; 5; 6 ;; 7; 8];',
    '11. 4D Tensor with Single Elements'
);

// Edge Cases
parseAndDisplay(
    '[1; 2; 3];',
    '12. Column Vector (3x1 Matrix)'
);

parseAndDisplay(
    '[1, 2, 3];',
    '13. Row Vector (Regular Array - no semicolons)'
);

parseAndDisplay(
    '[;;];',
    '14. Empty Tensor Structure'
);

parseAndDisplay(
    '[1 ;;;; 2];',
    '15. High Dimensional Separator (5D)'
);

// Mathematical expressions in matrices
parseAndDisplay(
    '[a + b, c * d; sin(x), cos(y)];',
    '16. Matrix with Mathematical Expressions'
);

parseAndDisplay(
    '[1/2, 3/4; 5/6, 7/8];',
    '17. Matrix with Fractions'
);

parseAndDisplay(
    '[2^3, 4^2; sqrt(16), log(10)];',
    '18. Matrix with Function Calls and Powers'
);

// Complex nested structures
parseAndDisplay(
    '[[1, 2], [3, 4]; [5, 6], [7, 8]];',
    '19. Matrix of Arrays'
);

parseAndDisplay(
    '[{a: 1, b: 2}; {c: 3, d: 4}];',
    '20. Matrix of Objects'
);

console.log('\n=== Summary ===');
console.log('Matrix Syntax: [row1_elem1, row1_elem2; row2_elem1, row2_elem2]');
console.log('Tensor Syntax: [slice1_row1; slice1_row2 ;; slice2_row1; slice2_row2]');
console.log('- Single ; separates rows within a 2D slice');
console.log('- Double ;; separates 2D slices within a 3D tensor');
console.log('- Triple ;;; separates 3D blocks within a 4D tensor');
console.log('- And so on for higher dimensions...');
console.log('- Spaces between semicolons create separate separator tokens');
console.log('- Empty rows/slices are preserved in the structure');