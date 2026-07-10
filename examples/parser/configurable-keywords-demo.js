/**
 * Configurable Keywords Demo - WHILE Loop Implementation
 * Demonstrates how System Tinkerers can implement control flow keywords
 */

import { parse, tokenize } from '../index.js';
import { SystemLoader } from ../../src/parser/system-loader.js';

// Create a system loader with custom WHILE implementation
const systemLoader = new SystemLoader({
    strictMode: false,
    allowUserOverrides: false
});

// Register WHILE as a control structure keyword
systemLoader.registerKeyword('WHILE', {
    type: 'control',
    structure: 'loop',
    precedence: 5,
    category: 'control',
    syntax: 'WHILE condition DO body',
    semantics: 'iterative_execution'
});

// Register DO as a control keyword
systemLoader.registerKeyword('DO', {
    type: 'control',
    structure: 'loop_body',
    precedence: 4,
    category: 'control'
});

// Register END as a block terminator
systemLoader.registerKeyword('END', {
    type: 'control',
    structure: 'block_end',
    precedence: 1,
    category: 'control'
});

// Add support for comparison operators in conditions
systemLoader.registerKeyword('LT', {
    type: 'operator',
    precedence: 60,
    associativity: 'left',
    operatorType: 'infix',
    category: 'comparison',
    symbol: '<'
});

systemLoader.registerKeyword('GT', {
    type: 'operator',
    precedence: 60,
    associativity: 'left',
    operatorType: 'infix',
    category: 'comparison',
    symbol: '>'
});

systemLoader.registerKeyword('EQ', {
    type: 'operator',
    precedence: 50,
    associativity: 'left',
    operatorType: 'infix',
    category: 'comparison',
    symbol: '=='
});

// Add increment operator
systemLoader.registerOperator('++', {
    type: 'operator',
    precedence: 115,
    operatorType: 'postfix',
    category: 'increment'
});

// Custom AST visitor for WHILE loops
class WhileLoopVisitor {
    visit(node) {
        const methodName = `visit${node.type}`;
        if (this[methodName]) {
            return this[methodName](node);
        }
        return this.visitGeneric(node);
    }
    
    visitStatement(node) {
        return this.visit(node.expression);
    }
    
    visitSystemIdentifier(node) {
        // Handle WHILE keyword specially
        if (node.name === 'WHILE' && node.systemInfo?.type === 'control') {
            return this.createWhileLoop(node);
        }
        return { type: 'system_call', name: node.name, info: node.systemInfo };
    }
    
    visitBinaryOperation(node) {
        // Handle control flow operators
        if (node.operator === 'DO') {
            return {
                type: 'while_loop',
                condition: this.visit(node.left),
                body: this.visit(node.right)
            };
        }
        
        return {
            type: 'binary_op',
            operator: node.operator,
            left: this.visit(node.left),
            right: this.visit(node.right)
        };
    }
    
    visitUserIdentifier(node) {
        return { type: 'variable', name: node.name };
    }
    
    visitNumber(node) {
        return { type: 'literal', value: node.value };
    }
    
    visitGeneric(node) {
        return { type: 'unknown', nodeType: node.type, original: node };
    }
    
    createWhileLoop(whileNode) {
        return {
            type: 'while_construct',
            keyword: whileNode.name,
            semantics: 'loop_with_condition'
        };
    }
}

// JavaScript execution engine for WHILE loops
class WhileLoopExecutor {
    constructor() {
        this.variables = new Map();
        this.maxIterations = 1000; // Safety limit
    }
    
    setVariable(name, value) {
        this.variables.set(name, value);
    }
    
    getVariable(name) {
        return this.variables.get(name) || 0;
    }
    
    execute(ast) {
        return this.evaluateNode(ast);
    }
    
    evaluateNode(node) {
        switch (node.type) {
            case 'while_loop':
                return this.executeWhileLoop(node);
            case 'binary_op':
                return this.evaluateBinaryOp(node);
            case 'variable':
                return this.getVariable(node.name);
            case 'literal':
                return parseFloat(node.value);
            case 'assignment':
                this.setVariable(node.variable, this.evaluateNode(node.value));
                return this.getVariable(node.variable);
            default:
                return null;
        }
    }
    
    executeWhileLoop(node) {
        const results = [];
        let iterations = 0;
        
        while (this.evaluateNode(node.condition) && iterations < this.maxIterations) {
            const result = this.evaluateNode(node.body);
            results.push({
                iteration: iterations + 1,
                result,
                variables: new Map(this.variables)
            });
            iterations++;
        }
        
        return {
            type: 'while_result',
            iterations,
            results,
            terminated: iterations < this.maxIterations ? 'condition_false' : 'max_iterations'
        };
    }
    
    evaluateBinaryOp(node) {
        const left = this.evaluateNode(node.left);
        const right = this.evaluateNode(node.right);
        
        switch (node.operator) {
            case 'LT': return left < right;
            case 'GT': return left > right;
            case 'EQ': return left === right;
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return right !== 0 ? left / right : Infinity;
            case ':=': 
                // Assignment - store in variables
                if (node.left.type === 'variable') {
                    this.setVariable(node.left.name, right);
                    return right;
                }
                return right;
            default:
                return null;
        }
    }
}

