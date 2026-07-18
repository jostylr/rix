import { test, expect, describe } from 'bun:test';
import { SystemLoader, createWebPageSystemLoader, createNodeSystemLoader } from '../../src/parser/system-loader.js';
import { parse, tokenize } from '../../src/parser/index.js';

describe('SystemLoader', () => {
    test('initializes with default core registry', () => {
        const systemLoader = new SystemLoader();
        const config = systemLoader.exportConfig();
        expect(config.core.length).toBeGreaterThan(0);
        expect(config.core.some(([name]) => name === 'TYPE')).toBe(true);
        expect(config.core.some(([name]) => name === 'HELP')).toBe(true);
    });

    test('initializes with default keywords', () => {
        const systemLoader = new SystemLoader();
        const config = systemLoader.exportConfig();
        expect(config.keywords.some(([name]) => name === 'AND')).toBe(true);
        expect(config.keywords.some(([name]) => name === 'OR')).toBe(true);
        expect(config.keywords.some(([name]) => name === 'NOT')).toBe(true);
    });

    test('lookup returns core symbols', () => {
        const systemLoader = new SystemLoader();
        const result = systemLoader.lookup('TYPE');
        expect(result.type).toBe('function');
        expect(result.category).toBe('meta');
    });

    test('lookup returns unknown for unregistered symbols', () => {
        const systemLoader = new SystemLoader();
        const result = systemLoader.lookup('UNKNOWN');
        expect(result.type).toBe('identifier');
        expect(result.source).toBe('unknown');
    });

    test('registerSystem adds new system symbol', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerSystem('CUSTOM_FUNC', {
            type: 'function',
            arity: 2,
            category: 'custom'
        });

        const result = systemLoader.lookup('CUSTOM_FUNC');
        expect(result.type).toBe('function');
        expect(result.arity).toBe(2);
        expect(result.category).toBe('custom');
        expect(result.source).toBe('system');
    });

    test('registerKeyword adds configurable keyword', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerKeyword('BETWEEN', {
            type: 'operator',
            precedence: 60,
            associativity: 'left',
            operatorType: 'ternary',
            category: 'comparison'
        });

        const result = systemLoader.lookup('BETWEEN');
        expect(result.type).toBe('operator');
        expect(result.precedence).toBe(60);
        expect(result.operatorType).toBe('ternary');
    });

    test('registerOperator adds custom operator', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerOperator('<<', {
            type: 'operator',
            precedence: 70,
            associativity: 'left',
            operatorType: 'infix'
        });

        const config = systemLoader.exportConfig();
        expect(config.operators.some(([symbol]) => symbol === '<<')).toBe(true);
    });

    test('validates definition structure', () => {
        const systemLoader = new SystemLoader();
        expect(() => {
            systemLoader.registerSystem('BAD', {});
        }).toThrow('Definition must have a type property');

        expect(() => {
            systemLoader.registerSystem('BAD_OP', {
                type: 'operator'
            });
        }).toThrow('Operator definition must have numeric precedence');
    });

    test('strict mode prevents core symbol override', () => {
        const strictLoader = new SystemLoader({ strictMode: true });
        
        expect(() => {
            strictLoader.registerSystem('TYPE', {
                type: 'function',
                arity: 1
            });
        }).toThrow('Cannot override core system symbol: TYPE');
    });

    test('registerHook and triggerHook work correctly', () => {
        const systemLoader = new SystemLoader();
        let hookCalled = false;
        let hookData = null;

        systemLoader.registerHook('test-event', (data) => {
            hookCalled = true;
            hookData = data;
        });

        systemLoader.triggerHook('test-event', { test: 'data' });

        expect(hookCalled).toBe(true);
        expect(hookData).toEqual({ test: 'data' });
    });

    test('system registration triggers hooks', () => {
        const systemLoader = new SystemLoader();
        let registeredSymbol = null;

        systemLoader.registerHook('system-registered', (data) => {
            registeredSymbol = data.name;
        });

        systemLoader.registerSystem('HOOK_TEST', {
            type: 'function',
            arity: 1
        });

        expect(registeredSymbol).toBe('HOOK_TEST');
    });

    test('createParserLookup returns function compatible with parser', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerKeyword('TEST_OP', {
            type: 'operator',
            precedence: 50,
            associativity: 'left',
            operatorType: 'infix'
        });

        const parserLookup = systemLoader.createParserLookup();
        expect(typeof parserLookup).toBe('function');

        const result = parserLookup('TEST_OP');
        expect(result.type).toBe('operator');
        expect(result.precedence).toBe(50);
    });

    test('integrates with parser for custom keywords', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerKeyword('CUSTOM', {
            type: 'operator',
            precedence: 40,
            associativity: 'left',
            operatorType: 'infix'
        });

        const code = 'x CUSTOM y';
        const tokens = tokenize(code);
        
        // Find system identifier token
        const systemToken = tokens.find(t => t.type === 'Identifier' && t.kind === 'System');
        expect(systemToken).toBeDefined();
        expect(systemToken.value).toBe('CUSTOM');

        // Parse with system lookup
        const ast = parse(tokens, systemLoader.createParserLookup());
        expect(ast).toBeDefined();
    });

    test('exportConfig returns complete configuration', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerSystem('EXPORT_TEST', {
            type: 'function',
            arity: 1
        });

        const config = systemLoader.exportConfig();
        
        expect(config).toHaveProperty('core');
        expect(config).toHaveProperty('system');
        expect(config).toHaveProperty('keywords');
        expect(config).toHaveProperty('operators');
        expect(config).toHaveProperty('config');

        expect(config.system.some(([name]) => name === 'EXPORT_TEST')).toBe(true);
    });

    test('importConfig loads configuration', () => {
        const systemLoader = new SystemLoader();
        const config = {
            system: [['IMPORTED_FUNC', { type: 'function', arity: 2 }]],
            keywords: [['IMPORTED_OP', { type: 'operator',  precedence: 50 }]]
        };

        systemLoader.importConfig(config);

        expect(systemLoader.lookup('IMPORTED_FUNC').type).toBe('function');
        expect(systemLoader.lookup('IMPORTED_OP').type).toBe('operator');
    });

    test('getSymbolsByCategory filters correctly', () => {
        const systemLoader = new SystemLoader();
        systemLoader.registerSystem('META_FUNC', {
            type: 'function',
            category: 'meta'
        });

        const metaSymbols = systemLoader.getSymbolsByCategory('meta');
        expect(metaSymbols.some(sym => sym.name === 'TYPE')).toBe(true);
        expect(metaSymbols.some(sym => sym.name === 'META_FUNC')).toBe(true);
    });
});

