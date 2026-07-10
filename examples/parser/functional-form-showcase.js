/**
 * Functional Control Forms Showcase
 * Demonstrates WHILE(cond, body) ≡ WHILE cond DO body syntax
 */

import { parse, tokenize } from '../index.js';
import { SystemLoader } from ../../src/parser/system-loader.js';

// Set up system loader with functional controls
const systemLoader = new SystemLoader();

// Register all control keywords with functional form support
const controlKeywords = {
    'WHILE': { structure: 'loop', arity: 2 },
    'IF': { structure: 'conditional', arity: -1 },
    'FOR': { structure: 'loop', arity: 4 },
    'REPEAT': { structure: 'loop', arity: 2 },
    'WHEN': { structure: 'conditional', arity: 2 },
    'UNLESS': { structure: 'conditional', arity: 2 }
};

Object.entries(controlKeywords).forEach(([keyword, config]) => {
    systemLoader.registerKeyword(keyword, {
        type: 'control',
        structure: config.structure,
        precedence: 5,
        category: 'control',
        functionalForm: true,
        arity: config.arity
    });
});

// Transformation engine
class FunctionalFormEngine {
    constructor(systemLoader) {
        this.systemLoader = systemLoader;
    }
    
    // Convert functional form to traditional syntax
    functionalToTraditional(code) {
        try {
            const tokens = tokenize(code);
            const ast = parse(tokens, this.systemLoader.createParserLookup());
            return this.astToTraditional(ast);
        } catch (error) {
            return `Error: ${error.message}`;
        }
    }
    
    astToTraditional(ast) {
        return ast.map(stmt => this.nodeToTraditional(stmt)).join('; ');
    }
    
    nodeToTraditional(node) {
        if (!node) return '';
        
        // Handle Statement wrappers
        if (node.type === 'Statement') {
            return this.nodeToTraditional(node.expression);
        }
        
        // Handle function calls that are actually control structures
        if (node.type === 'FunctionCall' && node.function?.type === 'SystemIdentifier') {
            const funcName = node.function.name;
            const lookup = this.systemLoader.lookup(funcName);
            
            if (lookup.functionalForm && lookup.controlType === 'control') {
                return this.transformControl(funcName, node.arguments.positional);
            }
        }
        
        // Handle binary operations
        if (node.type === 'BinaryOperation') {
            const left = this.nodeToTraditional(node.left);
            const right = this.nodeToTraditional(node.right);
            return `${left} ${node.operator} ${right}`;
        }
        
        // Handle identifiers and literals
        if (node.type === 'UserIdentifier' || node.type === 'SystemIdentifier') {
            return node.name;
        }
        
        if (node.type === 'Number') {
            return node.value;
        }
        
        // Handle grouping
        if (node.type === 'Grouping') {
            return `(${this.nodeToTraditional(node.expression)})`;
        }
        
        return `[${node.type}]`;
    }
    
    transformControl(keyword, args) {
        switch (keyword) {
            case 'WHILE':
                return `WHILE ${this.nodeToTraditional(args[0])} DO ${this.nodeToTraditional(args[1])}`;
            case 'IF':
                if (args.length >= 3) {
                    return `IF ${this.nodeToTraditional(args[0])} THEN ${this.nodeToTraditional(args[1])} ELSE ${this.nodeToTraditional(args[2])}`;
                } else {
                    return `IF ${this.nodeToTraditional(args[0])} THEN ${this.nodeToTraditional(args[1])}`;
                }
            case 'FOR':
                return `FOR ${this.nodeToTraditional(args[0])}; ${this.nodeToTraditional(args[1])}; ${this.nodeToTraditional(args[2])} DO ${this.nodeToTraditional(args[3])}`;
            case 'REPEAT':
                return `REPEAT ${this.nodeToTraditional(args[1])} UNTIL ${this.nodeToTraditional(args[0])}`;
            case 'WHEN':
                return `WHEN ${this.nodeToTraditional(args[0])} DO ${this.nodeToTraditional(args[1])}`;
            case 'UNLESS':
                return `UNLESS ${this.nodeToTraditional(args[0])} DO ${this.nodeToTraditional(args[1])}`;
            default:
                return `${keyword}(${args.map(arg => this.nodeToTraditional(arg)).join(', ')})`;
        }
    }
}

