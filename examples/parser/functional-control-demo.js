/**
 * Functional Control Structures Demo
 * Demonstrates WHILE(condition, body) syntax equivalent to WHILE condition DO body
 */

import { parse, tokenize } from '../index.js';
import { SystemLoader } from ../../src/parser/system-loader.js';

// Create system loader with functional control support
const systemLoader = new SystemLoader({
    strictMode: false,
    allowUserOverrides: false
});

// Register control keywords with functional form support
systemLoader.registerKeyword('WHILE', {
    type: 'control',
    structure: 'loop',
    precedence: 5,
    category: 'control',
    functionalForm: true
});

systemLoader.registerKeyword('IF', {
    type: 'control',
    structure: 'conditional',
    precedence: 5,
    category: 'control',
    functionalForm: true
});

systemLoader.registerKeyword('FOR', {
    type: 'control',
    structure: 'loop',
    precedence: 5,
    category: 'control',
    functionalForm: true
});

// Custom AST transformer for functional control structures
class FunctionalControlTransformer {
    transform(ast) {
        return ast.map(stmt => this.transformNode(stmt));
    }
    
    transformNode(node) {
        if (!node || typeof node !== 'object') return node;
        
        // Transform function calls that are actually control structures
        if (node.type === 'FunctionCall' && node.function?.type === 'SystemIdentifier') {
            const funcName = node.function.name;
            const systemInfo = systemLoader.lookup(funcName);
            
            if (systemInfo.functionalForm && systemInfo.controlType === 'control') {
                return this.transformControlFunction(funcName, node.arguments, systemInfo);
            }
        }
        
        // Recursively transform child nodes
        const transformed = { ...node };
        Object.keys(transformed).forEach(key => {
            const value = transformed[key];
            if (Array.isArray(value)) {
                transformed[key] = value.map(item => this.transformNode(item));
            } else if (value && typeof value === 'object' && value.type) {
                transformed[key] = this.transformNode(value);
            }
        });
        
        return transformed;
    }
    
    transformControlFunction(name, args, systemInfo) {
        switch (name) {
            case 'WHILE':
                return {
                    type: 'WhileLoop',
                    condition: args[0] || null,
                    body: args[1] || null,
                    originalForm: 'functional',
                    equivalent: `WHILE ${this.nodeToString(args[0])} DO ${this.nodeToString(args[1])}`
                };
                
            case 'IF':
                const ifNode = {
                    type: 'Conditional',
                    condition: args[0] || null,
                    thenBranch: args[1] || null,
                    originalForm: 'functional'
                };
                
                if (args.length >= 3) {
                    ifNode.elseBranch = args[2];
                    ifNode.equivalent = `IF ${this.nodeToString(args[0])} THEN ${this.nodeToString(args[1])} ELSE ${this.nodeToString(args[2])}`;
                } else {
                    ifNode.equivalent = `IF ${this.nodeToString(args[0])} THEN ${this.nodeToString(args[1])}`;
                }
                
                return ifNode;
                
            case 'FOR':
                return {
                    type: 'ForLoop',
                    init: args[0] || null,
                    condition: args[1] || null,
                    increment: args[2] || null,
                    body: args[3] || null,
                    originalForm: 'functional',
                    equivalent: `FOR ${this.nodeToString(args[0])}; ${this.nodeToString(args[1])}; ${this.nodeToString(args[2])} DO ${this.nodeToString(args[3])}`
                };
                
            default:
                return {
                    type: 'UnknownControl',
                    keyword: name,
                    arguments: args
                };
        }
    }
    
    nodeToString(node) {
        if (!node) return '(empty)';
        if (node.type === 'UserIdentifier') return node.name;
        if (node.type === 'Number') return node.value;
        if (node.type === 'BinaryOperation') {
            return `${this.nodeToString(node.left)} ${node.operator} ${this.nodeToString(node.right)}`;
        }
        return `(${node.type})`;
    }
}

// JavaScript execution engine for functional control structures
class FunctionalControlExecutor {
    constructor() {
        this.variables = new Map();
        this.maxIterations = 100;
    }
    
    setVariable(name, value) {
        this.variables.set(name, value);
    }
    
    getVariable(name) {
        return this.variables.get(name) || 0;
    }
    
    execute(transformedAst) {
        const results = [];
        
        transformedAst.forEach(stmt => {
            const result = this.executeStatement(stmt);
            results.push(result);
        });
        
        return results;
    }
    
    executeStatement(stmt) {
        switch (stmt.type) {
            case 'WhileLoop':
                return this.executeWhile(stmt);
            case 'Conditional':
                return this.executeIf(stmt);
            case 'ForLoop':
                return this.executeFor(stmt);
            case 'BinaryOperation':
                return this.executeBinaryOp(stmt);
            default:
                return { type: 'unknown', statement: stmt.type };
        }
    }
    