// Demo function
function demonstrateWhileKeyword() {
    console.log('=== RiX Configurable WHILE Keyword Demo ===\n');
    
    const visitor = new WhileLoopVisitor();
    const executor = new WhileLoopExecutor();
    
    // Example WHILE loop constructs
    const examples = [
        // Simple counting loop
        'i := 1; WHILE i LT 5 DO i := i + 1',
        
        // Accumulator pattern
        'sum := 0; i := 1; WHILE i LT 4 DO (sum := sum + i; i := i + 1)',
        
        // Condition with mathematical expression
        'x := 10; WHILE x GT 1 DO x := x / 2',
        
        // Complex condition
        'a := 1; b := 1; WHILE a + b LT 20 DO (temp := a + b; a := b; b := temp)'
    ];
    
    examples.forEach((code, index) => {
        console.log(`\nExample ${index + 1}: ${code}`);
        console.log('-'.repeat(50));
        
        try {
            // Tokenize and parse
            const tokens = tokenize(code);
            console.log('Tokens:', tokens.slice(0, -1).map(t => `${t.type}:${t.value}`).join(' '));
            
            const ast = parse(code, systemLoader.createParserLookup());
            console.log('Parsed statements:', ast.length);
            
            // Visit AST to transform WHILE constructs
            const transformed = ast.map(stmt => visitor.visit(stmt));
            console.log('Transformed AST:');
            transformed.forEach((node, i) => {
                console.log(`  Statement ${i + 1}:`, JSON.stringify(node, null, 2));
            });
            
            // Simulate execution for WHILE loops
            executor.variables.clear(); // Reset variables
            let lastResult;
            
            transformed.forEach(node => {
                lastResult = executor.execute(node);
            });
            
            if (lastResult && lastResult.type === 'while_result') {
                console.log('\nExecution Result:');
                console.log(`  Iterations: ${lastResult.iterations}`);
                console.log(`  Termination: ${lastResult.terminated}`);
                console.log('  Final variables:', Object.fromEntries(executor.variables));
                
                if (lastResult.results.length <= 5) {
                    console.log('  Iteration trace:');
                    lastResult.results.forEach(iter => {
                        console.log(`    ${iter.iteration}: vars = ${JSON.stringify(Object.fromEntries(iter.variables))}`);
                    });
                }
            } else {
                console.log('Final variables:', Object.fromEntries(executor.variables));
            }
            
        } catch (error) {
            console.error('Error:', error.message);
        }
    });
    
    // Demonstrate keyword configuration
    console.log('\n=== Keyword Configuration Demo ===');
    
    // Show how to customize WHILE keyword behavior
    console.log('\nCustomizing WHILE keyword...');
    systemLoader.registerKeyword('REPEAT', {
        type: 'control',
        structure: 'loop',
        precedence: 5,
        category: 'control',
        syntax: 'REPEAT body UNTIL condition',
        semantics: 'post_condition_loop'
    });
    
    systemLoader.registerKeyword('UNTIL', {
        type: 'control',
        structure: 'loop_terminator',
        precedence: 4,
        category: 'control'
    });
    
    // Alternative loop syntax
    const repeatExample = 'i := 1; REPEAT i := i + 1 UNTIL i GT 5';
    console.log(`\nNew syntax available: ${repeatExample}`);
    
    try {
        const tokens = tokenize(repeatExample);
        const systemSymbols = tokens.filter(t => t.type === 'Identifier' && t.kind === 'System');
        console.log('System symbols found:', systemSymbols.map(t => t.value));
        
        systemSymbols.forEach(token => {
            const info = systemLoader.lookup(token.value);
            console.log(`  ${token.value}: ${info.type} (${info.category})`);
        });
        
    } catch (error) {
        console.error('Configuration demo error:', error.message);
    }
    
    // Show system configuration
    console.log('\n=== System Configuration ===');
    const config = systemLoader.exportConfig();
    console.log(`Control keywords: ${config.keywords.filter(([_, def]) => def.category === 'control').length}`);
    console.log(`Comparison operators: ${config.keywords.filter(([_, def]) => def.category === 'comparison').length}`);
    console.log(`Total extensions: ${config.system.length + config.keywords.length + config.operators.length}`);
    
    return { systemLoader, visitor, executor };
}

// Browser integration helper
function createBrowserWhileDemo() {
    if (typeof window !== 'undefined') {
        window.RiXWhileDemo = {
            systemLoader,
            
            // Easy configuration functions
            enableWhileLoops() {
                demonstrateWhileKeyword();
                return 'WHILE loops enabled with keywords: WHILE, DO, END';
            },
            
            parseWhileLoop(code) {
                try {
                    const tokens = tokenize(code);
                    const ast = parse(code, systemLoader.createParserLookup());
                    return { success: true, tokens, ast };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
            
            executeWhileLoop(code) {
                const visitor = new WhileLoopVisitor();
                const executor = new WhileLoopExecutor();
                
                try {
                    const ast = parse(code, systemLoader.createParserLookup());
                    const transformed = ast.map(stmt => visitor.visit(stmt));
                    
                    executor.variables.clear();
                    let result;
                    transformed.forEach(node => {
                        result = executor.execute(node);
                    });
                    
                    return {
                        success: true,
                        result,
                        variables: Object.fromEntries(executor.variables)
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
        };
    }
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateWhileKeyword();
}

// Set up browser integration
createBrowserWhileDemo();

export { 
    systemLoader as whileSystemLoader, 
    WhileLoopVisitor, 
    WhileLoopExecutor, 
    demonstrateWhileKeyword,
    createBrowserWhileDemo
};