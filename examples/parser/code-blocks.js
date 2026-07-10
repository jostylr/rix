import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

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

function parseAndPrint(code, description) {
    console.log(`\n=== ${description} ===`);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const codeBlock = ast[0].expression;
        
        console.log(`✓ Result: ${codeBlock.type} with ${codeBlock.statements.length} statement(s)`);
        
        if (codeBlock.statements.length > 0) {
            console.log('Statements:');
            codeBlock.statements.forEach((stmt, i) => {
                const stmtDesc = stmt.type === 'BinaryOperation' 
                    ? `${stmt.left.name || stmt.left.value} ${stmt.operator} ${stmt.right.name || stmt.right.value}`
                    : stmt.type === 'Number' ? stmt.value
                    : stmt.type === 'UserIdentifier' ? stmt.name
                    : `${stmt.type}`;
                console.log(`  ${i + 1}. ${stmtDesc}`);
            });
        }
    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

function compareStructures(code1, desc1, code2, desc2) {
    console.log(`\n=== Comparing: ${desc1} vs ${desc2} ===`);
    console.log(`Code 1: ${code1}`);
    console.log(`Code 2: ${code2}`);
    
    try {
        const tokens1 = tokenize(code1 + ';');
        const ast1 = parse(tokens1, systemLookup);
        const tokens2 = tokenize(code2 + ';');
        const ast2 = parse(tokens2, systemLookup);
        
        const type1 = ast1[0].expression ? ast1[0].expression.type : ast1[0].type;
        const type2 = ast2[0].expression ? ast2[0].expression.type : ast2[0].type;
        
        console.log(`Result 1: ${type1}`);
        console.log(`Result 2: ${type2}`);
        
        if (type1 !== type2) {
            console.log('✓ Different types as expected!');
        } else {
            console.log('⚠ Same types');
        }
    } catch (error) {
        console.error('✗ Error:', error.message);
    }
}

console.log('RiX Code Block Examples {; }');
console.log('=====================================');

// Basic examples
parseAndPrint('{;};', 'Empty code block');
parseAndPrint('{;42};', 'Code block with single number');
parseAndPrint('{;x};', 'Code block with single identifier');
parseAndPrint('{;x + y};', 'Code block with single expression');

// Assignment examples
parseAndPrint('{;x := 1};', 'Code block with assignment');
parseAndPrint('{;name := "Alice"};', 'Code block with string assignment');
parseAndPrint('{;result := SIN(PI/4)};', 'Code block with function call assignment');

// Multiple statements
parseAndPrint('{;x := 1; y := 2};', 'Code block with two assignments');
parseAndPrint('{;a := 5; b := 10; sum := a + b};', 'Code block with calculation');
parseAndPrint('{;x := 1; y := x * 2; z := x + y; result := z^2};', 'Code block with dependent calculations');

// Mixed statement types
parseAndPrint('{;x := 1; x + 5; y := x * 2};', 'Code block with mixed assignments and expressions');
parseAndPrint('{;data := [1, 2, 3]; MAX(data); MIN(data)};', 'Code block with array and function calls');

// Function definitions (if supported)
parseAndPrint('{;square := x -> x^2; square(5)};', 'Code block with function definition and call');

// Nested structures
parseAndPrint('{;coords := {x := 10, y := 20}; distance := (coords.x^2 + coords.y^2)^0.5};', 'Code block with map and calculation');

console.log('\n\n=== DISTINCTION EXAMPLES ===');
console.log('Demonstrating that spaces matter between braces');

// Key distinction: {; } vs { {} }
compareStructures('{;3}', 'Code block with 3', '{ {3} }', 'Set containing set with 3');
compareStructures('{;}', 'Empty code block', '{ {} }', 'Set containing empty set');
compareStructures('{;x := 1}', 'Code block with assignment', '{ {x := 1} }', 'Set containing map with assignment');

// More complex distinctions  
compareStructures('{;a; b; c}', 'Code block with multiple statements', '{ {a, b, c} }', 'Set containing set with elements');

console.log('\n\n=== ADVANCED EXAMPLES ===');

// Code blocks with different types of content
parseAndPrint('{;if_condition := x > 0; then_value := x^2; else_value := -x};', 'Conditional logic simulation');
parseAndPrint('{;input := 5; step1 := input * 2; step2 := step1 + 10; output := step2 / 3};', 'Pipeline processing');
parseAndPrint('{;matrix := [1, 2; 3, 4]; det := 1*4 - 2*3};', 'Matrix operations (simplified)');

// Nested code blocks
parseAndPrint('{;outer := 1; inner := {;nested := outer + 1; nested * 2}; result := inner + outer};', 'Nested code blocks');

console.log('\n=== Error Cases ===');
console.log('Testing malformed code blocks:');

// Test error handling
parseAndPrint('{;x := 1', 'Missing closing braces (should error)');
parseAndPrint('x := 1}', 'Missing opening braces (should error)');
parseAndPrint('{;}}', 'Extra closing braces (should error)');

console.log('\nCode block examples completed!');