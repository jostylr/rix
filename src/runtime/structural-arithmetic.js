import { Fraction, Integer, Rational, parseNumber } from "@ratmath/core";
import { tokenize } from "../parser/tokenizer.js";

const BINARY = {
    "+": { precedence: 80, associativity: "left", head: "Sum" },
    "-": { precedence: 80, associativity: "left", head: "Difference" },
    "*": { precedence: 90, associativity: "left", head: "Product" },
    "/": { precedence: 90, associativity: "left", head: "Fraction" },
    "^": { precedence: 100, associativity: "right", head: "Power" },
};

const PREFIX_PRECEDENCE = 99;
const POSTFIX_PRECEDENCE = 120;
const IMPLICIT_MULTIPLICATION_PRECEDENCE = 95;

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

export function tokenizeStructuralArithmetic(source) {
    const tokens = [];
    let position = 0;
    let previousEnd = 0;

    while (position < source.length) {
        while (position < source.length && /\s/u.test(source[position])) position++;
        if (position >= source.length) break;

        const start = position;
        const gapBefore = start > previousEnd;
        const rest = source.slice(position);

        if (rest.startsWith("@(")) {
            const splice = scanRiXExpression(source, position);
            position = splice.end;
            tokens.push(token("rix_expression", splice.body, start, position, gapBefore));
            previousEnd = position;
            continue;
        }

        const numberMatch = rest.match(/^(?:\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:#\d(?:_?\d)*)?|\.\d(?:_?\d)*(?:#\d(?:_?\d)*)?)/u);
        if (numberMatch) {
            position += numberMatch[0].length;
            tokens.push(token("number", numberMatch[0], start, position, gapBefore));
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
        if ("+-*/^!@()".includes(character)) {
            position++;
            const type = character === "(" ? "lparen"
                : character === ")" ? "rparen"
                    : character === "@" ? "at"
                        : "operator";
            tokens.push(token(type, character, start, position, gapBefore));
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

export function structuralSymbol(name) {
    return Object.freeze({ type: "structural_symbol", name });
}

export function structuralForm(head, args, mode = "construct") {
    return Object.freeze({
        type: "structural_form",
        head,
        args: Object.freeze([...args]),
        mode,
    });
}

function integerValue(value) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    return null;
}

function asFraction(value) {
    if (value instanceof Fraction) return value;
    const integer = integerValue(value);
    return integer === null ? null : new Fraction(integer, 1n);
}

function isZero(value) {
    if (value instanceof Integer) return value.value === 0n;
    if (value instanceof Fraction) return value.numerator === 0n;
    return false;
}

function isOne(value) {
    if (value instanceof Integer) return value.value === 1n;
    if (value instanceof Fraction) return value.numerator === value.denominator;
    return false;
}

export function liftStructuralValue(value) {
    if (
        value instanceof Integer ||
        value instanceof Fraction ||
        isStructuralSymbol(value) ||
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

function literalValue(text) {
    const value = parseNumber(text.replaceAll("_", ""));
    return liftStructuralValue(value);
}

function constructBinary(operator, left, right) {
    if (operator === "/") {
        const numerator = integerValue(left);
        const denominator = integerValue(right);
        if (numerator !== null && denominator !== null) {
            return new Fraction(numerator, denominator);
        }
    }
    return structuralForm(BINARY[operator].head, [left, right], "construct");
}

function constructPrefix(operator, operand) {
    if (operator === "+") return structuralForm("Positive", [operand], "construct");
    return structuralForm("Negative", [operand], "construct");
}

function constructPostfix(operator, operand) {
    if (operator === "!") return structuralForm("Factorial", [operand], "construct");
    throw new Error(`Unknown structural postfix operator '${operator}'`);
}

function applyAdd(left, right) {
    if (isZero(left)) return right;
    if (isZero(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.add(right);

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction && leftFraction.denominator === rightFraction.denominator) {
        return leftFraction.add(rightFraction);
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
    if (isZero(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.subtract(right);

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction && leftFraction.denominator === rightFraction.denominator) {
        return leftFraction.subtract(rightFraction);
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
    if (isZero(left) || isZero(right)) return new Integer(0n);
    if (isOne(left)) return right;
    if (isOne(right)) return left;
    if (left instanceof Integer && right instanceof Integer) return left.multiply(right);

    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction) return leftFraction.multiply(rightFraction);
    return structuralForm("Product", [left, right], "apply");
}

function applyDivide(left, right) {
    if (isZero(right)) throw new Error("Structural division by zero");
    if (isOne(right)) return left;
    const leftFraction = asFraction(left);
    const rightFraction = asFraction(right);
    if (leftFraction && rightFraction) return leftFraction.divide(rightFraction);
    return structuralForm("Fraction", [left, right], "apply");
}

function applyPower(left, right) {
    const exponent = integerValue(right);
    if (exponent === 0n) return new Integer(1n);
    if (exponent === 1n) return left;
    if (exponent !== null && left instanceof Integer) return left.pow(exponent);
    if (exponent !== null && left instanceof Fraction) return left.pow(exponent);
    return structuralForm("Power", [left, right], "apply");
}

export function applyStructuralBinary(operator, left, right) {
    if (operator === "+") return applyAdd(left, right);
    if (operator === "-") return applySubtract(left, right);
    if (operator === "*") return applyMultiply(left, right);
    if (operator === "/") return applyDivide(left, right);
    if (operator === "^") return applyPower(left, right);
    throw new Error(`Unknown structural binary operator '${operator}'`);
}

export function applyStructuralPrefix(operator, operand) {
    if (operator === "+") return operand;
    if (operator === "-") {
        if (operand instanceof Integer) return operand.negate();
        if (operand instanceof Fraction) return new Fraction(-operand.numerator, operand.denominator);
        return structuralForm("Negative", [operand], "apply");
    }
    throw new Error(`Unknown structural prefix operator '${operator}'`);
}

export function applyStructuralPostfix(operator, operand) {
    if (operator === "!") {
        if (operand instanceof Integer) return operand.factorial();
        return structuralForm("Factorial", [operand], "apply");
    }
    throw new Error(`Unknown structural postfix operator '${operator}'`);
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
        this.tokens = tokenizeStructuralArithmetic(source);
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
            if (this.current.type === "operator" && this.current.value === "!") {
                if (POSTFIX_PRECEDENCE < minimumPrecedence) break;
                const operator = this.advance();
                left = operator.gapBefore
                    ? applyStructuralPostfix(operator.value, left)
                    : constructPostfix(operator.value, left);
                continue;
            }

            if (this.current.type === "operator" && BINARY[this.current.value]) {
                const operator = this.current;
                const info = BINARY[operator.value];
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
                    (right.head === "Power" || right.head === "Factorial") &&
                    !this.groupedValues.has(right)
                ) {
                    this.error(
                        operator,
                        "ambiguous tight fraction denominator; parenthesize the fraction or its denominator",
                    );
                }
                left = operator.gapBefore
                    ? applyStructuralBinary(operator.value, left, right)
                    : constructBinary(operator.value, left, right);
                continue;
            }

            if (startsOperand(this.current)) {
                if (IMPLICIT_MULTIPLICATION_PRECEDENCE < minimumPrecedence) break;
                const right = this.parseExpression(IMPLICIT_MULTIPLICATION_PRECEDENCE + 1);
                left = structuralForm("Product", [left, right], "construct");
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
            return literalValue(current.value);
        }
        if (current.type === "identifier") {
            this.advance();
            return structuralSymbol(current.value);
        }
        if (current.type === "rix_expression") {
            this.advance();
            if (!this.evaluateRiX) {
                this.error(current, "'@(expression)' requires an active RiX evaluator");
            }
            return liftStructuralValue(this.evaluateRiX(current.value));
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
            return liftStructuralValue(value);
        }
        if (current.type === "lparen") {
            this.advance();
            const value = this.parseExpression(0);
            if (this.current.type !== "rparen") {
                this.error(this.current, "expected closing parenthesis");
            }
            this.advance();
            if (value !== null && typeof value === "object") {
                this.groupedValues.add(value);
            }
            return value;
        }
        if (current.type === "operator" && (current.value === "+" || current.value === "-")) {
            const operator = this.advance();
            const separated = this.current.gapBefore === true;
            const operand = this.parseExpression(
                separated ? PREFIX_PRECEDENCE : BINARY["^"].precedence + 1,
            );
            if (
                !separated &&
                isStructuralForm(operand) &&
                operand.head === "Factorial" &&
                !this.groupedValues.has(operand)
            ) {
                this.error(
                    operator,
                    "ambiguous tight prefix and postfix; parenthesize the prefix or its operand",
                );
            }
            const result = separated
                ? applyStructuralPrefix(operator.value, operand)
                : constructPrefix(operator.value, operand);
            if (!separated && result !== null && typeof result === "object") {
                this.tightPrefixValues.add(result);
            }
            return result;
        }
        this.error(current, `expected an operand, got '${current.value ?? "end"}'`);
    }
}

export function parseStructuralArithmetic(source, context, options = {}) {
    return new StructuralParser(String(source), context, options).parse();
}

export function structuralFreeSymbols(value, names = new Set()) {
    if (isStructuralSymbol(value)) {
        names.add(value.name);
        return names;
    }
    if (isStructuralForm(value)) {
        for (const argument of value.args) structuralFreeSymbols(argument, names);
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
    if (!isStructuralForm(value)) return value;

    const args = value.args.map((argument) => resolveStructuralValue(argument, context));
    if (value.mode === "construct") {
        if (value.head === "Sum") return constructBinary("+", args[0], args[1]);
        if (value.head === "Difference") return constructBinary("-", args[0], args[1]);
        if (value.head === "Product") return constructBinary("*", args[0], args[1]);
        if (value.head === "Fraction") return constructBinary("/", args[0], args[1]);
        if (value.head === "Power") return constructBinary("^", args[0], args[1]);
        if (value.head === "Positive") return constructPrefix("+", args[0]);
        if (value.head === "Negative") return constructPrefix("-", args[0]);
        if (value.head === "Factorial") return constructPostfix("!", args[0]);
        return structuralForm(value.head, args, "construct");
    }

    if (value.head === "Sum") return applyStructuralBinary("+", args[0], args[1]);
    if (value.head === "Difference") return applyStructuralBinary("-", args[0], args[1]);
    if (value.head === "Product") return applyStructuralBinary("*", args[0], args[1]);
    if (value.head === "Fraction") return applyStructuralBinary("/", args[0], args[1]);
    if (value.head === "Power") return applyStructuralBinary("^", args[0], args[1]);
    if (value.head === "Positive") return applyStructuralPrefix("+", args[0]);
    if (value.head === "Negative") return applyStructuralPrefix("-", args[0]);
    if (value.head === "Factorial") return applyStructuralPostfix("!", args[0]);
    return structuralForm(value.head, args, "apply");
}

export function createStructuralFunction(value, context, name = null) {
    const symbols = sortedStructuralFreeSymbols(value);
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
    };
    if (!Object.prototype.hasOwnProperty.call(heads, value.head)) {
        throw new Error(`Structural form '${value.head}' cannot be represented by the exact symbolic IR`);
    }
    const fn = heads[value.head];
    return fn ? { fn, args } : args[0];
}

export function formatStructuralValue(value, formatChild = String) {
    if (isStructuralSymbol(value)) return value.name;
    if (value?.type === "structural_value") return `Value(${formatChild(value.value)})`;
    if (!isStructuralForm(value)) return formatChild(value);
    return `${value.head}(${value.args.map((argument) => formatStructuralValue(argument, formatChild)).join(", ")})`;
}
