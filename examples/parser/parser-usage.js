import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// Example system lookup with comprehensive RiX language support
function createSystemLookup() {
    const systemSymbols = {
        // Mathematical functions
        'SIN': { type: 'function', arity: 1, domain: 'real' },
        'COS': { type: 'function', arity: 1, domain: 'real' },
        'TAN': { type: 'function', arity: 1, domain: 'real' },
        'LOG': { type: 'function', arity: 1, domain: 'positive' },
        'EXP': { type: 'function', arity: 1, domain: 'real' },
        'SQRT': { type: 'function', arity: 1, domain: 'non-negative' },
        'ABS': { type: 'function', arity: 1, domain: 'real' },
        'FLOOR': { type: 'function', arity: 1, domain: 'real' },
        'CEIL': { type: 'function', arity: 1, domain: 'real' },
        'MAX': { type: 'function', arity: -1, domain: 'real' },
        'MIN': { type: 'function', arity: -1, domain: 'real' },
        
        // Constants
        'PI': { type: 'constant', value: Math.PI, description: 'π (pi)' },
        'E': { type: 'constant', value: Math.E, description: 'Euler\'s number' },
        'INFINITY': { type: 'constant', value: Infinity, description: 'Positive infinity' },
        'I': { type: 'constant', description: 'Imaginary unit √(-1)' },
        
        // Logical operators
        'AND': { type: 'operator', precedence: 40, associativity: 'left', operatorType: 'infix' },
        'OR': { type: 'operator', precedence: 30, associativity: 'left', operatorType: 'infix' },
        'NOT': { type: 'operator', precedence: 110, operatorType: 'prefix' },
        'XOR': { type: 'operator', precedence: 35, associativity: 'left', operatorType: 'infix' },
        
        // Set operations
        'IN': { type: 'operator', precedence: 60, associativity: 'left', operatorType: 'infix' },
        'UNION': { type: 'operator', precedence: 50, associativity: 'left', operatorType: 'infix' },
        'INTERSECT': { type: 'operator', precedence: 50, associativity: 'left', operatorType: 'infix' },
        'SUBSET': { type: 'operator', precedence: 60, associativity: 'left', operatorType: 'infix' },
        
        // Special functions
        'UNIT': { type: 'function', purpose: 'unit-conversion', arity: 1 },
        'HELP': { type: 'function', purpose: 'documentation', arity: -1 },
        'LOAD': { type: 'function', purpose: 'module-loading', arity: 1 },
        'SAVE': { type: 'function', purpose: 'persistence', arity: 2 },
        
        // Control structures  
        'IF': { type: 'control', structure: 'conditional' },
        'ELSE': { type: 'control', structure: 'conditional' },
        'WHILE': { type: 'control', structure: 'loop' },
        'FOR': { type: 'control', structure: 'loop' },
        
        // Special forms
        'SELF': { type: 'special', form: 'self-reference' },
        'PRIMARY': { type: 'special', form: 'primary-operation' }
    };
    
    return function(name) {
        return systemSymbols[name] || { type: 'identifier' };
    };
}

// Simple AST visitor for demonstration
class ASTVisitor {
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
    
    visitBinaryOperation(node) {
        const left = this.visit(node.left);
        const right = this.visit(node.right);
        return { type: 'binary', operator: node.operator, left, right };
    }
    
    visitUnaryOperation(node) {
        const operand = this.visit(node.operand);
        return { type: 'unary', operator: node.operator, operand };
    }
    
    visitFunctionCall(node) {
        const func = this.visit(node.function);
        const args = node.arguments.map(arg => this.visit(arg));
        return { type: 'call', function: func, arguments: args };
    }
    
    visitUserIdentifier(node) {
        return { type: 'user_var', name: node.name };
    }
    
    visitSystemIdentifier(node) {
        return { type: 'system_var', name: node.name, info: node.systemInfo };
    }
    
    visitNumber(node) {
        return { type: 'number', value: node.value };
    }
    
    visitString(node) {
        return { type: 'string', value: node.value, kind: node.kind };
    }
    
    visitArray(node) {
        const elements = node.elements.map(elem => this.visit(elem));
        return { type: 'array', elements };
    }
    
