import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// Simple system lookup for demonstration
function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E },
        'MAX': { type: 'function', arity: -1 },
        'MIN': { type: 'function', arity: -1 }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function parseAndDisplay(code, description) {
    console.log(`\n${description}`);
    console.log('='.repeat(50));
    console.log(`Input: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        
        if (ast[0].expression.type === 'WithMetadata') {
            const node = ast[0].expression;
            console.log(`\n✓ Parsed as WithMetadata node`);
            console.log(`Primary element:`, 
                node.primary.type === 'Array' && node.primary.elements.length === 0 
                    ? '(none - metadata only)' 
                    : `${node.primary.type}: ${node.primary.name || node.primary.value || '...'}`
            );
            console.log(`Metadata properties:`);
            Object.entries(node.metadata).forEach(([key, value]) => {
                const valueDesc = value.type === 'String' ? `"${value.value}"` :
                                 value.type === 'Number' ? value.value :
                                 value.type === 'UserIdentifier' ? value.name :
                                 value.type === 'BinaryOperation' ? `${value.operator} expression` :
                                 'complex expression';
                console.log(`  ${key}: ${valueDesc}`);
            });
        } else {
            console.log(`\n✓ Parsed as regular ${ast[0].expression.type} node`);
        }
        
    } catch (error) {
        console.log(`\n✗ Parse error: ${error.message}`);
    }
}

console.log('RiX Metadata and Property Annotations Demo');
console.log('==========================================');

// Basic metadata annotation
parseAndDisplay(
    '[obj, name := "foo"];',
    '1. Basic Metadata Annotation'
);

// Multiple metadata properties
parseAndDisplay(
    '[matrix, rows := 3, cols := 4, type := "sparse"];',
    '2. Multiple Metadata Properties'
);

// Expression values in metadata
parseAndDisplay(
    '[data, size := count + 1, factor := x * y];',
    '3. Metadata with Expression Values'
);

// System identifier keys
parseAndDisplay(
    '[config, MAX := 100, MIN := 0];',
    '4. System Identifier Keys'
);

// String keys (useful for properties with special characters)
parseAndDisplay(
    '[api, "base-url" := "https://api.example.com", "api-key" := token];',
    '5. String Keys for Special Characters'
);

// Metadata only (no primary element)
parseAndDisplay(
    '[name := "configuration", version := 1.2, debug := false];',
    '6. Metadata Only (No Primary Element)'
);

// Array as primary element with metadata
parseAndDisplay(
    '[[1, 2, 3], name := "numbers", length := 3];',
    '7. Array as Primary Element with Metadata'
);

// Nested expressions in metadata
parseAndDisplay(
    '[transform, scale := 2.0, rotation := PI / 4, center := {x: 0, y: 0}];',
    '8. Complex Metadata Values'
);

// Function calls in metadata
parseAndDisplay(
    '[dataset, size := MAX(records), average := SIN(angle)];',
    '9. Function Calls in Metadata'
);

// Regular array (no metadata) - should still work
parseAndDisplay(
    '[1, 2, 3, 4, 5];',
    '10. Regular Array (No Metadata) - Still Works'
);

console.log('\n' + '='.repeat(50));
console.log('\nMetadata Annotation Rules:');
console.log('• Use [element, key := value, ...] syntax');
console.log('• Only one non-metadata element allowed (becomes primary)');
console.log('• For array primary: use [[1,2,3], key := value] syntax');
console.log('• Keys can be identifiers or string literals');
console.log('• Values can be any valid expression');
console.log('• Creates WithMetadata AST node instead of Array');
console.log('• Regular arrays without := still work normally');

console.log('\nUse Cases:');
console.log('• Object properties and attributes');
console.log('• Configuration with metadata');
console.log('• Data structures with annotations');
console.log('• Type information and constraints');
console.log('• Documentation and descriptions');