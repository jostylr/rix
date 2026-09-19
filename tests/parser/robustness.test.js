import { expect, test } from 'bun:test';
import { parse } from '../../src/parser/parser.js';
import { tokenize, tokenizeForEditor } from '../../src/parser/tokenizer.js';
import { RIX_SOURCE_LIMITS, RixSourceLimitError } from '../../src/parser/source-limits.js';
import { lower } from '../../src/eval/lower.js';
import { coreFunctions } from '../../src/eval/functions/core.js';
import { analyzeRixDocument, completionAt } from '../../src/tools/language-service/index.js';

const failure = (callback) => { try { callback(); } catch (error) { return error; } throw new Error('Expected failure'); };
test('bounds source, tokens, individual tokens, numeral text and node counts before evaluation', () => {
    for (const [source, limits, kind] of [
        ['1 + 2', { sourceLength: 4 }, 'sourceLength'],
        ['1+2', { tokens: 2 }, 'tokens'],
        ['longname', { tokenLength: 4 }, 'tokenLength'],
        ['123456', { numeralLength: 5 }, 'numeralLength'],
        ['1+2', { nodes: 2 }, 'nodes'],
        ['('.repeat(20)+'1'+')'.repeat(20), { parseDepth: 10 }, 'parseDepth'],
        [Array(20).fill('1').join('+'), { astDepth: 10 }, 'astDepth'],
    ]) {
        const error = failure(() => parse(source, undefined, { limits }));
        expect(error).toBeInstanceOf(RixSourceLimitError);
        expect(error).toMatchObject({ code: 'RXP1001', limit: kind });
        expect(error.offset).toBeGreaterThanOrEqual(0);
        expect(error.offset).toBeLessThanOrEqual(source.length);
    }
    expect(() => parse('1', undefined, { limits: { nodes: RIX_SOURCE_LIMITS.nodes + 1 } })).toThrow('Source limit');
    expect(() => parse('1', undefined, { limits: { unknown: 1 } })).toThrow('Unknown source limit');
    expect(() => parse(tokenize('12345'), undefined, { limits: { numeralLength: 4 } })).toThrow('numeralLength');
});

test('very deep and broad valid-looking input terminates with a bounded diagnostic instead of stack overflow', () => {
    for (const source of ['('.repeat(20000)+'1'+')'.repeat(20000), Array(10000).fill('1').join('+')]) {
        const error = failure(() => lower(parse(source)));
        expect(error).toBeInstanceOf(RixSourceLimitError);
        expect(error.code).toBe('RXP1001');
    }
    const analysis = analyzeRixDocument('a'.repeat(200), { limits: { sourceLength: 100 } });
    expect(analysis.truncated).toBe(true);
    expect(analysis.ast).toBeNull();
    expect(analysis.tokens).toEqual([]);
    expect(analysis.diagnostics[0].code).toBe('RXP1001');
});

test('Unicode identifiers scan code points while spans remain UTF-16, and unsupported digits never disappear', () => {
    const source = '𐐨x := 2; @_𐐀x; @𐐨x; 😀';
    const tokens = tokenize(source);
    expect(tokens.map((token) => token.original).join('')).toBe(source);
    expect(tokens[0]).toMatchObject({ type: 'Identifier', value: '𐐨x', kind: 'User', pos: [0, 0, 3] });
    expect(tokens.find((token) => token.kind === 'SystemFunction').value).toBe('𐐀X');
    expect(tokens.find((token) => token.type === 'OuterIdentifier').value).toBe('𐐨x');
    expect(tokens.at(-2).pos[2] - tokens.at(-2).pos[1]).toBe(2);
    for (const source of ['١+2', '2+१२']) expect(failure(() => tokenize(source)).code).toBe('RXP1002');
    expect(parse('𐐨x')[0].name).toBe('𐐨x');
});

