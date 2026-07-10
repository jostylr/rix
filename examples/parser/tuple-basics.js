import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function simpleSystemLookup(name) {
    return { type: 'identifier' };
}

function showExample(description, code) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, simpleSystemLookup);
        const expr = ast[0]?.expression || ast[0];
        
        if (expr.type === 'Tuple') {
            console.log(`Result: Tuple with ${expr.elements.length} elements`);
            expr.elements.forEach((elem, i) => {
                const display = elem.type === 'NULL' ? 'null' : 
                               elem.type === 'Number' ? elem.value :
                               elem.type === 'UserIdentifier' ? elem.name : 
                               elem.type;
                console.log(`  [${i}] ${display}`);
            });
        } else if (expr.type === 'Grouping') {
            console.log(`Result: Grouped expression (${expr.expression.type})`);
        } else {
            console.log(`Result: ${expr.type}`);
        }
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
}

console.log('RiX Tuple Basics\n================');

// Basic tuple examples
showExample('Empty tuple', '()');
showExample('Single value (not a tuple)', '(5)');
showExample('Singleton tuple', '(5,)');
showExample('Two elements', '(x, y)');
showExample('Three elements', '(1, 2, 3)');

// Underscore as NULL
showExample('Underscore as NULL', '(_)');
showExample('Mixed with NULL', '(1, _, 3)');
showExample('All NULLs', '(_, _, _)');

// Trailing commas
showExample('Trailing comma', '(a, b, c,)');

// Nested tuples
showExample('Nested tuples', '((1, 2), (3, 4))');

// Common errors
console.log('\nCommon Errors:');
showExample('Consecutive commas', '(1,, 2)');
showExample('Empty element', '(1, , 2)');

console.log('\nKey Points:');
console.log('• () = empty tuple');
console.log('• (x) = grouped expression');  
console.log('• (x,) = singleton tuple');
console.log('• _ = NULL symbol anywhere');
console.log('• Comma presence determines tuple vs grouping');