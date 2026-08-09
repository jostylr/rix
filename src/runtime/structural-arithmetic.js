import {
    CertifiedApproximation,
    Fraction,
    Integer,
    Rational,
    RationalInterval,
    parseNumber,
} from "@ratmath/core";
import { scanNumberLiteral, tokenize } from "../parser/tokenizer.js";

const DEFAULT_BINARY = {
    ":": { precedence: 70, associativity: "left", head: "Interval" },
    "+": { precedence: 80, associativity: "left", head: "Sum" },
    "-": { precedence: 80, associativity: "left", head: "Difference" },
    "*": { precedence: 90, associativity: "left", head: "Product" },
    "/": { precedence: 90, associativity: "left", head: "Fraction" },
    "^": { precedence: 100, associativity: "right", head: "Power" },
};
const DEFAULT_PREFIX = {
    "+": { precedence: 99, head: "Positive" },
    "-": { precedence: 99, head: "Negative" },
};
const DEFAULT_POSTFIX = {
    "!": { precedence: 120, head: "Factorial" },
};

const PREFIX_PRECEDENCE = 99;
const POSTFIX_PRECEDENCE = 120;
const IMPLICIT_MULTIPLICATION_PRECEDENCE = 95;
const STRUCTURAL_SPANS = new WeakMap();
const STRUCTURAL_GROUPED = new WeakSet();

export function createStructuralOperatorTable(declarations = []) {
    const table = {
        binary: { ...DEFAULT_BINARY },
        prefix: { ...DEFAULT_PREFIX },
        postfix: { ...DEFAULT_POSTFIX },
    };
    for (const declaration of declarations) {
        const symbol = declaration?.symbol;
        const fixity = String(declaration?.fixity || "infix").toLowerCase();
        const head = declaration?.head;
        if (!symbol || !head) throw new Error("Structural operator declarations require symbol and head");
        if (fixity === "infix" || fixity === "binary") {
            table.binary[symbol] = {
                precedence: Number(declaration.precedence ?? 80),
                associativity: String(declaration.associativity || "left").toLowerCase(),
                head,
                apply: declaration.apply || null,
            };
            if (!["left", "right"].includes(table.binary[symbol].associativity)) {
                throw new Error(`Invalid associativity for structural operator '${symbol}'`);
            }
        } else if (fixity === "prefix") {
            table.prefix[symbol] = {
                precedence: Number(declaration.precedence ?? PREFIX_PRECEDENCE),
                head,
                apply: declaration.apply || null,
            };
        } else if (fixity === "postfix") {
            table.postfix[symbol] = {
                precedence: Number(declaration.precedence ?? POSTFIX_PRECEDENCE),
                head,
                apply: declaration.apply || null,
            };
        } else {
            throw new Error(`Invalid fixity '${declaration.fixity}' for structural operator '${symbol}'`);
        }
    }
    return Object.freeze({
        binary: Object.freeze(table.binary),
        prefix: Object.freeze(table.prefix),
        postfix: Object.freeze(table.postfix),
    });
}

const DEFAULT_OPERATORS = createStructuralOperatorTable();

