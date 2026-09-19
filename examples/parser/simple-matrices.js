import { tokenize } from '../../src/parser/tokenizer.js';
import { parse } from '../../src/parser/parser.js';

// Simple function to parse and show shaped structure
function demo(code) {
    console.log(`\nCode: ${code}`);
    const tokens = tokenize(code);
    const ast = parse(tokens, () => null);
    
    const expr = ast[0].expression;
    if (expr.type === 'Shaped' && Array.isArray(expr.rows)) {
        console.log(`Type: Rank-2 Shaped (${expr.rows.length} rows)`);
        expr.rows.forEach((row, i) => {
            const values = row.map(elem => elem.value || elem.name).join(', ');
            console.log(`  Row ${i + 1}: [${values}]`);
        });
    } else if (expr.type === 'Shaped') {
        console.log(`Type: Shaped (${expr.maxDimension}D)`);
        console.log(`Structure: ${expr.structure.length} elements`);
    } else {
        console.log(`Type: ${expr.type}`);
    }
}

console.log('=== Simple Shaped Examples ===');

// Basic 2D matrices
demo('[1, 2; 3, 4];');
demo('[a, b, c; d, e, f];');
demo('[1; 2; 3];'); // One-column Shaped

// 3D shaped values
demo('[1, 2; 3, 4 ;; 5, 6; 7, 8];');
demo('[x; y ;; z; w];');

// Higher dimensions
demo('[1; 2 ;; 3; 4 ;;; 5; 6 ;; 7; 8];');

console.log('\nRank-2 Shaped: Use single semicolons (;) to separate rows');
console.log('Shaped: Use multiple semicolons (;;, ;;;, etc.) for higher dimensions');