    visitSet(node) {
        const elements = node.elements.map(elem => this.visit(elem));
        return { type: 'set', elements };
    }
    
    visitGrouping(node) {
        return this.visit(node.expression);
    }
    
    visitGeneric(node) {
        return { type: 'unknown', nodeType: node.type };
    }
}

// Example usage function
function demonstrateParser() {
    const systemLookup = createSystemLookup();
    const visitor = new ASTVisitor();
    
    const examples = [
        // Basic arithmetic
        "2 + 3 * 4;",
        
        // Assignment
        "x := 42;",
        
        // Function calls
        "result := SIN(PI / 2) + COS(0);",
        
        // Equations
        "x^2 - 4 :=: 0;",
        
        // Pipe operations
        "data |> filter |> transform |> reduce;",
        
        // Arrays and sets
        "primes := {2, 3, 5, 7, 11};",
        
        // Complex expression
        "distance := SQRT((x2 - x1)^2 + (y2 - y1)^2);",
        
        // Multiple statements
        "a := 1; b := 2; c := a + b;"
    ];
    
    console.log('RiX Parser Usage Examples\n');
    console.log('='.repeat(50));
    
    examples.forEach((code, index) => {
        console.log(`\nExample ${index + 1}: ${code}`);
        console.log('-'.repeat(30));
        
        try {
            // Tokenize
            const tokens = tokenize(code);
            console.log('Tokens:', tokens.slice(0, -1).map(t => `${t.type}:${t.value}`).join(' '));
            
            // Parse
            const ast = parse(tokens, systemLookup);
            console.log('Statements:', ast.length);
            
            // Transform AST using visitor
            const transformed = ast.map(stmt => visitor.visit(stmt));
            console.log('Transformed AST:');
            console.log(JSON.stringify(transformed, null, 2));
            
        } catch (error) {
            console.error('Error:', error.message);
        }
    });
    
    return { systemLookup, visitor };
}

// Advanced integration example
function createRiXInterpreter() {
    const systemLookup = createSystemLookup();
    
    return {
        parse(code) {
            const tokens = tokenize(code);
            return parse(tokens, systemLookup);
        },
        
        analyze(ast) {
            // Example analysis: count different node types
            const counts = {};
            
            function countNodes(node) {
                counts[node.type] = (counts[node.type] || 0) + 1;
                
                // Recursively count child nodes
                Object.values(node).forEach(value => {
                    if (Array.isArray(value)) {
                        value.forEach(item => {
                            if (item && typeof item === 'object' && item.type) {
                                countNodes(item);
                            }
                        });
                    } else if (value && typeof value === 'object' && value.type) {
                        countNodes(value);
                    }
                });
            }
            
            ast.forEach(countNodes);
            return counts;
        },
        
        extractIdentifiers(ast) {
            const identifiers = { user: new Set(), system: new Set() };
            
            function extractFromNode(node) {
                if (node.type === 'UserIdentifier') {
                    identifiers.user.add(node.name);
                } else if (node.type === 'SystemIdentifier') {
                    identifiers.system.add(node.name);
                }
                
                // Recursively extract from child nodes
                Object.values(node).forEach(value => {
                    if (Array.isArray(value)) {
                        value.forEach(item => {
                            if (item && typeof item === 'object' && item.type) {
                                extractFromNode(item);
                            }
                        });
                    } else if (value && typeof value === 'object' && value.type) {
                        extractFromNode(value);
                    }
                });
            }
            
            ast.forEach(extractFromNode);
            
            return {
                user: Array.from(identifiers.user),
                system: Array.from(identifiers.system)
            };
        }
    };
}

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateParser();
    
    console.log('\n' + '='.repeat(50));
    console.log('\nAdvanced Integration Example:');
    
    const interpreter = createRiXInterpreter();
    const code = "result := SIN(PI * x) + COS(2 * PI * y);";
    
    console.log(`\nCode: ${code}`);
    const ast = interpreter.parse(code);
    const analysis = interpreter.analyze(ast);
    const identifiers = interpreter.extractIdentifiers(ast);
    
    console.log('Node type counts:', analysis);
    console.log('Identifiers found:', identifiers);
}

export { createSystemLookup, ASTVisitor, createRiXInterpreter };