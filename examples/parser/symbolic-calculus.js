import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'TAN': { type: 'function', arity: 1 },
        'LOG': { type: 'function', arity: 1 },
        'EXP': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function demonstrateCalculus(description, code) {
    console.log(`\n${description}:`);
    console.log(`Input: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const result = ast[0];
        
        console.log(`✓ Parsed as: ${result.type}`);
        
        if (result.type === 'Derivative') {
            console.log(`  Function: ${result.function.name || result.function.type}`);
            console.log(`  Order: ${result.order}`);
            if (result.variables) {
                console.log(`  Variables: [${result.variables.map(v => v.name).join(', ')}]`);
            }
            if (result.evaluation) {
                console.log(`  Evaluation at: [${result.evaluation.map(e => e.name || e.type).join(', ')}]`);
            }
            if (result.operations) {
                console.log(`  Operations: ${result.operations.length} calculus operations`);
            }
        } else if (result.type === 'Integral') {
            console.log(`  Function: ${result.function.name || result.function.type}`);
            console.log(`  Order: ${result.order}`);
            if (result.variables) {
                console.log(`  Variables: [${result.variables.map(v => v.name).join(', ')}]`);
            }
            if (result.evaluation) {
                console.log(`  Evaluation at: [${result.evaluation.map(e => e.name || e.type).join(', ')}]`);
            }
            if (result.metadata) {
                console.log(`  Integration constant: ${result.metadata.integrationConstant} (default: ${result.metadata.defaultValue})`);
            }
        }
        
    } catch (error) {
        console.log(`✗ Parse error: ${error.message}`);
    }
}

console.log('RiX Symbolic Calculus Examples');
console.log('==============================');

// Basic derivatives
demonstrateCalculus('Simple derivative function', "f'");
demonstrateCalculus('Second derivative', "f''");
demonstrateCalculus('Third derivative', "f'''");

// Derivatives with evaluation
demonstrateCalculus('Derivative evaluated at point', "f'(x)");
demonstrateCalculus('Second derivative at multiple points', "f''(a, b)");

// Derivatives with variable specification
demonstrateCalculus('Partial derivative with variables', "f'[x, y]");
demonstrateCalculus('Mixed partial derivative', "f''[x, y]");

// Function derivatives
demonstrateCalculus('Derivative of sine function', "SIN(x)'");
demonstrateCalculus('Derivative of composite function', "LOG(x^2)'");

// Basic integrals
demonstrateCalculus('Simple indefinite integral', "'f");
demonstrateCalculus('Double integral', "''f");
demonstrateCalculus('Triple integral', "'''f");

// Integrals with evaluation
demonstrateCalculus('Integral evaluated at point', "'f(x)");
demonstrateCalculus('Double integral at boundaries', "''f(a, b)");

// Integrals with variable specification
demonstrateCalculus('Integral with respect to x', "'f[x]");
demonstrateCalculus('Double integral over x and y', "''f[x, y]");

// Mixed calculus operations
demonstrateCalculus('Integrate then differentiate', "'f'");
demonstrateCalculus('Differentiate then integrate', "f''");
demonstrateCalculus('Complex mixed operations', "'f'[x, y]");

// Advanced notation examples
demonstrateCalculus('Mixed operations with evaluation', "'f'(x)");
demonstrateCalculus('Operations sequence in parentheses', "f'('x, y')");
demonstrateCalculus('Complex sequence with variables', "''f''[x, y, z]('x, y', 'z, x')");

// Path derivatives
demonstrateCalculus('Path derivative notation', "f'(r')");

// Chained operations
demonstrateCalculus('Chained derivative operations', "SIN(x)'''");
demonstrateCalculus('Nested function with calculus', "LOG(SIN(x))'");

console.log('\nSymbolic Calculus Demo Complete!');
console.log('\nKey Features Demonstrated:');
console.log('• Derivative notation: f\', f\'\', f\'\'\'');
console.log('• Integral notation: \'f, \'\'f, \'\'\'f');
console.log('• Variable specification: f\'[x,y], \'f[x,y]');
console.log('• Evaluation vs operations: f\'(x) vs f\'(x\')');
console.log('• Mixed sequences: \'f\', f\'\'');
console.log('• Function derivatives: SIN(x)\', LOG(x^2)\'');
console.log('• Integration constants: automatic metadata');