test('consumed literal and identifier leaves retain their own source token spans', () => {
    for (const source of ['  12', ' x', ' X', ' @_ADD', ' @outer', ' _2', ' #12', ' "str"', ' {/abc/i}', ' ?', ' _', ' $', ' $$', ' @', ' .', ' `x+1`']) {
        const token = tokenize(source)[0];
        const node = parse(source)[0];
        expect(node.pos).toEqual(token.pos);
        expect(node.original).toBe(token.original);
    }
    const operation = parse('  12 + 3')[0];
    expect(operation.left.pos).toEqual([0, 2, 4]);
    expect(operation.right.pos).toEqual([6, 7, 8]);
});

test('editor recovery retains later names and folds but never returns an executable recovered AST', () => {
    const source = 'before := 1;\n"unclosed\nafter := 2;\nafter + 3';
    const lexed = tokenizeForEditor(source);
    expect(lexed.diagnostics).toHaveLength(1);
    expect(lexed.tokens.some((token) => token.type === 'Invalid')).toBe(true);
    expect(lexed.tokens.map((token) => token.original).join('')).toBe(source);
    expect(() => parse(source)).toThrow('Delimiter unmatched');
    expect(() => parse(lexed.tokens)).toThrow();
    const analysis = analyzeRixDocument(source);
    expect(analysis.ast).toBeNull();
    expect(analysis.recovered).toBe(true);
    expect(analysis.diagnostics[0].range.start).toBe(source.indexOf('"'));
    expect(analysis.symbols.map((symbol) => symbol.name)).toEqual(['before', 'after']);
    expect(completionAt(analysis, source.length - 4).some((item) => item.label === 'after')).toBe(true);
    const limited = tokenizeForEditor('١\n١\n١\n١', { limits: { recoveryErrors: 2 } });
    expect(limited.diagnostics).toHaveLength(2);
    expect(limited.truncated).toBe(true);
});

// Seeded bounded grammar/property fixtures are reproducible across runtimes.
let state = 0x12ac89;
const random = (n) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
function expression(depth = 0) {
    if (depth === 3 || random(3) === 0) return ['1', '22/7', 'α', '𐐨x', '"text"'][random(5)];
    const a = expression(depth + 1), b = expression(depth + 1);
    return [`(${a}+${b})`, `[${a}, ${b}]`, `(${a}*${b})`][random(3)];
}
test('seeded token/AST properties preserve complete source and deterministic lowering', () => {
    for (let i = 0; i < 250; i++) {
        const source = ` \n${expression()};  `;
        const tokens = tokenize(source);
        expect(tokens.map((token) => token.original).join('')).toBe(source);
        let previous = 0;
        for (const token of tokens) {
            expect(token.pos[0]).toBe(previous);
            expect(token.pos[0]).toBeLessThanOrEqual(token.pos[1]);
            expect(token.pos[1]).toBeLessThanOrEqual(token.pos[2]);
            expect(token.pos[2]).toBeLessThanOrEqual(source.length);
            previous = token.pos[2];
        }
        expect(lower(parse(tokens, undefined, { source }))).toEqual(lower(parse(source)));
    }
});

test('malformed delimiter and number fixtures fail predictably without silent numeric reinterpretation', () => {
    expect(coreFunctions.LITERAL.impl(['0x'])).toBe('0x'); // A standalone base descriptor is valid.
    for (const source of ['0z[1]123', '0z[2]102', '0z[16]xyz', '"unterminated', ':<unclosed', '{=noSpace}', '{/unclosed']) {
        const check = () => { const ir = lower(parse(source)); return coreFunctions.LITERAL.impl(ir[0].args); };
        const first = failure(check);
        const second = failure(check);
        expect(first).not.toBeInstanceOf(RangeError);
        expect(first.message).toBe(second.message);
    }
});

// A syntax error must not send the fallback symbol index into repeated suffix scans.
test('editor indexing stays bounded for long damaged call and selector sequences', () => {
    for (const source of [') '+ 'f('.repeat(10000), ') '+ ':x '.repeat(10000)]) {
        const analysis = analyzeRixDocument(source);
        expect(analysis.ast).toBeNull();
        expect(analysis.diagnostics.length).toBeGreaterThan(0);
        expect(analysis.occurrences).toHaveLength(10000);
    }
});