    executeWhile(stmt) {
        const iterations = [];
        let count = 0;
        
        while (this.evaluateCondition(stmt.condition) && count < this.maxIterations) {
            const beforeVars = new Map(this.variables);
            this.executeStatement(stmt.body);
            const afterVars = new Map(this.variables);
            
            iterations.push({
                iteration: count + 1,
                before: Object.fromEntries(beforeVars),
                after: Object.fromEntries(afterVars)
            });
            
            count++;
        }
        
        return {
            type: 'while_execution',
            iterations: count,
            trace: iterations,
            terminated: count < this.maxIterations ? 'condition_false' : 'max_iterations'
        };
    }
    
    executeIf(stmt) {
        const conditionValue = this.evaluateCondition(stmt.condition);
        
        if (conditionValue) {
            const result = this.executeStatement(stmt.thenBranch);
            return {
                type: 'if_execution',
                branch: 'then',
                condition: conditionValue,
                result
            };
        } else if (stmt.elseBranch) {
            const result = this.executeStatement(stmt.elseBranch);
            return {
                type: 'if_execution',
                branch: 'else',
                condition: conditionValue,
                result
            };
        }
        
        return {
            type: 'if_execution',
            branch: 'none',
            condition: conditionValue
        };
    }
    
    executeFor(stmt) {
        // Initialize
        this.executeStatement(stmt.init);
        
        const iterations = [];
        let count = 0;
        
        while (this.evaluateCondition(stmt.condition) && count < this.maxIterations) {
            const beforeVars = new Map(this.variables);
            
            // Execute body
            this.executeStatement(stmt.body);
            
            // Execute increment
            this.executeStatement(stmt.increment);
            
            const afterVars = new Map(this.variables);
            
            iterations.push({
                iteration: count + 1,
                before: Object.fromEntries(beforeVars),
                after: Object.fromEntries(afterVars)
            });
            
            count++;
        }
        
        return {
            type: 'for_execution',
            iterations: count,
            trace: iterations,
            terminated: count < this.maxIterations ? 'condition_false' : 'max_iterations'
        };
    }
    
    evaluateCondition(condition) {
        if (!condition) return false;
        
        if (condition.type === 'BinaryOperation') {
            const left = this.evaluateExpression(condition.left);
            const right = this.evaluateExpression(condition.right);
            
            switch (condition.operator) {
                case '<': return left < right;
                case '>': return left > right;
                case '<=': return left <= right;
                case '>=': return left >= right;
                case '==': return left === right;
                case '!=': return left !== right;
                default: return left && right;
            }
        }
        
        return this.evaluateExpression(condition);
    }
    
    evaluateExpression(expr) {
        if (!expr) return 0;
        
        switch (expr.type) {
            case 'Number':
                return parseFloat(expr.value);
            case 'UserIdentifier':
                return this.getVariable(expr.name);
            case 'BinaryOperation':
                return this.executeBinaryOp(expr);
            default:
                return 0;
        }
    }
    
    executeBinaryOp(node) {
        const left = this.evaluateExpression(node.left);
        const right = this.evaluateExpression(node.right);
        
        switch (node.operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return right !== 0 ? left / right : Infinity;
            case ':=':
                if (node.left.type === 'UserIdentifier') {
                    this.setVariable(node.left.name, right);
                }
                return right;
            default: return 0;
        }
    }
}