// Demo function
function demonstrateFunctionalForms() {
    console.log('🎯 RiX Functional Control Forms Showcase');
    console.log('==========================================\n');
    
    const engine = new FunctionalFormEngine(systemLoader);
    
    const examples = [
        {
            category: 'Basic Loops',
            cases: [
                {
                    functional: 'WHILE(i < 10, i := i + 1)',
                    description: 'Simple counter loop'
                },
                {
                    functional: 'FOR(i := 1, i <= n, i := i + 1, sum := sum + i)',
                    description: 'Classic for loop'
                },
                {
                    functional: 'REPEAT(x := x / 2, x > 1)',
                    description: 'Post-condition loop'
                }
            ]
        },
        {
            category: 'Conditionals',
            cases: [
                {
                    functional: 'IF(x > 0, result := x)',
                    description: 'Simple if statement'
                },
                {
                    functional: 'IF(x > 0, result := x, result := -x)',
                    description: 'If-else statement'
                },
                {
                    functional: 'WHEN(ready, process())',
                    description: 'Conditional execution'
                },
                {
                    functional: 'UNLESS(error, continue())',
                    description: 'Negative conditional'
                }
            ]
        },
        {
            category: 'Nested Controls',
            cases: [
                {
                    functional: 'IF(n > 0, WHILE(i < n, i := i + 1))',
                    description: 'If containing while'
                },
                {
                    functional: 'WHILE(running, IF(ready, process(), wait()))',
                    description: 'While containing if-else'
                },
                {
                    functional: 'FOR(i := 1, i <= 3, i := i + 1, FOR(j := 1, j <= 3, j := j + 1, total := total + i * j))',
                    description: 'Nested for loops'
                }
            ]
        },
        {
            category: 'Complex Expressions',
            cases: [
                {
                    functional: 'result := WHILE(x > epsilon, x := SQRT(x))',
                    description: 'Loop as expression'
                },
                {
                    functional: 'value := IF(x >= 0, SQRT(x), 0)',
                    description: 'Conditional as expression'
                },
                {
                    functional: 'matrix[i][j] := IF(i == j, 1, IF(ABS(i - j) == 1, -1, 0))',
                    description: 'Nested conditionals in assignment'
                }
            ]
        },
        {
            category: 'Functional Composition',
            cases: [
                {
                    functional: 'pipe := data |> filter |> IF(valid, transform, identity) |> collect',
                    description: 'Control in pipeline'
                },
                {
                    functional: 'factorial := FOR(i := 1, i <= n, i := i + 1, result := result * i)',
                    description: 'Functional factorial'
                },
                {
                    functional: 'fibonacci := WHILE(a + b < limit, (temp := a + b; a := b; b := temp))',
                    description: 'Functional fibonacci'
                }
            ]
        }
    ];
    
    examples.forEach(({ category, cases }) => {
        console.log(`📁 ${category}`);
        console.log('─'.repeat(category.length + 4));
        
        cases.forEach(({ functional, description }, index) => {
            console.log(`\n${index + 1}. ${description}`);
            console.log(`   Functional:   ${functional}`);
            
            try {
                const traditional = engine.functionalToTraditional(functional);
                console.log(`   Traditional:  ${traditional}`);
                
                // Parse both forms to verify equivalence
                const functionalAst = parse(functional, systemLoader.createParserLookup());
                const functionalCalls = countFunctionalCalls(functionalAst);
                
                console.log(`   Analysis:     ${functionalCalls} functional control${functionalCalls !== 1 ? 's' : ''} detected`);
                
            } catch (error) {
                console.log(`   Error:        ${error.message}`);
            }
        });
        
        console.log('\n');
    });
    
    // Demonstrate parsing equivalence
    console.log('🔍 Parsing Analysis');
    console.log('===================\n');
    
    const comparisonCases = [
        {
            functional: 'WHILE(i < 5, sum := sum + i)',
            traditional: 'WHILE i < 5 DO sum := sum + i'
        },
        {
            functional: 'IF(x > 0, y, z)',
            traditional: 'IF x > 0 THEN y ELSE z'
        }
    ];
    
    comparisonCases.forEach(({ functional, traditional }, index) => {
        console.log(`Comparison ${index + 1}:`);
        console.log(`  Functional:   ${functional}`);
        console.log(`  Traditional:  ${traditional}`);
        
        try {
            const functionalTokens = tokenize(functional);
            const traditionalTokens = tokenize(traditional);
            
            console.log(`  Functional tokens:   ${functionalTokens.slice(0, -1).length}`);
            console.log(`  Traditional tokens:  ${traditionalTokens.slice(0, -1).length}`);
            
            const functionalAst = parse(functional, systemLoader.createParserLookup());
            const traditionalAst = parse(traditional, systemLoader.createParserLookup());
            
            console.log(`  Both parse successfully: ✓`);
            console.log(`  Functional form detected: ${isFunctionalForm(functionalAst) ? '✓' : '✗'}`);
            
        } catch (error) {
            console.log(`  Parse error: ${error.message}`);
        }
        
        console.log();
    });
    
    // Performance comparison
    console.log('⚡ Performance Characteristics');
    console.log('===============================\n');
    
    const performanceTests = [
        'WHILE(i < 1000, i := i + 1)',
        'IF(complex_condition, expensive_operation(), default_value)',
        'FOR(i := 1, i <= 100, i := i + 1, matrix[i] := compute(i))'
    ];
    
    performanceTests.forEach((code, index) => {
        console.log(`Test ${index + 1}: ${code}`);
        
        const start = performance.now();
        try {
            const tokens = tokenize(code);
            const ast = parse(tokens, systemLoader.createParserLookup());
            const end = performance.now();
            
            console.log(`  Parse time: ${(end - start).toFixed(3)}ms`);
            console.log(`  Tokens: ${tokens.slice(0, -1).length}`);
            console.log(`  AST nodes: ${countNodes(ast)}`);
            
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
        console.log();
    });
    
    return { systemLoader, engine };
}

// Helper methods
function countFunctionalCalls(ast) {
    let count = 0;
    
    function traverse(node) {
        if (!node || typeof node !== 'object') return;
        
        if (node.type === 'FunctionCall' && 
            node.function?.type === 'SystemIdentifier') {
            const lookup = systemLoader.lookup(node.function.name);
            if (lookup.functionalForm) count++;
        }
        
        Object.values(node).forEach(value => {
            if (Array.isArray(value)) {
                value.forEach(traverse);
            } else if (value && typeof value === 'object') {
                traverse(value);
            }
        });
    }
    
    ast.forEach(traverse);
    return count;
}

function isFunctionalForm(ast) {
    return countFunctionalCalls(ast) > 0;
}

function countNodes(ast) {
    let count = 0;
    
    function traverse(node) {
        if (!node || typeof node !== 'object') return;
        count++;
        
        Object.values(node).forEach(value => {
            if (Array.isArray(value)) {
                value.forEach(traverse);
            } else if (value && typeof value === 'object') {
                traverse(value);
            }
        });
    }
    
    ast.forEach(traverse);
    return count;
}

// Browser integration
if (typeof window !== 'undefined') {
    window.RiXFunctionalShowcase = {
        systemLoader,
        engine: new FunctionalFormEngine(systemLoader),
        
        // Convert functional form to traditional
        convert(code) {
            const engine = new FunctionalFormEngine(systemLoader);
            return engine.functionalToTraditional(code);
        },
        
        // Analyze functional forms in code
        analyze(code) {
            try {
                const tokens = tokenize(code);
                const ast = parse(tokens, systemLoader.createParserLookup());
                
                return {
                    success: true,
                    tokens: tokens.slice(0, -1).length,
                    functionalCalls: countFunctionalCalls(ast),
                    totalNodes: countNodes(ast),
                    hasFunctionalForm: isFunctionalForm(ast)
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        
        // Demo all examples
        demo: demonstrateFunctionalForms
    };
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateFunctionalForms();
}

export { 
    systemLoader as functionalSystemLoader,
    FunctionalFormEngine,
    demonstrateFunctionalForms,
    countFunctionalCalls,
    isFunctionalForm,
    countNodes
};