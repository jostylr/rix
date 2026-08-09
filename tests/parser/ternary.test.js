import { describe, it, expect } from 'bun:test';
import { parse } from '../../src/parser/index.js';

describe('Decision conditional (?: ?_ ??)', () => {
    it('should parse basic ternary operation', () => {
        const result = parse('x > 0 ?: x ?_ -x');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('>');
        expect(ast.trueExpression.type).toBe('UserIdentifier');
        expect(ast.trueExpression.name).toBe('x');
        expect(ast.nullExpression.type).toBe('UnaryOperation');
        expect(ast.nullExpression.operator).toBe('-');
    });

    it('should parse ternary with complex expressions', () => {
        const result = parse('a + b ?: c * d ?_ e / f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('+');
        expect(ast.trueExpression.type).toBe('BinaryOperation');
        expect(ast.trueExpression.operator).toBe('*');
        expect(ast.nullExpression.type).toBe('BinaryOperation');
        expect(ast.nullExpression.operator).toBe('/');
    });

    it('should parse ternary with function calls', () => {
        const result = parse('x > 0 ?: SIN(x) ?_ COS(x)');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('FunctionCall');
        expect(ast.trueExpression.function.name).toBe('SIN');
        expect(ast.nullExpression.type).toBe('FunctionCall');
        expect(ast.nullExpression.function.name).toBe('COS');
    });

    it('should parse ternary with intervals without conflict', () => {
        const result = parse('safe ?: 1:5 ?_ -5:-1');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.name).toBe('safe');
        // Intervals should be parsed as numbers or binary operations
        expect(['Number', 'BinaryOperation']).toContain(ast.trueExpression.type);
        expect(['Number', 'BinaryOperation']).toContain(ast.nullExpression.type);
    });

    it('should parse nested ternary with parentheses', () => {
        const result = parse('a ?: (b ?: c ?_ d) ?_ e');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.name).toBe('a');
        expect(ast.trueExpression.type).toBe('Grouping');
        expect(ast.trueExpression.expression.type).toBe('TernaryOperation');
        expect(ast.nullExpression.name).toBe('e');
    });

    it('associates an unparenthesized branch conditional to the right', () => {
        const ast = parse('a ?: b ?_ c ?: d ?_ e')[0];
        expect(ast.type).toBe('TernaryOperation');
        expect(ast.nullExpression.type).toBe('TernaryOperation');
        expect(ast.nullExpression.condition.name).toBe('c');
        expect(ast.nullExpression.nullExpression.name).toBe('e');
    });

    it('should parse ternary with string literals', () => {
        const result = parse('temp < 0 ?: "frozen" ?_ "normal"');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('String');
        expect(ast.trueExpression.value).toBe('frozen');
        expect(ast.nullExpression.type).toBe('String');
        expect(ast.nullExpression.value).toBe('normal');
    });

    it('should parse ternary with array literals', () => {
        const result = parse('flag ?: [1,2,3] ?_ [4,5,6]');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('Array');
        expect(ast.trueExpression.elements.length).toBe(3);
        expect(ast.nullExpression.type).toBe('Array');
        expect(ast.nullExpression.elements.length).toBe(3);
    });

    it('should parse ternary with matrix literals', () => {
        const result = parse('det > 0 ?: [[1,0],[0,1]] ?_ [[0,1],[1,0]]');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('Array');
        expect(ast.nullExpression.type).toBe('Array');
    });

    it('should not conflict with existing ? operator', () => {
        const result = parse('x?(y)');
        const ast = result[0];

        expect(ast.type).toBe('Ask');
        expect(ast.target.name).toBe('x');
    });

    it('should not conflict with existing : operator for intervals', () => {
        const result = parse('1:5');
        const ast = result[0];

        // Should be parsed as either an interval number or binary operation
        expect(['Number', 'BinaryOperation']).toContain(ast.type);
    });

    it('should parse ternary in assignment context', () => {
        const result = parse('result := x > 0 ?: x ?_ -x');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.operator).toBe(':=');
        expect(ast.right.type).toBe('TernaryOperation');
    });

    it('should parse ternary in pipe operations', () => {
        const result = parse('data |> (valid ?: process ?_ sanitize)');
        const ast = result[0];

        expect(ast.type).toBe('Pipe');
        expect(ast.right.type).toBe('Grouping');
        expect(ast.right.expression.type).toBe('TernaryOperation');
    });

    it('should handle ternary with unary operators', () => {
        const result = parse('x ?: +y ?_ -z');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('UnaryOperation');
        expect(ast.trueExpression.operator).toBe('+');
        expect(ast.nullExpression.type).toBe('UnaryOperation');
        expect(ast.nullExpression.operator).toBe('-');
    });

    it('should parse ternary with comparison chains', () => {
        const result = parse('a > b ?: c < d ?_ e >= f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.operator).toBe('>');
        expect(ast.trueExpression.operator).toBe('<');
        expect(ast.nullExpression.operator).toBe('>=');
    });


    it('allows a truth-only conditional', () => {
        const ast = parse('x ?: y')[0];
        expect(ast.trueExpression.name).toBe('y');
        expect(ast.nullExpression).toBeNull();
        expect(ast.undecidedExpression).toBeNull();
    });

    it('should require an expression after the truth marker', () => {
        expect(() => parse('x ?: ?_ y')).toThrow();
    });

    it('should require an expression after a branch marker', () => {
        expect(() => parse('x ?: y ?_')).toThrow();
    });

    it('parses null and undecided branches in either order', () => {
        const first = parse('x ?: 1 ?_ 2 ?? 3')[0];
        expect(first.nullExpression.value).toBe('2');
        expect(first.undecidedExpression.value).toBe('3');
        const second = parse('x ?: 1 ?? 3 ?_ 2')[0];
        expect(second.nullExpression.value).toBe('2');
        expect(second.undecidedExpression.value).toBe('3');
    });

    it('rejects duplicate decision branches', () => {
        expect(() => parse('x ?: 1 ?_ 2 ?_ 3')).toThrow(/Duplicate/);
        expect(() => parse('x ?: 1 ?? 2 ?? 3')).toThrow(/Duplicate/);
    });

    it('should handle precedence correctly with arithmetic', () => {
        const result = parse('a + b ?: c * d ?_ e / f');
        const ast = result[0];

        // The ternary should have lower precedence than arithmetic
        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('+');
    });

    it('should handle precedence correctly with comparison', () => {
        const result = parse('a < b ?: c > d ?_ e == f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.operator).toBe('<');
        expect(ast.trueExpression.operator).toBe('>');
        expect(ast.nullExpression.operator).toBe('==');
    });

    it('should parse ternary with code block in true branch', () => {
        const result = parse('result := x > 0 ?: {; a := SIN(5); a + b } ?_ 7');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.operator).toBe(':=');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(2);
        expect(ast.right.nullExpression.type).toBe('Number');
    });

    it('should parse ternary with code blocks in both branches', () => {
        const result = parse('value := flag ?: {; x := 10; y := 20; x * y } ?_ {; z := -5; z^2 }');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(3);
        expect(ast.right.nullExpression.type).toBe('BlockContainer');
        expect(ast.right.nullExpression.elements.length).toBe(2);
    });

    it('should parse nested ternary inside code block', () => {
        const result = parse('complex := x > 0 ?: {; temp := SIN(x); temp > 0.5 ?: temp^2 ?_ temp/2 } ?_ 0');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(2);
        expect(ast.right.trueExpression.elements[1].type).toBe('TernaryOperation');
    });

    it('should parse code block with mathematical computations', () => {
        const result = parse('physics := energy > threshold ?: {; v := SQRT(2 * energy / mass); momentum := mass * v; momentum } ?_ 0');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(3);

        // Check the mathematical expressions in the code block
        const elements = ast.right.trueExpression.elements;
        expect(elements[0].type).toBe('BinaryOperation'); // v := ...
        expect(elements[1].type).toBe('BinaryOperation'); // momentum := ...
        expect(elements[2].type).toBe('UserIdentifier'); // momentum
    });

    it('should parse code block with array operations', () => {
        const result = parse('arrayResult := flag ?: {; a := [1,2,3]; b := [4,5,6]; a + b } ?_ [0,0,0]');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(3);
        expect(ast.right.nullExpression.type).toBe('Array');
    });
});