// Demonstration function
function demonstrateFunctionalControls() {
    console.log('=== Functional Control Structures Demo ===\n');
    
    const transformer = new FunctionalControlTransformer();
    const executor = new FunctionalControlExecutor();
    
    // Examples showing both functional and traditional syntax
    const examples = [
        {
            name: 'WHILE Loop - Functional Form',
            code: 'WHILE(i < 5, i := i + 1)',
            traditional: 'WHILE i < 5 DO i := i + 1'
        },
        {
            name: 'IF Statement - Functional Form',
            code: 'IF(x > 0, result := x, result := -x)',
            traditional: 'IF x > 0 THEN result := x ELSE result := -x'
        },
        {
            name: 'Nested Functional Controls',
            code: 'IF(n > 0, WHILE(i < n, sum := sum + i; i := i + 1), sum := 0)',
            traditional: 'IF n > 0 THEN (WHILE i < n DO (sum := sum + i; i := i + 1)) ELSE sum := 0'
        },
        {
            name: 'FOR Loop - Functional Form',
            code: 'FOR(i := 1, i <= 3, i := i + 1, total := total + i)',
            traditional: 'FOR i := 1; i <= 3; i := i + 1 DO total := total + i'
        }
    ];
    
    examples.forEach((example, index) => {
        console.log(`Example ${index + 1}: ${example.name}`);
        console.log('='.repeat(50));
        console.log(`Functional:   ${example.code}`);
        console.log(`Traditional:  ${example.traditional}`);
        console.log();
        
        try {
            // Parse the functional form
            const tokens = tokenize(example.code);
            console.log('Tokens:', tokens.slice(0, -1).map(t => 
                `${t.type}:${t.value}${t.kind ? `(${t.kind})` : ''}`
            ).join(', '));
            
            const ast = parse(tokens, systemLoader.createParserLookup());
            console.log('Original AST type:', ast[0]?.type);
            
            // Transform to control structures
            const transformed = transformer.transform(ast);
            console.log('Transformed to:', transformed[0]?.type);
            
            if (transformed[0]?.equivalent) {
                console.log('Equivalent syntax:', transformed[0].equivalent);
            }
            
            // Set up initial variables for execution
            executor.variables.clear();
            executor.setVariable('i', 1);
            executor.setVariable('x', 3);
            executor.setVariable('n', 3);
            executor.setVariable('sum', 0);
            executor.setVariable('total', 0);
            executor.setVariable('result', 0);
            
            // Execute the transformed control structure
            const results = executor.execute(transformed);
            console.log('Execution result:');
            results.forEach(result => {
                if (result.type === 'while_execution' || result.type === 'for_execution') {
                    console.log(`  ${result.iterations} iterations, ${result.terminated}`);
                    if (result.trace.length <= 3) {
                        result.trace.forEach(iter => {
                            console.log(`    Iteration ${iter.iteration}: ${JSON.stringify(iter.after)}`);
                        });
                    }
                } else if (result.type === 'if_execution') {
                    console.log(`  Took ${result.branch} branch (condition: ${result.condition})`);
                }
            });
            
            console.log('Final variables:', Object.fromEntries(executor.variables));
            
        } catch (error) {
            console.error('Error:', error.message);
        }
        
        console.log('\n' + '-'.repeat(60) + '\n');
    });
    
    // Demonstrate parser integration
    console.log('=== Parser Integration Test ===');
    
    const integrationTests = [
        'sum := 0; WHILE(i < 4, (sum := sum + i; i := i + 1))',
        'result := IF(x > 0, x^2, 0)',
        'factorial := FOR(i := 1, i <= n, i := i + 1, result := result * i)'
    ];
    
    integrationTests.forEach((code, index) => {
        console.log(`Integration ${index + 1}: ${code}`);
        
        try {
            const ast = parse(code, systemLoader.createParserLookup());
            console.log(`  Parsed ${ast.length} statements successfully`);
            
            const transformed = transformer.transform(ast);
            const controlStructures = transformed.filter(stmt => 
                ['WhileLoop', 'Conditional', 'ForLoop'].includes(stmt.type)
            );
            
            console.log(`  Found ${controlStructures.length} functional control structures`);
            
        } catch (error) {
            console.log(`  Parse error: ${error.message}`);
        }
        
        console.log();
    });
    
    return { systemLoader, transformer, executor };
}

// Browser integration helper
function createBrowserFunctionalDemo() {
    if (typeof window !== 'undefined') {
        window.RiXFunctionalControls = {
            systemLoader,
            
            // Enable functional control syntax
            enable() {
                console.log('Functional control syntax enabled!');
                console.log('Available: WHILE(cond, body), IF(cond, then, else), FOR(init, cond, incr, body)');
                return this;
            },
            
            // Parse and transform functional control code
            parseAndTransform(code) {
                try {
                    const transformer = new FunctionalControlTransformer();
                    const ast = parse(code, systemLoader.createParserLookup());
                    const transformed = transformer.transform(ast);
                    
                    return {
                        success: true,
                        original: ast,
                        transformed,
                        equivalents: transformed.map(stmt => stmt.equivalent).filter(Boolean)
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
            
            // Execute functional control code
            execute(code) {
                try {
                    const transformer = new FunctionalControlTransformer();
                    const executor = new FunctionalControlExecutor();
                    
                    const ast = parse(code, systemLoader.createParserLookup());
                    const transformed = transformer.transform(ast);
                    const results = executor.execute(transformed);
                    
                    return {
                        success: true,
                        results,
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
    demonstrateFunctionalControls();
}

// Set up browser integration
createBrowserFunctionalDemo();

export { 
    systemLoader as functionalSystemLoader,
    FunctionalControlTransformer,
    FunctionalControlExecutor,
    demonstrateFunctionalControls,
    createBrowserFunctionalDemo
};