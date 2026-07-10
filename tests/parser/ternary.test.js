import { describe, it, expect } from 'bun:test';
import { parse } from '../../src/parser/index.js';

describe('Ternary Operator (??:)', () => {
    it('should parse basic ternary operation', () => {
        const result = parse('x > 0 ?? x ?: -x');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('>');
        expect(ast.trueExpression.type).toBe('UserIdentifier');
        expect(ast.trueExpression.name).toBe('x');
        expect(ast.falseExpression.type).toBe('UnaryOperation');
        expect(ast.falseExpression.operator).toBe('-');
    });

    it('should parse ternary with complex expressions', () => {
        const result = parse('a + b ?? c * d ?: e / f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('+');
        expect(ast.trueExpression.type).toBe('BinaryOperation');
        expect(ast.trueExpression.operator).toBe('*');
        expect(ast.falseExpression.type).toBe('BinaryOperation');
        expect(ast.falseExpression.operator).toBe('/');
    });

    it('should parse ternary with function calls', () => {
        const result = parse('x > 0 ?? SIN(x) ?: COS(x)');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('FunctionCall');
        expect(ast.trueExpression.function.name).toBe('SIN');
        expect(ast.falseExpression.type).toBe('FunctionCall');
        expect(ast.falseExpression.function.name).toBe('COS');
    });

    it('should parse ternary with intervals without conflict', () => {
        const result = parse('safe ?? 1:5 ?: -5:-1');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.name).toBe('safe');
        // Intervals should be parsed as numbers or binary operations
        expect(['Number', 'BinaryOperation']).toContain(ast.trueExpression.type);
        expect(['Number', 'BinaryOperation']).toContain(ast.falseExpression.type);
    });

    it('should parse nested ternary with parentheses', () => {
        const result = parse('a ?? (b ?? c ?: d) ?: e');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.name).toBe('a');
        expect(ast.trueExpression.type).toBe('Grouping');
        expect(ast.trueExpression.expression.type).toBe('TernaryOperation');
        expect(ast.falseExpression.name).toBe('e');
    });

    it('should parse ternary with string literals', () => {
        const result = parse('temp < 0 ?? "frozen" ?: "normal"');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('String');
        expect(ast.trueExpression.value).toBe('frozen');
        expect(ast.falseExpression.type).toBe('String');
        expect(ast.falseExpression.value).toBe('normal');
    });

    it('should parse ternary with array literals', () => {
        const result = parse('flag ?? [1,2,3] ?: [4,5,6]');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('Array');
        expect(ast.trueExpression.elements.length).toBe(3);
        expect(ast.falseExpression.type).toBe('Array');
        expect(ast.falseExpression.elements.length).toBe(3);
    });

    it('should parse ternary with matrix literals', () => {
        const result = parse('det > 0 ?? [[1,0],[0,1]] ?: [[0,1],[1,0]]');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('Array');
        expect(ast.falseExpression.type).toBe('Array');
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
        const result = parse('result := x > 0 ?? x ?: -x');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.operator).toBe(':=');
        expect(ast.right.type).toBe('TernaryOperation');
    });

    it('should parse ternary in pipe operations', () => {
        const result = parse('data |> (valid ?? process ?: sanitize)');
        const ast = result[0];

        expect(ast.type).toBe('Pipe');
        expect(ast.right.type).toBe('Grouping');
        expect(ast.right.expression.type).toBe('TernaryOperation');
    });

    it('should handle ternary with unary operators', () => {
        const result = parse('x ?? +y ?: -z');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.trueExpression.type).toBe('UnaryOperation');
        expect(ast.trueExpression.operator).toBe('+');
        expect(ast.falseExpression.type).toBe('UnaryOperation');
        expect(ast.falseExpression.operator).toBe('-');
    });

    it('should parse ternary with comparison chains', () => {
        const result = parse('a > b ?? c < d ?: e >= f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.operator).toBe('>');
        expect(ast.trueExpression.operator).toBe('<');
        expect(ast.falseExpression.operator).toBe('>=');
    });


    it('should require ?: after ?? expression', () => {
        expect(() => parse('x ?? y')).toThrow(/Expected "\?:"/);
    });

    it('should require expression after ??', () => {
        expect(() => parse('x ?? ?: y')).toThrow();
    });

    it('should require expression after ?:', () => {
        expect(() => parse('x ?? y ?:')).toThrow();
    });

    it('should handle precedence correctly with arithmetic', () => {
        const result = parse('a + b ?? c * d ?: e / f');
        const ast = result[0];

        // The ternary should have lower precedence than arithmetic
        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.type).toBe('BinaryOperation');
        expect(ast.condition.operator).toBe('+');
    });

    it('should handle precedence correctly with comparison', () => {
        const result = parse('a < b ?? c > d ?: e == f');
        const ast = result[0];

        expect(ast.type).toBe('TernaryOperation');
        expect(ast.condition.operator).toBe('<');
        expect(ast.trueExpression.operator).toBe('>');
        expect(ast.falseExpression.operator).toBe('==');
    });

    it('should parse ternary with code block in true branch', () => {
        const result = parse('result := x > 0 ?? {; a := SIN(5); a + b } ?: 7');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.operator).toBe(':=');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(2);
        expect(ast.right.falseExpression.type).toBe('Number');
    });

    it('should parse ternary with code blocks in both branches', () => {
        const result = parse('value := flag ?? {; x := 10; y := 20; x * y } ?: {; z := -5; z^2 }');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(3);
        expect(ast.right.falseExpression.type).toBe('BlockContainer');
        expect(ast.right.falseExpression.elements.length).toBe(2);
    });

    it('should parse nested ternary inside code block', () => {
        const result = parse('complex := x > 0 ?? {; temp := SIN(x); temp > 0.5 ?? temp^2 ?: temp/2 } ?: 0');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(2);
        expect(ast.right.trueExpression.elements[1].type).toBe('TernaryOperation');
    });

    it('should parse code block with mathematical computations', () => {
        const result = parse('physics := energy > threshold ?? {; v := SQRT(2 * energy / mass); momentum := mass * v; momentum } ?: 0');
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
        const result = parse('arrayResult := flag ?? {; a := [1,2,3]; b := [4,5,6]; a + b } ?: [0,0,0]');
        const ast = result[0];

        expect(ast.type).toBe('BinaryOperation');
        expect(ast.right.type).toBe('TernaryOperation');
        expect(ast.right.trueExpression.type).toBe('BlockContainer');
        expect(ast.right.trueExpression.elements.length).toBe(3);
        expect(ast.right.falseExpression.type).toBe('Array');
    });
});