function compareNames(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function parseError(source, offset, message) {
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    const column = offset - lastNewline;
    return new Error(`SArith parse error at ${line}:${column}: ${message}`);
}

function token(type, value, start, end, gapBefore) {
    return { type, value, start, end, gapBefore };
}

function skipTrivia(source, start) {
    let position = start;
    let skipped = false;
    while (position < source.length) {
        if (/\s/u.test(source[position])) {
            skipped = true;
            position++;
            continue;
        }
        if (source.startsWith("##", position)) {
            skipped = true;
            position += 2;
            while (position < source.length && source[position] !== "\n") position++;
            continue;
        }
        if (source.startsWith("/*", position)) {
            skipped = true;
            const close = source.indexOf("*/", position + 2);
            if (close === -1) throw parseError(source, position, "unclosed block comment");
            position = close + 2;
            continue;
        }
        break;
    }
    return { position, skipped };
}

function scanRiXExpression(source, atPosition) {
    const segment = source.slice(atPosition + 1);
    const rixTokens = tokenize(segment);
    let depth = 0;

    for (const current of rixTokens) {
        if (current.type !== "Symbol") continue;
        if (current.value === "(") {
            depth++;
            continue;
        }
        if (current.value !== ")") continue;
        depth--;
        if (depth === 0) {
            return {
                body: segment.slice(1, current.pos[1]),
                end: atPosition + 1 + current.pos[2],
            };
        }
    }

    throw parseError(source, atPosition, "unclosed '@(' RiX expression splice");
}

export function tokenizeStructuralArithmetic(source, options = {}) {
    const operators = options.operators || DEFAULT_OPERATORS;
    const operatorGlyphs = [
        ...Object.keys(operators.binary),
        ...Object.keys(operators.prefix),
        ...Object.keys(operators.postfix),
    ].sort((left, right) => right.length - left.length);
    const tokens = [];
    let position = 0;
    let previousEnd = 0;

    while (position < source.length) {
        const trivia = skipTrivia(source, position);
        position = trivia.position;
        if (position >= source.length) break;

        const start = position;
        const gapBefore = trivia.skipped || start > previousEnd;
        const rest = source.slice(position);

        if (rest.startsWith("@(")) {
            const splice = scanRiXExpression(source, position);
            position = splice.end;
            tokens.push(token("rix_expression", splice.body, start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        const numberMatch = scanNumberLiteral(source, position);
        if (numberMatch) {
            position = numberMatch.pos[2];
            tokens.push(token("number", numberMatch.value, start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        const identifierMatch = rest.match(/^[\p{L}_][\p{L}\p{N}_]*/u);
        if (identifierMatch) {
            position += identifierMatch[0].length;
            tokens.push(token("identifier", identifierMatch[0], start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        const character = source[position];
        if ("@()".includes(character)) {
            position++;
            const type = character === "(" ? "lparen"
                : character === ")" ? "rparen"
                    : "at";
            tokens.push(token(type, character, start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        const operator = operatorGlyphs.find((glyph) => source.startsWith(glyph, position));
        if (operator) {
            position += operator.length;
            tokens.push(token("operator", operator, start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        throw parseError(source, position, `unexpected character '${character}'`);
    }

    tokens.push(token("end", null, source.length, source.length, source.length > previousEnd));
    return tokens;
}

export function isStructuralSymbol(value) {
    return value?.type === "structural_symbol";
}

export function isStructuralForm(value) {
    return value?.type === "structural_form";
}

export function isStructuralLiteral(value) {
    return value?.type === "structural_literal";
}

export function isStructuralAlgebra(value) {
    return value?.type === "structural_algebra";
}

function rememberSpan(value, span) {
    if (value && typeof value === "object" && span) STRUCTURAL_SPANS.set(value, Object.freeze({ ...span }));
    return value;
}

export function structuralSourceSpan(value) {
    return STRUCTURAL_SPANS.get(value) || value?.span || null;
}

function combinedSpan(left, right, fallback = null) {
    const leftSpan = structuralSourceSpan(left);
    const rightSpan = structuralSourceSpan(right);
    if (leftSpan && rightSpan) return { start: leftSpan.start, end: rightSpan.end };
    return fallback;
}

export function structuralSymbol(name, span = null) {
    return rememberSpan(Object.freeze({
        type: "structural_symbol",
        name,
        ...(span ? { span: Object.freeze({ ...span }) } : {}),
    }), span);
}

export function structuralLiteral(kind, notation, value, span = null) {
    return rememberSpan(Object.freeze({
        type: "structural_literal",
        kind,
        notation,
        value,
        ...(span ? { span: Object.freeze({ ...span }) } : {}),
    }), span);
}

export function structuralAlgebra(profile, components, mode = "construct", span = null) {
    const value = Object.freeze({
        type: "structural_algebra",
        profile: profile.name,
        basis: Object.freeze([...profile.basis]),
        components: Object.freeze([...components]),
        mode,
        ...(span ? { span: Object.freeze({ ...span }) } : {}),
    });
    return rememberSpan(value, span);
}

export function structuralForm(head, args, mode = "construct", span = null) {
    let normalized = [...args];
    if ((head === "Sum" || head === "Product") && normalized.some(
        (argument) =>
            isStructuralForm(argument) &&
            argument.head === head &&
            argument.mode === mode &&
            !STRUCTURAL_GROUPED.has(argument),
    )) {
        normalized = normalized.flatMap((argument) =>
            isStructuralForm(argument) &&
            argument.head === head &&
            argument.mode === mode &&
            !STRUCTURAL_GROUPED.has(argument)
                ? argument.args
                : [argument]);
    }
    const form = Object.freeze({
        type: "structural_form",
        head,
        args: Object.freeze(normalized),
        mode,
        ...(span ? { span: Object.freeze({ ...span }) } : {}),
    });
    return rememberSpan(form, span);
}

function integerValue(value) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    return null;
}

function asFraction(value) {
    value = semanticLiteralValue(value);
    if (value instanceof Fraction) return value;
    const integer = integerValue(value);
    return integer === null ? null : new Fraction(integer, 1n);
}

function isZero(value) {
    value = semanticLiteralValue(value);
    if (value instanceof Integer) return value.value === 0n;
    if (value instanceof Rational) return value.numerator === 0n;
    if (value instanceof Fraction) return value.numerator === 0n;
    return false;
}

function isOne(value) {
    value = semanticLiteralValue(value);
    if (value instanceof Integer) return value.value === 1n;
    if (value instanceof Rational) return value.numerator === value.denominator;
    if (value instanceof Fraction) return value.numerator === value.denominator;
    return false;
}

export function liftStructuralValue(value) {
    if (
        value instanceof Integer ||
        value instanceof Fraction ||
        value instanceof CertifiedApproximation ||
        value instanceof RationalInterval ||
        isStructuralSymbol(value) ||
        isStructuralLiteral(value) ||
        isStructuralAlgebra(value) ||
        isStructuralForm(value)
    ) {
        return value;
    }
    if (value instanceof Rational) {
        return value.denominator === 1n
            ? new Integer(value.numerator)
            : new Fraction(value.numerator, value.denominator);
    }
    return Object.freeze({ type: "structural_value", value });
}

function literalKind(text) {
    if (text.includes("?")) return "CertifiedApproximation";
    if (text.includes("..")) return "MixedNumber";
    if (text.includes(".~")) return "ContinuedFraction";
    if (/^~?(?:0z\[\d+\]|0[A-Za-z])/u.test(text)) return "BasedNumber";
    if (text.includes("[") || text.includes("]")) return "UncertaintyInterval";
    return null;
}

function literalValue(text, options = {}, span = null) {
    let value;
    try {
        value = parseNumber(text);
    } catch (coreError) {
        if (!options.evaluateRiX) throw coreError;
        value = options.evaluateRiX(text);
    }
    const lifted = liftStructuralValue(value);
    const kind = literalKind(text);
    if (kind) return structuralLiteral(kind, text, lifted, span);
    return rememberSpan(lifted, span);
}

function constructBinary(operator, left, right, span = null, table = DEFAULT_BINARY) {
    if (operator === "/") {
        const numerator = integerValue(left);
        const denominator = integerValue(right);
        if (numerator !== null && denominator !== null) {
            return new Fraction(numerator, denominator);
        }
    }
    return structuralForm(table[operator].head, [left, right], "construct", span);
}

function constructPrefix(operator, operand, span = null, info = DEFAULT_PREFIX[operator]) {
    if (!info) throw new Error(`Unknown structural prefix operator '${operator}'`);
    return structuralForm(info.head, [operand], "construct", span);
}

function constructPostfix(operator, operand, span = null, info = DEFAULT_POSTFIX[operator]) {
    if (!info) throw new Error(`Unknown structural postfix operator '${operator}'`);
    return structuralForm(info.head, [operand], "construct", span);
}

function applyAdd(left, right) {
    left = semanticLiteralValue(left);
    right = semanticLiteralValue(right);
    if (isZero(left)) return right;
    if (isZero(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.add(right);
    if (left instanceof RationalInterval || right instanceof RationalInterval) {
        return exactArithmeticValue(left).add(exactArithmeticValue(right));
    }

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction && leftFraction.denominator === rightFraction.denominator) {
        return leftFraction.add(rightFraction);
    }
    if (leftFraction && rightFraction) {
        const gcd = greatestCommonDivisor(leftFraction.denominator, rightFraction.denominator);
        const denominator = (leftFraction.denominator / gcd) * rightFraction.denominator;
        return new Fraction(
            leftFraction.numerator * (denominator / leftFraction.denominator)
                + rightFraction.numerator * (denominator / rightFraction.denominator),
            denominator,
        );
    }
    if (leftFraction && right instanceof Integer) {
        return new Fraction(
            leftFraction.numerator + right.value * leftFraction.denominator,
            leftFraction.denominator,
        );
    }
    if (left instanceof Integer && rightFraction) {
        return new Fraction(
            left.value * rightFraction.denominator + rightFraction.numerator,
            rightFraction.denominator,
        );
    }
    return structuralForm("Sum", [left, right], "apply");
}

function applySubtract(left, right) {
    left = semanticLiteralValue(left);
    right = semanticLiteralValue(right);
    if (isZero(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.subtract(right);
    if (left instanceof RationalInterval || right instanceof RationalInterval) {
        return exactArithmeticValue(left).subtract(exactArithmeticValue(right));
    }

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction && leftFraction.denominator === rightFraction.denominator) {
        return leftFraction.subtract(rightFraction);
    }
    if (leftFraction && rightFraction) {
        const gcd = greatestCommonDivisor(leftFraction.denominator, rightFraction.denominator);
        const denominator = (leftFraction.denominator / gcd) * rightFraction.denominator;
        return new Fraction(
            leftFraction.numerator * (denominator / leftFraction.denominator)
                - rightFraction.numerator * (denominator / rightFraction.denominator),
            denominator,
        );
    }
    if (leftFraction && right instanceof Integer) {
        return new Fraction(
            leftFraction.numerator - right.value * leftFraction.denominator,
            leftFraction.denominator,
        );
    }
    if (left instanceof Integer && rightFraction) {
        return new Fraction(
            left.value * rightFraction.denominator - rightFraction.numerator,
            rightFraction.denominator,
        );
    }
    return structuralForm("Difference", [left, right], "apply");
}

function applyMultiply(left, right) {
    left = semanticLiteralValue(left);
    right = semanticLiteralValue(right);
    if (isZero(left) || isZero(right)) return new Integer(0n);
    if (isOne(left)) return right;
    if (isOne(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.multiply(right);
    if (left instanceof RationalInterval || right instanceof RationalInterval) {
        return exactArithmeticValue(left).multiply(exactArithmeticValue(right));
    }

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction) return leftFraction.multiply(rightFraction);
    return structuralForm("Product", [left, right], "apply");
}

function applyDivide(left, right) {
    left = semanticLiteralValue(left);
    right = semanticLiteralValue(right);
    if (isZero(right)) throw new Error("Structural division by zero");
    if (isOne(right)) return left;
    if (left instanceof RationalInterval || right instanceof RationalInterval) {
        return exactArithmeticValue(left).divide(exactArithmeticValue(right));
    }
    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction) return leftFraction.divide(rightFraction);
    return structuralForm("Fraction", [left, right], "apply");
}

function applyPower(left, right) {
    left = semanticLiteralValue(left);
    right = semanticLiteralValue(right);
    const exponent = integerValue(right);
    if (exponent === 0n) return new Integer(1n);
    if (exponent === 1n) return left;
    if (exponent !== null && left instanceof Integer) return left.pow(exponent);
    if (exponent !== null && left instanceof Fraction) return left.pow(exponent);
    return structuralForm("Power", [left, right], "apply");
}

export function applyStructuralBinary(operator, left, right) {
    if (operator === ":") {
        left = semanticLiteralValue(left);
        right = semanticLiteralValue(right);
        const leftRational = toRational(left);
        const rightRational = toRational(right);
        if (leftRational && rightRational) return new RationalInterval(leftRational, rightRational);
        return structuralForm("Interval", [left, right], "apply");
    }
    if (operator === "+") return applyAdd(left, right);
    if (operator === "-") return applySubtract(left, right);
    if (operator === "*") return applyMultiply(left, right);
    if (operator === "/") return applyDivide(left, right);
    if (operator === "^") return applyPower(left, right);
    throw new Error(`Unknown structural binary operator '${operator}'`);
}

export function applyStructuralPrefix(operator, operand) {
    operand = semanticLiteralValue(operand);
    if (operator === "+") return operand;
    if (operator === "-") {
        if (operand instanceof Integer) return operand.negate();
        if (operand instanceof Fraction) return new Fraction(-operand.numerator, operand.denominator);
        return structuralForm("Negative", [operand], "apply");
    }
    throw new Error(`Unknown structural prefix operator '${operator}'`);
}

export function applyStructuralPostfix(operator, operand) {
    operand = semanticLiteralValue(operand);
    if (operator === "!") {
        if (operand instanceof Integer) return operand.factorial();
        return structuralForm("Factorial", [operand], "apply");
    }
    throw new Error(`Unknown structural postfix operator '${operator}'`);
}

function applyConfiguredBinary(operator, info, left, right) {
    if (info.apply) return info.apply(left, right);
    if (DEFAULT_BINARY[operator]) return applyStructuralBinary(operator, left, right);
    return structuralForm(info.head, [semanticLiteralValue(left), semanticLiteralValue(right)], "apply");
}

function applyConfiguredPrefix(operator, info, operand) {
    if (info.apply) return info.apply(operand);
    if (DEFAULT_PREFIX[operator]) return applyStructuralPrefix(operator, operand);
    return structuralForm(info.head, [semanticLiteralValue(operand)], "apply");
}

function applyConfiguredPostfix(operator, info, operand) {
    if (info.apply) return info.apply(operand);
    if (DEFAULT_POSTFIX[operator]) return applyStructuralPostfix(operator, operand);
    return structuralForm(info.head, [semanticLiteralValue(operand)], "apply");
}

function startsOperand(current) {
    return current.type === "number" ||
        current.type === "identifier" ||
        current.type === "rix_expression" ||
        current.type === "at" ||
        current.type === "lparen";
}

class StructuralParser {
    constructor(source, context, options = {}) {
        this.source = source;
        this.context = context;
        this.evaluateRiX = options.evaluateRiX || null;
        this.operators = options.operators || DEFAULT_OPERATORS;
        this.binary = this.operators.binary;
        this.prefix = this.operators.prefix;
        this.postfix = this.operators.postfix;
        this.tokens = tokenizeStructuralArithmetic(source, { operators: this.operators });
        this.index = 0;
        this.groupedValues = new WeakSet();
        this.tightPrefixValues = new WeakSet();
    }

    get current() {
        return this.tokens[this.index];
    }

    get next() {
        return this.tokens[this.index + 1];
    }

    advance() {
        const current = this.current;
        this.index++;
        return current;
    }

    error(tokenValue, message) {
        throw parseError(this.source, tokenValue?.start ?? this.source.length, message);
    }

    parse() {
        if (this.current.type === "end") this.error(this.current, "empty structural expression");
        const value = this.parseExpression(0);
        if (this.current.type !== "end") {
            this.error(this.current, `unexpected token '${this.current.value}'`);
        }
        return value;
    }

    parseExpression(minimumPrecedence) {
        let left = this.parsePrefix();

        while (true) {
            if (this.current.type === "operator" && this.postfix[this.current.value]) {
                const info = this.postfix[this.current.value];
                if (info.precedence < minimumPrecedence) break;
                const operator = this.advance();
                const span = {
                    start: structuralSourceSpan(left)?.start ?? operator.start,
                    end: operator.end,
                };
                left = rememberSpan(operator.gapBefore
                    ? applyConfiguredPostfix(operator.value, info, left)
                    : constructPostfix(operator.value, left, span, info), span);
                continue;
            }

            if (this.current.type === "operator" && this.binary[this.current.value]) {
                const operator = this.current;
                const info = this.binary[operator.value];
                if (info.precedence < minimumPrecedence) break;
                const gapAfter = this.next?.gapBefore === true;
                if (operator.gapBefore !== gapAfter) {
                    this.error(
                        operator,
                        `operator '${operator.value}' must either touch both operands or be separated from both`,
                    );
                }
                this.advance();
                if (
                    operator.value === "^" &&
                    !operator.gapBefore &&
                    this.tightPrefixValues.has(left) &&
                    !this.groupedValues.has(left)
                ) {
                    this.error(
                        operator,
                        `ambiguous tight prefix and power; use '${left.head === "Positive" ? "+" : "-"} x^n' or parenthesize the base`,
                    );
                }
                let rightMinimum = info.associativity === "right"
                    ? info.precedence
                    : info.precedence + 1;
                // A tight slash first constructs the fraction immediately to
                // its right, so mathematical coefficient notation such as
                // `3/4 x^5` becomes Product(Fraction(3,4), Power(x,5)).
                if (operator.value === "/" && !operator.gapBefore) {
                    rightMinimum = Math.max(
                        rightMinimum,
                        IMPLICIT_MULTIPLICATION_PRECEDENCE + 1,
                    );
                }
                const right = this.parseExpression(rightMinimum);
                if (
                    operator.value === "/" &&
                    !operator.gapBefore &&
                    isStructuralForm(right) &&
                    (
                        right.head === "Power" ||
                        Object.values(this.postfix).some((postfix) => postfix.head === right.head)
                    ) &&
                    !this.groupedValues.has(right)
                ) {
                    this.error(
                        operator,
                        "ambiguous tight fraction denominator; parenthesize the fraction or its denominator",
                    );
                }
                const span = combinedSpan(left, right, { start: operator.start, end: operator.end });
                left = rememberSpan(operator.gapBefore
                    ? applyConfiguredBinary(operator.value, info, left, right)
                    : constructBinary(operator.value, left, right, span, this.binary), span);
                continue;
            }

            if (startsOperand(this.current)) {
                if (IMPLICIT_MULTIPLICATION_PRECEDENCE < minimumPrecedence) break;
                const right = this.parseExpression(IMPLICIT_MULTIPLICATION_PRECEDENCE + 1);
                left = structuralForm("Product", [left, right], "construct", combinedSpan(left, right));
                continue;
            }

            break;
        }

        return left;
    }

    parsePrefix() {
        const current = this.current;
        if (current.type === "number") {
            this.advance();
            return literalValue(current.value, { evaluateRiX: this.evaluateRiX }, {
                start: current.start,
                end: current.end,
            });
        }
        if (current.type === "identifier") {
            this.advance();
            return structuralSymbol(current.value, { start: current.start, end: current.end });
        }
        if (current.type === "rix_expression") {
            this.advance();
            if (!this.evaluateRiX) {
                this.error(current, "'@(expression)' requires an active RiX evaluator");
            }
            return rememberSpan(liftStructuralValue(this.evaluateRiX(current.value)), {
                start: current.start,
                end: current.end,
            });
        }
        if (current.type === "at") {
            this.advance();
            if (this.current.type !== "identifier") {
                this.error(this.current, "'@' must be followed by an outer identifier");
            }
            const name = this.advance().value;
            const value = this.context?.get?.(name);
            if (value === undefined) {
                this.error(current, `undefined outer value '@${name}'`);
            }
            return rememberSpan(liftStructuralValue(value), { start: current.start, end: this.tokens[this.index - 1].end });
        }
        if (current.type === "lparen") {
            const open = this.advance();
            const value = this.parseExpression(0);
            if (this.current.type !== "rparen") {
                this.error(this.current, "expected closing parenthesis");
            }
            const close = this.advance();
            if (value !== null && typeof value === "object") {
                this.groupedValues.add(value);
                STRUCTURAL_GROUPED.add(value);
                rememberSpan(value, { start: open.start, end: close.end });
            }
            return value;
        }
        if (current.type === "operator" && this.prefix[current.value]) {
            const operator = this.advance();
            const info = this.prefix[operator.value];
            const separated = this.current.gapBefore === true;
            const operand = this.parseExpression(
                separated ? (this.prefix[operator.value]?.precedence ?? PREFIX_PRECEDENCE)
                    : (this.binary["^"]?.precedence ?? 100) + 1,
            );
            if (
                !separated &&
                isStructuralForm(operand) &&
                Object.values(this.postfix).some((postfix) => postfix.head === operand.head) &&
                !this.groupedValues.has(operand)
            ) {
                this.error(
                    operator,
                    "ambiguous tight prefix and postfix; parenthesize the prefix or its operand",
                );
            }
            const span = {
                start: operator.start,
                end: structuralSourceSpan(operand)?.end ?? operator.end,
            };
            const result = separated
                ? applyConfiguredPrefix(operator.value, info, operand)
                : constructPrefix(operator.value, operand, span, info);
            rememberSpan(result, span);
            if (!separated && result !== null && typeof result === "object") {
                this.tightPrefixValues.add(result);
            }
            return result;
        }
        this.error(current, `expected an operand, got '${current.value ?? "end"}'`);
    }
}

function integerComponent(value) {
    const integer = integerValue(value);
    return integer === null ? null : integer;
}

function componentAdd(left, right, mode) {
    if (isZero(left)) return right;
    if (isZero(right)) return left;
    return mode === "apply"
        ? applyStructuralBinary("+", left, right)
        : structuralForm("Sum", [left, right], "construct", combinedSpan(left, right));
}

function componentSubtract(left, right, mode) {
    if (isZero(right)) return left;
    if (isZero(left)) return componentNegate(right, mode);
    return mode === "apply"
        ? applyStructuralBinary("-", left, right)
        : structuralForm("Difference", [left, right], "construct", combinedSpan(left, right));
}

function componentMultiply(left, right, mode) {
    if (isZero(left) || isZero(right)) return new Integer(0n);
    if (isOne(left)) return right;
    if (isOne(right)) return left;
    return mode === "apply"
        ? applyStructuralBinary("*", left, right)
        : structuralForm("Product", [left, right], "construct", combinedSpan(left, right));
}

function componentNegate(value, mode) {
    if (isZero(value)) return value;
    if (value instanceof Integer) return value.negate();
    if (value instanceof Fraction) return new Fraction(-value.numerator, value.denominator);
    if (value instanceof Rational) return value.negate();
    return mode === "apply"
        ? applyStructuralPrefix("-", value)
        : structuralForm("Negative", [value], "construct", structuralSourceSpan(value));
}

function zeroComponents(length) {
    return Array.from({ length }, () => new Integer(0n));
}

function conjugateIntegerComponents(components) {
    if (components.length === 1) return [...components];
    const half = components.length / 2;
    return [
        ...conjugateIntegerComponents(components.slice(0, half)),
        ...components.slice(half).map((value) => -value),
    ];
}

function addIntegerComponents(left, right) {
    return left.map((value, index) => value + right[index]);
}

function subtractIntegerComponents(left, right) {
    return left.map((value, index) => value - right[index]);
}

function multiplyIntegerComponents(left, right) {
    if (left.length === 1) return [left[0] * right[0]];
    const half = left.length / 2;
    const a = left.slice(0, half);
    const b = left.slice(half);
    const c = right.slice(0, half);
    const d = right.slice(half);
    return [
        ...subtractIntegerComponents(
            multiplyIntegerComponents(a, c),
            multiplyIntegerComponents(conjugateIntegerComponents(d), b),
        ),
        ...addIntegerComponents(
            multiplyIntegerComponents(d, a),
            multiplyIntegerComponents(b, conjugateIntegerComponents(c)),
        ),
    ];
}

function cayleyMultiplicationTable(dimension) {
    return Array.from({ length: dimension }, (_, leftIndex) =>
        Array.from({ length: dimension }, (_, rightIndex) => {
            const left = Array.from({ length: dimension }, (_value, index) => index === leftIndex ? 1 : 0);
            const right = Array.from({ length: dimension }, (_value, index) => index === rightIndex ? 1 : 0);
            const result = multiplyIntegerComponents(left, right);
            const resultIndex = result.findIndex((value) => value !== 0);
            return resultIndex === -1
                ? { index: 0, sign: 0 }
                : { index: resultIndex, sign: result[resultIndex] };
        }));
}

export function createStructuralAlgebraProfile(name, basis, options = {}) {
    if (!name) throw new Error("Structural algebra profile requires a name");
    if (!Array.isArray(basis) || new Set(basis).size !== basis.length) {
        throw new Error("Structural algebra profile basis names must be a unique array");
    }
    const dimension = basis.length + 1;
    const multiplication = options.cayleyDickson
        ? cayleyMultiplicationTable(dimension)
        : options.multiplication || null;
    return Object.freeze({
        name,
        basis: Object.freeze([...basis]),
        multiplication,
    });
}

export const STRUCTURAL_ALGEBRA_PROFILES = Object.freeze({
    Complex: createStructuralAlgebraProfile("Complex", ["i"], { cayleyDickson: true }),
    Quaternion: createStructuralAlgebraProfile("Quaternion", ["i", "j", "k"], { cayleyDickson: true }),
    Octonion: createStructuralAlgebraProfile(
        "Octonion",
        ["e1", "e2", "e3", "e4", "e5", "e6", "e7"],
        { cayleyDickson: true },
    ),
});

function algebraScalar(value, profile) {
    return {
        components: [value, ...zeroComponents(profile.basis.length)],
        usesBasis: false,
        mode: "construct",
        unsupported: false,
    };
}

function algebraUnit(index, profile, span) {
    const components = zeroComponents(profile.basis.length + 1);
    components[index + 1] = rememberSpan(new Integer(1n), span);
    return { components, usesBasis: true, mode: "construct", unsupported: false };
}

function addAlgebraStates(left, right, mode, subtract = false) {
    return {
        components: left.components.map((value, index) =>
            subtract
                ? componentSubtract(value, right.components[index], mode)
                : componentAdd(value, right.components[index], mode)),
        usesBasis: left.usesBasis || right.usesBasis,
        mode,
        unsupported: false,
    };
}

function scaleAlgebraState(state, scalar, mode) {
    return {
        components: state.components.map((component) => componentMultiply(component, scalar, mode)),
        usesBasis: state.usesBasis,
        mode,
        unsupported: false,
    };
}

function multiplyAlgebraStates(left, right, profile, mode) {
    if (!profile.multiplication) return null;
    const result = zeroComponents(profile.basis.length + 1);
    for (let leftIndex = 0; leftIndex < left.components.length; leftIndex++) {
        for (let rightIndex = 0; rightIndex < right.components.length; rightIndex++) {
            const rule = profile.multiplication[leftIndex]?.[rightIndex];
            if (!rule || rule.sign === 0) continue;
            let term = componentMultiply(left.components[leftIndex], right.components[rightIndex], mode);
            if (rule.sign < 0) term = componentNegate(term, mode);
            result[rule.index] = componentAdd(result[rule.index], term, mode);
        }
    }
    return {
        components: result,
        usesBasis: left.usesBasis || right.usesBasis,
        mode,
        unsupported: false,
    };
}

function rebuildForm(value, arguments_) {
    return structuralForm(value.head, arguments_, value.mode, structuralSourceSpan(value));
}

function algebraState(value, profile) {
    if (isStructuralAlgebra(value)) {
        if (
            value.profile !== profile.name ||
            value.basis.length !== profile.basis.length ||
            value.basis.some((name, index) => name !== profile.basis[index])
        ) {
            return algebraScalar(value, profile);
        }
        return {
            components: [...value.components],
            usesBasis: true,
            mode: value.mode,
            unsupported: false,
        };
    }
    if (isStructuralSymbol(value)) {
        const basisIndex = profile.basis.indexOf(value.name);
        return basisIndex === -1
            ? algebraScalar(value, profile)
            : algebraUnit(basisIndex, profile, structuralSourceSpan(value));
    }
    if (!isStructuralForm(value)) return algebraScalar(value, profile);

    const states = value.args.map((argument) => algebraState(argument, profile));
    if (states.some((state) => state.unsupported)) {
        return {
            ...algebraScalar(value, profile),
            unsupported: true,
        };
    }
    const anyBasis = states.some((state) => state.usesBasis);
    if (!anyBasis) {
        return algebraScalar(rebuildForm(value, states.map((state) => state.components[0])), profile);
    }

    if (value.head === "Sum") {
        return states.slice(1).reduce(
            (left, right) => addAlgebraStates(left, right, value.mode),
            states[0],
        );
    }
    if (value.head === "Difference" && states.length === 2) {
        return addAlgebraStates(states[0], states[1], value.mode, true);
    }
    if ((value.head === "Negative" || value.head === "Positive") && states.length === 1) {
        return value.head === "Positive"
            ? states[0]
            : {
                components: states[0].components.map((component) => componentNegate(component, value.mode)),
                usesBasis: true,
                mode: value.mode,
                unsupported: false,
            };
    }
    if (value.head === "Product") {
        if (value.mode === "construct") {
            const basisStates = states.filter((state) => state.usesBasis);
            if (basisStates.length === 1) {
                const scalars = states.filter((state) => !state.usesBasis).map((state) => state.components[0]);
                const scalar = scalars.reduce(
                    (left, right) => componentMultiply(left, right, "construct"),
                    new Integer(1n),
                );
                return scaleAlgebraState(basisStates[0], scalar, "construct");
            }
        } else if (profile.multiplication) {
            return states.slice(1).reduce(
                (left, right) => multiplyAlgebraStates(left, right, profile, "apply"),
                states[0],
            );
        }
    }
    if (
        value.head === "Fraction" &&
        value.mode === "apply" &&
        states.length === 2 &&
        !states[1].usesBasis
    ) {
        const denominator = states[1].components[0];
        return {
            components: states[0].components.map((component) =>
                applyStructuralBinary("/", component, denominator)),
            usesBasis: states[0].usesBasis,
            mode: "apply",
            unsupported: false,
        };
    }
    if (
        value.head === "Power" &&
        value.mode === "apply" &&
        states.length === 2 &&
        states[0].usesBasis &&
        !states[1].usesBasis &&
        profile.multiplication
    ) {
        const exponent = integerComponent(states[1].components[0]);
        if (exponent !== null && exponent >= 0n) {
            let result = algebraScalar(new Integer(1n), profile);
            let factor = states[0];
            let remaining = exponent;
            while (remaining > 0n) {
                if (remaining % 2n === 1n) {
                    result = multiplyAlgebraStates(result, factor, profile, "apply");
                }
                remaining /= 2n;
                if (remaining > 0n) factor = multiplyAlgebraStates(factor, factor, profile, "apply");
            }
            result.usesBasis = exponent > 0n;
            result.mode = "apply";
            return result;
        }
    }

    return {
        ...algebraScalar(rebuildForm(value, value.args), profile),
        unsupported: true,
    };
}

export function interpretStructuralAlgebra(value, profile) {
    const state = algebraState(value, profile);
    if (state.unsupported) return state.components[0];
    if (!state.usesBasis) return state.components[0];
    const onlyReal = state.components.slice(1).every(isZero);
    if (state.mode === "apply" && onlyReal) return state.components[0];
    return structuralAlgebra(profile, state.components, state.mode, structuralSourceSpan(value));
}

export function parseStructuralArithmetic(source, context, options = {}) {
    const value = new StructuralParser(String(source), context, options).parse();
    return options.algebraProfile
        ? interpretStructuralAlgebra(value, options.algebraProfile)
        : value;
}

export function structuralFreeSymbols(value, names = new Set()) {
    if (isStructuralSymbol(value)) {
        names.add(value.name);
        return names;
    }
    if (isStructuralForm(value)) {
        for (const argument of value.args) structuralFreeSymbols(argument, names);
    }
    if (isStructuralAlgebra(value)) {
        for (const component of value.components) structuralFreeSymbols(component, names);
    }
    return names;
}

export function sortedStructuralFreeSymbols(value) {
    return [...structuralFreeSymbols(value)].sort(compareNames);
}

export function resolveStructuralValue(value, context) {
    if (isStructuralSymbol(value)) {
        const resolved = context?.get?.(value.name);
        if (resolved === undefined) {
            throw new Error(`Undefined structural function argument: ${value.name}`);
        }
        return liftStructuralValue(resolved);
    }
    if (isStructuralLiteral(value)) return value;
    if (isStructuralAlgebra(value)) {
        const profile = createStructuralAlgebraProfile(value.profile, value.basis, {
            cayleyDickson: ["Complex", "Quaternion", "Octonion"].includes(value.profile),
        });
        return structuralAlgebra(
            profile,
            value.components.map((component) => resolveStructuralValue(component, context)),
            value.mode,
            structuralSourceSpan(value),
        );
    }
    if (!isStructuralForm(value)) return value;

    const args = value.args.map((argument) => resolveStructuralValue(argument, context));
    if (value.mode === "construct") {
        if (value.head === "Sum") return structuralForm("Sum", args, "construct");
        if (value.head === "Difference") return constructBinary("-", args[0], args[1]);
        if (value.head === "Product") return structuralForm("Product", args, "construct");
        if (value.head === "Fraction") return constructBinary("/", args[0], args[1]);
        if (value.head === "Power") return constructBinary("^", args[0], args[1]);
        if (value.head === "Positive") return constructPrefix("+", args[0]);
        if (value.head === "Negative") return constructPrefix("-", args[0]);
        if (value.head === "Factorial") return constructPostfix("!", args[0]);
        if (value.head === "Interval") return constructBinary(":", args[0], args[1]);
        return structuralForm(value.head, args, "construct");
    }

    if (value.head === "Sum") return args.slice(1).reduce((result, argument) =>
        applyStructuralBinary("+", result, argument), args[0]);
    if (value.head === "Difference") return applyStructuralBinary("-", args[0], args[1]);
    if (value.head === "Product") return args.slice(1).reduce((result, argument) =>
        applyStructuralBinary("*", result, argument), args[0]);
    if (value.head === "Fraction") return applyStructuralBinary("/", args[0], args[1]);
    if (value.head === "Power") return applyStructuralBinary("^", args[0], args[1]);
    if (value.head === "Positive") return applyStructuralPrefix("+", args[0]);
    if (value.head === "Negative") return applyStructuralPrefix("-", args[0]);
    if (value.head === "Factorial") return applyStructuralPostfix("!", args[0]);
    if (value.head === "Interval") return applyStructuralBinary(":", args[0], args[1]);
    return structuralForm(value.head, args, "apply");
}

export function createStructuralFunction(value, context, name = null, explicitSymbols = null) {
    const symbols = explicitSymbols || sortedStructuralFreeSymbols(value);
    return {
        type: "lambda",
        ...(name ? { name } : {}),
        params: {
            positional: symbols.map((symbol) => ({ name: symbol, holeDefault: null })),
            keyword: [],
            conditionals: [],
            prep: [],
            prepStrict: false,
            metadata: {},
        },
        body: { fn: "SARITH_FUNCTION_BODY", args: [value] },
        __closureScopes: context?.captureClosureScopes?.() || [],
    };
}

export function structuralValueToIr(value) {
    if (isStructuralLiteral(value)) return structuralValueToIr(value.value);
    if (isStructuralAlgebra(value)) {
        if (value.components.slice(1).every(isZero)) return structuralValueToIr(value.components[0]);
        throw new Error(`Structural ${value.profile} form cannot be represented by scalar symbolic IR`);
    }
    if (isStructuralSymbol(value)) return { fn: "RETRIEVE", args: [value.name] };
    if (value instanceof Integer) return { fn: "LITERAL", args: [value.value.toString()] };
    if (value instanceof Fraction) {
        return {
            fn: "DIV",
            args: [
                { fn: "LITERAL", args: [value.numerator.toString()] },
                { fn: "LITERAL", args: [value.denominator.toString()] },
            ],
        };
    }
    if (value instanceof Rational) {
        if (value.denominator === 1n) {
            return { fn: "LITERAL", args: [value.numerator.toString()] };
        }
        return {
            fn: "DIV",
            args: [
                { fn: "LITERAL", args: [value.numerator.toString()] },
                { fn: "LITERAL", args: [value.denominator.toString()] },
            ],
        };
    }
    if (value instanceof RationalInterval) {
        return {
            fn: "INTERVAL",
            args: [structuralValueToIr(value.start), structuralValueToIr(value.end)],
        };
    }
    if (value?.type === "structural_value") {
        return structuralValueToIr(value.value);
    }
    if (!isStructuralForm(value)) {
        throw new Error("Structural value cannot be represented by the exact symbolic IR");
    }

    const args = value.args.map(structuralValueToIr);
    const heads = {
        Sum: "ADD",
        Difference: "SUB",
        Product: "MUL",
        Fraction: "DIV",
        Power: "POW",
        Negative: "NEG",
        Positive: null,
        Factorial: "FACTORIAL",
        Interval: "INTERVAL",
    };
    if (!Object.prototype.hasOwnProperty.call(heads, value.head)) {
        throw new Error(`Structural form '${value.head}' cannot be represented by the exact symbolic IR`);
    }
    const fn = heads[value.head];
    if (!fn) return args[0];
    if ((fn === "ADD" || fn === "MUL") && args.length > 2) {
        return args.slice(1).reduce((left, right) => ({ fn, args: [left, right] }), args[0]);
    }
    return { fn, args };
}

export function formatStructuralValue(value, formatChild = String) {
    if (isStructuralSymbol(value)) return value.name;
    if (isStructuralLiteral(value)) return value.notation;
    if (isStructuralAlgebra(value)) {
        const label = value.profile === "Algebra"
            ? `Algebra[${value.basis.join(",")}]`
            : value.profile;
        return `${label}(${value.components.map((component) =>
            formatStructuralValue(component, formatChild)).join(", ")})`;
    }
    if (value?.type === "structural_value") return `Value(${formatChild(value.value)})`;
    if (!isStructuralForm(value)) return formatChild(value);
    return `${value.head}(${value.args.map((argument) => formatStructuralValue(argument, formatChild)).join(", ")})`;
}

function greatestCommonDivisor(left, right) {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

function semanticLiteralValue(value) {
    return isStructuralLiteral(value) ? value.value : value;
}

function toRational(value) {
    if (value instanceof Integer) return value.toRational();
    if (value instanceof Rational) return value;
    if (value instanceof Fraction) return new Rational(value.numerator, value.denominator);
    return null;
}

function exactArithmeticValue(value) {
    return value instanceof Fraction
        ? new Rational(value.numerator, value.denominator)
        : value;
}

export function collapseStructuralValue(value, context = null) {
    if (isStructuralLiteral(value)) return collapseStructuralValue(value.value, context);
    if (value?.type === "structural_value") return collapseStructuralValue(value.value, context);
    if (isStructuralSymbol(value)) {
        const resolved = context?.get?.(value.name);
        return resolved === undefined ? value : collapseStructuralValue(liftStructuralValue(resolved), context);
    }
    if (isStructuralAlgebra(value)) {
        const components = value.components.map((component) =>
            collapseStructuralValue(component, context));
        if (components.slice(1).every(isZero)) return components[0];
        const profile = createStructuralAlgebraProfile(value.profile, value.basis, {
            cayleyDickson: ["Complex", "Quaternion", "Octonion"].includes(value.profile),
        });
        return structuralAlgebra(profile, components, "apply", structuralSourceSpan(value));
    }
    if (!isStructuralForm(value)) {
        return value instanceof Fraction
            ? new Rational(value.numerator, value.denominator)
            : value;
    }
    const args = value.args.map((argument) => collapseStructuralValue(argument, context));
    if (value.head === "Sum") return args.slice(1).reduce((result, argument) =>
        applyStructuralBinary("+", result, argument), args[0]);
    if (value.head === "Difference") return applyStructuralBinary("-", args[0], args[1]);
    if (value.head === "Product") return args.slice(1).reduce((result, argument) =>
        applyStructuralBinary("*", result, argument), args[0]);
    if (value.head === "Fraction") return applyStructuralBinary("/", args[0], args[1]);
    if (value.head === "Power") return applyStructuralBinary("^", args[0], args[1]);
    if (value.head === "Positive") return applyStructuralPrefix("+", args[0]);
    if (value.head === "Negative") return applyStructuralPrefix("-", args[0]);
    if (value.head === "Factorial") return applyStructuralPostfix("!", args[0]);
    if (value.head === "Interval") return applyStructuralBinary(":", args[0], args[1]);
    return structuralForm(value.head, args, "apply");
}

export function inspectStructuralValue(value) {
    if (isStructuralSymbol(value)) {
        return { type: "map", entries: new Map([
            ["kind", { type: "string", value: "symbol" }],
            ["name", { type: "string", value: value.name }],
            ["span", spanValue(structuralSourceSpan(value))],
        ]) };
    }
    if (isStructuralLiteral(value)) {
        return { type: "map", entries: new Map([
            ["kind", { type: "string", value: "literal" }],
            ["head", { type: "string", value: value.kind }],
            ["notation", { type: "string", value: value.notation }],
            ["value", value.value],
            ["span", spanValue(structuralSourceSpan(value))],
        ]) };
    }
    if (isStructuralAlgebra(value)) {
        return { type: "map", entries: new Map([
            ["kind", { type: "string", value: "algebra" }],
            ["head", { type: "string", value: value.profile }],
            ["basis", { type: "sequence", values: value.basis.map((name) => ({ type: "string", value: name })) }],
            ["components", { type: "sequence", values: [...value.components] }],
            ["mode", { type: "string", value: value.mode }],
            ["span", spanValue(structuralSourceSpan(value))],
        ]) };
    }
    if (isStructuralForm(value)) {
        return { type: "map", entries: new Map([
            ["kind", { type: "string", value: "form" }],
            ["head", { type: "string", value: value.head }],
            ["mode", { type: "string", value: value.mode }],
            ["arguments", { type: "sequence", values: [...value.args] }],
            ["span", spanValue(structuralSourceSpan(value))],
        ]) };
    }
    return { type: "map", entries: new Map([
        ["kind", { type: "string", value: "value" }],
        ["value", value],
        ["span", spanValue(structuralSourceSpan(value))],
    ]) };
}

function spanValue(span) {
    if (!span) return null;
    return { type: "map", entries: new Map([
        ["start", new Integer(BigInt(span.start + 1))],
        ["end", new Integer(BigInt(span.end + 1))],
    ]) };
}

function structurallyEqual(left, right) {
    if (left === right) return true;
    if (isStructuralSymbol(left) && isStructuralSymbol(right)) return left.name === right.name;
    if (isStructuralLiteral(left) && isStructuralLiteral(right)) return left.notation === right.notation;
    if (left instanceof Integer && right instanceof Integer) return left.value === right.value;
    if (left instanceof Fraction && right instanceof Fraction) {
        return left.numerator === right.numerator && left.denominator === right.denominator;
    }
    if (!isStructuralForm(left) || !isStructuralForm(right)) return false;
    return left.head === right.head && left.mode === right.mode &&
        left.args.length === right.args.length &&
        left.args.every((argument, index) => structurallyEqual(argument, right.args[index]));
}

function provablyNonzero(value, assumptions) {
    const semantic = semanticLiteralValue(value);
    if (semantic instanceof Integer) return semantic.value !== 0n;
    if (semantic instanceof Fraction || semantic instanceof Rational) return semantic.numerator !== 0n;
    if (isStructuralSymbol(value)) return assumptions.has(value.name);
    return false;
}

export function simplifyStructuralValue(value, options = {}) {
    const assumptions = new Set(options.nonzero || []);
    if (isStructuralAlgebra(value)) {
        const profile = createStructuralAlgebraProfile(value.profile, value.basis, {
            cayleyDickson: ["Complex", "Quaternion", "Octonion"].includes(value.profile),
        });
        return structuralAlgebra(
            profile,
            value.components.map((component) => simplifyStructuralValue(component, options)),
            value.mode,
            structuralSourceSpan(value),
        );
    }
    if (!isStructuralForm(value)) return value;
    const args = value.args.map((argument) => simplifyStructuralValue(argument, options));
    if (value.head === "Fraction" && args.length === 2) {
        const numeratorFactors = isStructuralForm(args[0]) && args[0].head === "Product"
            ? [...args[0].args]
            : [args[0]];
        const index = numeratorFactors.findIndex((factor) =>
            structurallyEqual(factor, args[1]) && provablyNonzero(factor, assumptions));
        if (index !== -1) {
            numeratorFactors.splice(index, 1);
            if (numeratorFactors.length === 0) return new Integer(1n);
            if (numeratorFactors.length === 1) return numeratorFactors[0];
            return structuralForm("Product", numeratorFactors, value.mode);
        }
    }
    return structuralForm(value.head, args, value.mode, structuralSourceSpan(value));
}
