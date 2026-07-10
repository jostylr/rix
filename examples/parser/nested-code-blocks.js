import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function demonstrateNested(code, title, description) {
    console.log(`\n=== ${title} ===`);
    console.log(description);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const codeBlock = ast[0].expression;
        
        console.log(`✓ Parsed successfully as ${codeBlock.type}`);
        
        // Count nesting levels
        function countNestingLevels(node, currentLevel = 0) {
            let maxLevel = currentLevel;
            
            if (node && typeof node === 'object') {
                if (node.type === 'BlockContainer' && currentLevel > 0) {
                    console.log(`  ${'  '.repeat(currentLevel)}Level ${currentLevel}: BlockContainer with ${node.statements ? node.statements.length : 0} statement(s)`);
                }
                
                Object.values(node).forEach(value => {
                    if (Array.isArray(value)) {
                        value.forEach(item => {
                            const level = countNestingLevels(item, node.type === 'BlockContainer' ? currentLevel + 1 : currentLevel);
                            maxLevel = Math.max(maxLevel, level);
                        });
                    } else if (value && typeof value === 'object') {
                        const level = countNestingLevels(value, node.type === 'BlockContainer' ? currentLevel + 1 : currentLevel);
                        maxLevel = Math.max(maxLevel, level);
                    }
                });
            }
            
            return maxLevel;
        }
        
        const maxLevel = countNestingLevels(codeBlock);
        console.log(`  Maximum nesting depth: ${maxLevel}`);
        
    } catch (error) {
        console.error(`✗ Parse error: ${error.message}`);
    }
}

console.log('RiX Nested Code Block Examples');
console.log('==============================');
console.log('Demonstrating code blocks within code blocks {; {; } }\n');

// Basic nested code blocks
demonstrateNested(
    '{; a := {; 3 } };',
    'Simple Nested Assignment',
    'Assign the result of a code block to a variable'
);

demonstrateNested(
    '{; result := {; x := 5; x * 2 } };',
    'Nested Computation',
    'Assign the result of a multi-statement computation'
);

// Multiple levels of nesting
demonstrateNested(
    '{; x := {; y := {; z := 42 } } };',
    'Three-Level Nesting',
    'Deeply nested code blocks - each level assigns to the next'
);

demonstrateNested(
    '{; a := {; b := {; c := {; d := 1 } } } };',
    'Four-Level Nesting',
    'Maximum practical nesting depth demonstration'
);

// Complex nested scenarios
demonstrateNested(
    '{; outer := 1; inner := {; nested := 2; nested + 1 }; result := outer + inner };',
    'Mixed Nested and Sequential',
    'Combine nested code blocks with sequential statements'
);

demonstrateNested(
    '{; config := {; width := 800; height := 600; width * height }; area := config; scale := 2 };',
    'Configuration Block',
    'Use nested code block as a configuration computation'
);

// Practical nested examples
demonstrateNested(
    '{; physics := {; mass := 10; velocity := 25; mass * velocity^2 / 2 }; kinetic_energy := physics };',
    'Physics Calculation Module',
    'Encapsulate physics calculations in nested block'
);

demonstrateNested(
    '{; geometry := {; radius := 5; area := PI * radius^2; circumference := 2 * PI * radius; area + circumference }; total := geometry };',
    'Geometry Calculation Module',
    'Complex geometric calculations in nested structure'
);

// Advanced nesting patterns
demonstrateNested(
    '{; pipeline := {; stage1 := {; input := 10; input * 2 }; stage2 := {; temp := stage1; temp + 5 }; stage2 }; output := pipeline };',
    'Multi-Stage Pipeline',
    'Three-stage processing pipeline with intermediate results'
);

demonstrateNested(
    '{; math_ops := {; basic := {; a := 3; b := 4; a + b }; advanced := {; x := basic; y := 2; x^y }; advanced }; final := math_ops };',
    'Mathematical Operation Hierarchy',
    'Hierarchical mathematical operations with dependencies'
);

// Nested with different expression types
demonstrateNested(
    '{; data_processing := {; raw := [1, 2, 3, 4, 5]; processed := {; sum := 15; count := 5; sum / count }; processed }; average := data_processing };',
    'Data Processing with Arrays',
    'Combine arrays with nested computational blocks'
);

demonstrateNested(
    '{; algorithm := {; params := {; threshold := 0.5; max_iter := 100; learning_rate := 0.01 }; iteration := {; current := 0; next := current + 1; converged := false }; params }; settings := algorithm };',
    'Algorithm Configuration',
    'Complex algorithm settings with nested parameter blocks'
);

console.log('\n=== Nested vs Non-Nested Comparison ===');

console.log('\nNested approach:');
console.log('{; result := {; base := 10; multiplier := 3; base * multiplier } };');

console.log('\nNon-nested equivalent:');
console.log('{; base := 10; multiplier := 3; temp := base * multiplier; result := temp };');

console.log('\nBenefits of nesting:');
console.log('• Encapsulation of intermediate calculations');
console.log('• Clear separation of computation stages');
console.log('• Reduced variable namespace pollution');
console.log('• Logical grouping of related operations');

console.log('\n=== Best Practices for Nested Code Blocks ===');
console.log('1. Use nesting to encapsulate related computations');
console.log('2. Limit nesting depth to maintain readability (max 3-4 levels)');
console.log('3. Use meaningful variable names for nested block results');
console.log('4. Consider non-nested alternatives for simple cases');
console.log('5. Use nesting for modular, reusable computation patterns');
console.log('6. Remember: {; {; } } creates true nested scope');

console.log('\n=== Error Cases ===');
console.log('Testing malformed nested structures:');

// Test error handling
demonstrateNested('{; a := {; b := 1 };', 'Missing inner closing braces');
demonstrateNested('{; a := {; b := 1 } }', 'Missing outer closing braces');
demonstrateNested('{; a := { b := 1 } };', 'Mixed brace types (should work differently)');

console.log('\nNested code block examples completed!');