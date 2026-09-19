import { tokenize } from '../../src/parser/tokenizer.js';
import { parse } from '../../src/parser/parser.js';

// Function to test error cases and valid edge cases
function testCase(code, description) {
    console.log(`\n${description}:`);
    console.log(`Input: ${code}`);
    
    try {
        const codeWithSemicolon = code.endsWith(';') ? code : code + ';';
        const tokens = tokenize(codeWithSemicolon);
        const ast = parse(tokens, () => null);
        
        let expr;
        if (ast.length > 0 && ast[0].expression) {
            expr = ast[0].expression;
        } else if (ast.length > 0) {
            expr = ast[0];
        } else {
            console.log(`✗ Error: No expression found`);
            return;
        }
        
        if (expr.type === 'Shaped' && Array.isArray(expr.rows)) {
            console.log(`✓ Success: Rank-2 Shaped with ${expr.rows.length} rows`);
            expr.rows.forEach((row, i) => {
                const values = row.map(elem => elem.value || elem.name || `<${elem.type}>`).join(', ');
                console.log(`  Row ${i + 1}: [${values}]`);
            });
        } else if (expr.type === 'Shaped') {
            console.log(`✓ Success: ${expr.maxDimension}D Shaped with ${expr.structure.length} elements`);
        } else if (expr.type === 'Array') {
            console.log(`✓ Success: Regular Array with ${expr.elements.length} elements`);
        } else {
            console.log(`✓ Success: ${expr.type}`);
        }
    } catch (error) {
        console.log(`✗ Error: ${error.message}`);
    }
}

console.log('=== Shaped Error Handling and Edge Cases ===');

// Valid edge cases
testCase('[;;]', 'Empty shaped structure');
testCase('[; 1, 2]', 'Rank-2 Shaped starting with empty row');
testCase('[1, 2; ]', 'Rank-2 Shaped ending with empty row');
testCase('[; ; ]', 'Rank-2 Shaped with only empty rows');
testCase('[1]', 'Single element (should be Array, not Rank-2 Shaped)');
testCase('[1, 2, 3]', 'Row vector (should be Array, not Rank-2 Shaped)');
testCase('[1; 2; 3]', 'One-column Shaped (should be Rank-2 Shaped)');
testCase('[;;;]', 'High-dimensional empty shaped');

// Complex valid cases
testCase('[a, b; c, d; e, f]', 'Rectangular matrix');
testCase('[1 ;; 2 ;;; 3 ;;;; 4]', 'High-dimensional shaped');
testCase('[x + y, sin(z); cos(w), 2^3]', 'Rank-2 Shaped with complex expressions');

// Cases that should produce errors
testCase('[matrix, type := "sparse"; 1, 2]', 'Rank-2 Shaped syntax mixed with metadata (should error)');
testCase('[1, 2; 3, 4, key := value]', 'Rank-2 Shaped with metadata mixed in (should error)');

// Nested structures
testCase('[[1, 2], [3, 4]; [5, 6], [7, 8]]', 'Rank-2 Shaped of arrays');
testCase('[{a: 1}, {b: 2}; {c: 3}, {d: 4}]', 'Rank-2 Shaped of objects');

// Whitespace variations
testCase('[1,2;3,4]', 'No spaces');
testCase('[ 1 , 2 ; 3 , 4 ]', 'Extra spaces');
testCase('[1, 2 ;; 3, 4]', 'Spaces around double semicolon');
testCase('[1, 2; ; 3, 4]', 'Space between semicolons (creates separate tokens)');

console.log('\n=== Summary ===');
console.log('Valid Shaped Syntax:');
console.log('- [1, 2; 3, 4] → 2D Rank-2 Shaped');
console.log('- [1; 2; 3] → One-column Shaped (Rank-2 Shaped)');
console.log('- [1, 2; 3, 4 ;; 5, 6; 7, 8] → 3D Shaped');
console.log('- [; 1, 2] → Rank-2 Shaped with empty first row');
console.log('- [;;] → Empty shaped structure');
console.log('');
console.log('Invalid Combinations:');
console.log('- Rank-2 Shaped syntax + metadata annotations');
console.log('- Spaces between semicolons create separate tokens');
console.log('');
console.log('Edge Cases:');
console.log('- Single elements remain Arrays');
console.log('- Row vectors (no semicolons) remain Arrays');
console.log('- One-column Shapeds (with semicolons) become Matrices');
console.log('- Empty rows/slices are preserved');