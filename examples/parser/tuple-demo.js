import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// Simple system lookup for basic operations
function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'MAX': { type: 'function', arity: -1 },
        'MIN': { type: 'function', arity: -1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

// Test cases demonstrating tuple functionality in RiX
const tupleTestCases = [
    {
        name: "Empty Tuple",
        code: "();",
        description: "Empty tuple with no elements"
    },
    
    {
        name: "Grouped Expression (Not a Tuple)",
        code: "(42);",
        description: "Single value in parentheses - treated as grouped expression, not tuple"
    },
    
    {
        name: "Singleton Tuple",
        code: "(42,);",
        description: "Single element tuple with trailing comma"
    },
    
    {
        name: "Two-Element Tuple",
        code: "(3, 4);",
        description: "Simple two-element tuple with numbers"
    },
    
    {
        name: "Three-Element Tuple",
        code: "(a, b, c);",
        description: "Three-element tuple with identifiers"
    },
    
    {
        name: "Tuple with Underscore (Null)",
        code: "(3, _, 5);",
        description: "Tuple with underscore representing null/missing value"
    },
    
    {
        name: "Multiple Underscores",
        code: "(_, _, _);",
        description: "Tuple with all null values using underscores"
    },
    
    {
        name: "Mixed Data Types",
        code: "(42, \"hello\", PI, _);",
        description: "Tuple with mixed data types: number, string, constant, null"
    },
    
    {
        name: "Tuple with Expressions",
        code: "(a + b, x * y, SIN(PI/2));",
        description: "Tuple containing computed expressions"
    },
    
    {
        name: "Nested Tuples",
        code: "((1, 2), (3, 4), (5, 6));",
        description: "Tuple containing other tuples as elements"
    },
    
    {
        name: "Complex Nested Structure",
        code: "(point := (x, y), color := \"red\", visible := true);",
        description: "Tuple with assignments containing sub-tuples"
    },
    
    {
        name: "Tuple with Trailing Comma",
        code: "(1, 2, 3,);",
        description: "Multi-element tuple with trailing comma"
    },
    
    {
        name: "Function Call in Tuple",
        code: "(MAX(1, 2, 3), MIN(4, 5, 6));",
        description: "Tuple containing function call results"
    },
    
    {
        name: "Coordinates Tuple",
        code: "position := (x, y, z);",
        description: "Assignment of 3D coordinate tuple to variable"
    },
    
    {
        name: "Tuple Assignment Destructuring Style",
        code: "(first, second, third) := (1, 2, 3);",
        description: "Tuple-to-tuple assignment (destructuring-like syntax)"
    },
    
    {
        name: "Underscore as Null Symbol",
        code: "_ := 42;",
        description: "Underscore is always a null symbol, even outside tuples"
    },
    
    {
        name: "Complex Mathematical Tuple",
        code: "(SIN(x), COS(x), x^2 + y^2);",
        description: "Mathematical expressions in tuple elements"
    },
    
    {
        name: "Sparse Tuple Pattern",
        code: "(data, _, _, metadata);",
        description: "Sparse tuple with gaps represented by underscores"
    }
];

// Test cases that should produce errors
const errorTestCases = [
    {
        name: "Consecutive Commas Error",
        code: "(3,, 2);",
        description: "Should error: consecutive commas not allowed",
        shouldError: true
    },
    
    {
        name: "Empty Element Error",
        code: "(1, , 3);",
        description: "Should error: empty element between commas",
        shouldError: true
    }
];

console.log('RiX Language Tuple Feature Demonstration\n');
console.log('='.repeat(60));

// Test valid tuple cases
tupleTestCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.name}`);
    console.log('-'.repeat(40));
    console.log(`Code: ${testCase.code}`);
    console.log(`Description: ${testCase.description}`);
    
    try {
        // Tokenize
        const tokens = tokenize(testCase.code);
        console.log(`\nTokens (${tokens.length - 1}): ${tokens.slice(0, -1).map(t => t.value).join(' ')}`);
        
        // Parse
        const ast = parse(tokens, systemLookup);
        
        // Extract the main expression for cleaner output
        const mainExpr = ast[0]?.expression || ast[0];
        console.log(`\nAST Type: ${mainExpr.type}`);
        
        if (mainExpr.type === 'Tuple') {
            console.log(`Elements: ${mainExpr.elements.length}`);
            mainExpr.elements.forEach((elem, i) => {
                const elemType = elem.type === 'NULL' ? 'null' : 
                               elem.type === 'Number' ? `${elem.value}` :
                               elem.type === 'String' ? `"${elem.value}"` :
                               elem.type === 'UserIdentifier' ? elem.name :
                               elem.type === 'SystemIdentifier' ? elem.name :
                               elem.type;
                console.log(`  [${i}]: ${elemType}`);
            });
        } else if (mainExpr.type === 'Grouping') {
            console.log(`Grouped Expression: ${mainExpr.expression.type}`);
        } else if (mainExpr.type === 'Statement' && mainExpr.expression) {
            console.log(`Statement containing: ${mainExpr.expression.type}`);
        }
        
    } catch (error) {
        console.error(`\nError: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
});

// Test error cases
console.log('\nError Cases:');
console.log('='.repeat(60));

errorTestCases.forEach((testCase, index) => {
    console.log(`\n${tupleTestCases.length + index + 1}. ${testCase.name}`);
    console.log('-'.repeat(40));
    console.log(`Code: ${testCase.code}`);
    console.log(`Description: ${testCase.description}`);
    
    try {
        const tokens = tokenize(testCase.code);
        const ast = parse(tokens, systemLookup);
        
        if (testCase.shouldError) {
            console.log('\nUnexpected: This should have produced an error!');
        } else {
            console.log('\nParsed successfully');
        }
        
    } catch (error) {
        if (testCase.shouldError) {
            console.log(`\nExpected Error: ${error.message}`);
        } else {
            console.error(`\nUnexpected Error: ${error.message}`);
        }
    }
    
    console.log('\n' + '='.repeat(60));
});

console.log('\nTuple Features Summary:');
console.log('• Empty tuples: ()');
console.log('• Singleton tuples: (value,)');
console.log('• Multi-element tuples: (a, b, c)');
console.log('• Null placeholders: underscore _ becomes null');
console.log('• Nested tuples: ((a, b), (c, d))');
console.log('• Mixed data types supported');
console.log('• Trailing commas allowed');
console.log('• Expression evaluation in elements');
console.log('• Distinguished from grouped expressions');
console.log('• Error handling for invalid syntax');

console.log('\nKey Distinctions:');
console.log('• (value) → Grouped expression');
console.log('• (value,) → Singleton tuple');
console.log('• (a, b) → Two-element tuple');
console.log('• _ anywhere → null symbol (not identifier)');
console.log('• _ can be used for dynamic access (future feature)');