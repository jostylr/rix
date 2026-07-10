import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

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
        
        if (expr.type === 'Matrix') {
            console.log(`✓ Success: Matrix with ${expr.rows.length} rows`);
            expr.rows.forEach((row, i) => {
                const values = row.map(elem => elem.value || elem.name || `<${elem.type}>`).join(', ');
                console.log(`  Row ${i + 1}: [${values}]`);
            });
        } else if (expr.type === 'Tensor') {
            console.log(`✓ Success: ${expr.maxDimension}D Tensor with ${expr.structure.length} elements`);
        } else if (expr.type === 'Array') {
            console.log(`✓ Success: Regular Array with ${expr.elements.length} elements`);
        } else {
            console.log(`✓ Success: ${expr.type}`);
        }
    } catch (error) {
        console.log(`✗ Error: ${error.message}`);
    }
}

console.log('=== Matrix/Tensor Error Handling and Edge Cases ===');

// Valid edge cases
testCase('[;;]', 'Empty tensor structure');
testCase('[; 1, 2]', 'Matrix starting with empty row');
testCase('[1, 2; ]', 'Matrix ending with empty row');
testCase('[; ; ]', 'Matrix with only empty rows');
testCase('[1]', 'Single element (should be Array, not Matrix)');
testCase('[1, 2, 3]', 'Row vector (should be Array, not Matrix)');
testCase('[1; 2; 3]', 'Column vector (should be Matrix)');
testCase('[;;;]', 'High-dimensional empty tensor');

// Complex valid cases
testCase('[a, b; c, d; e, f]', 'Rectangular matrix');
testCase('[1 ;; 2 ;;; 3 ;;;; 4]', 'High-dimensional tensor');
testCase('[x + y, sin(z); cos(w), 2^3]', 'Matrix with complex expressions');

// Cases that should produce errors
testCase('[matrix, type := "sparse"; 1, 2]', 'Matrix syntax mixed with metadata (should error)');
testCase('[1, 2; 3, 4, key := value]', 'Matrix with metadata mixed in (should error)');

// Nested structures
testCase('[[1, 2], [3, 4]; [5, 6], [7, 8]]', 'Matrix of arrays');
testCase('[{a: 1}, {b: 2}; {c: 3}, {d: 4}]', 'Matrix of objects');

// Whitespace variations
testCase('[1,2;3,4]', 'No spaces');
testCase('[ 1 , 2 ; 3 , 4 ]', 'Extra spaces');
testCase('[1, 2 ;; 3, 4]', 'Spaces around double semicolon');
testCase('[1, 2; ; 3, 4]', 'Space between semicolons (creates separate tokens)');

console.log('\n=== Summary ===');
console.log('Valid Matrix/Tensor Syntax:');
console.log('- [1, 2; 3, 4] → 2D Matrix');
console.log('- [1; 2; 3] → Column vector (Matrix)');
console.log('- [1, 2; 3, 4 ;; 5, 6; 7, 8] → 3D Tensor');
console.log('- [; 1, 2] → Matrix with empty first row');
console.log('- [;;] → Empty tensor structure');
console.log('');
console.log('Invalid Combinations:');
console.log('- Matrix syntax + metadata annotations');
console.log('- Spaces between semicolons create separate tokens');
console.log('');
console.log('Edge Cases:');
console.log('- Single elements remain Arrays');
console.log('- Row vectors (no semicolons) remain Arrays');
console.log('- Column vectors (with semicolons) become Matrices');
console.log('- Empty rows/slices are preserved');