describe('Factory functions', () => {
    test('createWebPageSystemLoader creates browser-optimized loader', () => {
        const loader = createWebPageSystemLoader();
        expect(loader).toBeInstanceOf(SystemLoader);
        expect(loader.config.strictMode).toBe(false);
        expect(loader.config.allowUserOverrides).toBe(false);
    });

    test('createNodeSystemLoader creates Node.js-optimized loader', () => {
        const loader = createNodeSystemLoader();
        expect(loader).toBeInstanceOf(SystemLoader);
        expect(loader.config.browserIntegration).toBe(false);
        expect(loader.config.strictMode).toBe(true);
    });
});

describe('Real-world usage scenarios', () => {
    test('Scenario 1: Adding logical operators for end users', () => {
        const systemLoader = new SystemLoader();
        // System tinkerer adds logical operators
        systemLoader.registerKeyword('AND', {
            type: 'operator',
            precedence: 40,
            associativity: 'left',
            operatorType: 'infix'
        });
        
        systemLoader.registerKeyword('OR', {
            type: 'operator',
            precedence: 30,
            associativity: 'left',
            operatorType: 'infix'
        });

        // User writes RiX code - simpler expression to test logical operators
        const code = 'x AND y';
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLoader.createParserLookup());

        expect(ast).toBeDefined();
        expect(ast.length).toBe(1);
        // The result should be a binary operation using the AND operator
        expect(ast[0].type).toBe('BinaryOperation');
        
        // Test assignment case separately - assignments are also BinaryOperations with := operator
        const assignCode = 'result := x AND y';
        const assignAst = parse(assignCode, systemLoader.createParserLookup());
        expect(assignAst[0].type).toBe('BinaryOperation');
        expect(assignAst[0].operator).toBe(':=');
    });

    test('Scenario 2: Adding control flow keywords', () => {
        const systemLoader = new SystemLoader();
        // System tinkerer adds control flow
        systemLoader.registerKeyword('IF', {
            type: 'control',
            structure: 'conditional',
            precedence: 5
        });

        systemLoader.registerKeyword('THEN', {
            type: 'control',
            structure: 'conditional',
            precedence: 4
        });

        systemLoader.registerKeyword('ELSE', {
            type: 'control',
            structure: 'conditional',
            precedence: 4
        });

        // Verify keywords are registered - control keywords return 'function' type due to functional form
        expect(systemLoader.lookup('IF').type).toBe('function');
        expect(systemLoader.lookup('THEN').type).toBe('function');
        expect(systemLoader.lookup('ELSE').type).toBe('function');
        
        // But they should have the functional form properties
        expect(systemLoader.lookup('IF').functionalForm).toBe(true);
        expect(systemLoader.lookup('IF').controlType).toBe('control');

        // User can now use these keywords (parsing will recognize them)
        const code = 'If x Then y Else z';
        const tokens = tokenize(code);
        
        const systemTokens = tokens.filter(t => 
            t.type === 'Identifier' && t.kind === 'System'
        );
        expect(systemTokens.length).toBe(3);
        expect(systemTokens.map(t => t.value)).toEqual(['IF', 'THEN', 'ELSE']);
    });

    test('Scenario 3: Custom mathematical functions', () => {
        const systemLoader = new SystemLoader();
        // System tinkerer adds custom math functions
        systemLoader.registerSystem('FACTORIAL', {
            type: 'function',
            arity: 1,
            category: 'mathematical'
        });

        systemLoader.registerSystem('GCD', {
            type: 'function',
            arity: 2,
            category: 'mathematical'
        });

        // User uses these functions
        const code = 'result := FACTORIAL(5) + GCD(12, 8)';
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLoader.createParserLookup());

        expect(ast).toBeDefined();
        
        // Verify function calls are recognized
        const systemCalls = [];
        function findSystemCalls(node) {
            if (node.type === 'FunctionCall' && node.function.type === 'SystemIdentifier') {
                systemCalls.push(node.function.name);
            }
            Object.values(node).forEach(value => {
                if (Array.isArray(value)) {
                    value.forEach(item => {
                        if (item && typeof item === 'object' && item.type) {
                            findSystemCalls(item);
                        }
                    });
                } else if (value && typeof value === 'object' && value.type) {
                    findSystemCalls(value);
                }
            });
        }

        ast.forEach(findSystemCalls);
        expect(systemCalls).toContain('FACTORIAL');
        expect(systemCalls).toContain('GCD');
    });
});
