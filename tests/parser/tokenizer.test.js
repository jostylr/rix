import { tokenize } from "../../src/parser/tokenizer.js";

// Utility function to add End token to expected results
function withEnd(tokens, endOriginal = "", inputLength = null) {
  let endPos = 0;
  if (inputLength !== null) {
    endPos = inputLength;
  } else if (tokens.length > 0) {
    // Calculate end position from original text length
    endPos = tokens.reduce(
      (acc, token) => acc + (token.original || "").length,
      0,
    );
  }
  return [
    ...tokens,
    {
      type: "End",
      original: endOriginal,
      value: null,
      pos: [endPos, endPos, endPos],
    },
  ];
}

describe("Math Oracle Tokenizer", () => {
  describe("Basic tokenization", () => {
    test("simple tokenization includes End token", () => {
      const tokens = tokenize("x");
      expect(tokens[tokens.length - 1]).toEqual({
        type: "End",
        original: "",
        value: null,
        pos: [1, 1, 1],
      });
    });

    test("whitespace input produces End token", () => {
      expect(tokenize("   ")).toEqual([
        { type: "End", original: "   ", value: null, pos: [0, 0, 3] },
      ]);
    });

    test("empty string returns End token", () => {
      expect(tokenize("")).toEqual([
        { type: "End", original: "", value: null, pos: [0, 0, 0] },
      ]);
    });

    test("concatenating originals reconstructs input", () => {
      const input = 'x + 2.5 * "hello" / 3';
      const tokens = tokenize(input);
      const reconstructed = tokens.map((t) => t.original).join("");
      expect(reconstructed).toBe(input);
    });
  });

  describe("Position information", () => {
    test("all tokens have pos field with correct positions", () => {
      const tokens = tokenize('x + "hello" ## comment');

      // x: starts at 0, value at 0, ends at 1
      expect(tokens[0].pos).toEqual([0, 0, 1]);

      // +: starts at 1 (including space), value at 2, ends at 3
      expect(tokens[1].pos).toEqual([1, 2, 3]);

      // "hello": starts at 3 (including space), value at 5, ends at 11
      expect(tokens[2].pos).toEqual([3, 5, 11]);

      // ## comment: starts at 11 (including space), value at 14, ends at 22
      expect(tokens[3].pos).toEqual([11, 14, 22]);

      // End token: starts at 22, value at 22, ends at 22
      expect(tokens[4].pos).toEqual([22, 22, 22]);
    });

    test("pos field for numbers with embedded #", () => {
      const tokens = tokenize("3.14#2 7#5");

      // 3.14#2: starts at 0, value at 0, ends at 6
      expect(tokens[0].pos).toEqual([0, 0, 6]);

      // 7#5: starts at 6 (including space), value at 7, ends at 10
      expect(tokens[1].pos).toEqual([6, 7, 10]);
    });

    test("pos field for different quote delimiters", () => {
      const tokens = tokenize('""empty"" """content"""');

      // ""empty"": starts at 0, value at 2, ends at 9
      expect(tokens[0].pos).toEqual([0, 2, 9]);

      // """content""": starts at 9 (including space), value at 13, ends at 23
      expect(tokens[1].pos).toEqual([9, 13, 23]);
    });

    test("pos field for block comments", () => {
      const tokens = tokenize("/* comment */ /** doc **/");

      // /* comment */: starts at 0, value at 2, ends at 13
      expect(tokens[0].pos).toEqual([0, 2, 13]);

      // /** doc **/: starts at 13 (including space), value at 17, ends at 25
      expect(tokens[1].pos).toEqual([13, 17, 25]);
    });

    test("pos field for backticks", () => {
      const tokens = tokenize("`code` ```more```");

      // `code`: starts at 0, value at 1, ends at 6
      expect(tokens[0].pos).toEqual([0, 1, 6]);

      // ```more```: starts at 6 (including space), value at 10, ends at 17
      expect(tokens[1].pos).toEqual([6, 10, 17]);
    });

    test("pos field for unit change strings", () => {
      const tokens = tokenize("~[m] ~[kg/s]");

      // ~[: starts at 0, ends at 2
      expect(tokens[0].pos).toEqual([0, 0, 2]);
      expect(tokens[0].value).toBe("~[");

      // m: starts at 2, ends at 3
      expect(tokens[1].pos).toEqual([2, 2, 3]);
      expect(tokens[1].value).toBe("m");

      // ]: starts at 3, ends at 4
      expect(tokens[2].pos).toEqual([3, 3, 4]);
      expect(tokens[2].value).toBe("]");

      // ~[: starts at 5, ends at 7 (includes space)
      expect(tokens[3].pos).toEqual([4, 5, 7]);
      expect(tokens[3].value).toBe("~[");
    });

    test("pos field with whitespace only input", () => {
      const tokens = tokenize("   \t\n  ");

      // End token with whitespace: starts at 0, value at 0, ends at 7
      expect(tokens[0].pos).toEqual([0, 0, 7]);
    });

    test("pos field for symbols", () => {
      const tokens = tokenize(":=: <= **");

      // :=:: starts at 0, value at 0, ends at 3
      expect(tokens[0].pos).toEqual([0, 0, 3]);

      // <=: starts at 3 (including space), value at 4, ends at 6
      expect(tokens[1].pos).toEqual([3, 4, 6]);

      // **: starts at 6 (including space), value at 7, ends at 9
      expect(tokens[2].pos).toEqual([6, 7, 9]);
    });
  });

  describe("Identifier tokens", () => {
    test("simple identifiers", () => {
      const tokens = tokenize("x y α β");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "x",
              value: "x",
              kind: "User",
              pos: [0, 0, 1],
            },
            {
              type: "Identifier",
              original: " y",
              value: "y",
              kind: "User",
              pos: [1, 2, 3],
            },
            {
              type: "Identifier",
              original: " α",
              value: "α",
              kind: "User",
              pos: [3, 4, 5],
            },
            {
              type: "Identifier",
              original: " β",
              value: "β",
              kind: "User",
              pos: [5, 6, 7],
            },
          ],
          "",
          7,
        ),
      );
    });

    test("identifiers with numbers", () => {
      const tokens = tokenize("x1 y2z abc123");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "x1",
              value: "x1",
              kind: "User",
              pos: [0, 0, 2],
            },
            {
              type: "Identifier",
              original: " y2z",
              value: "y2z",
              kind: "User",
              pos: [2, 3, 6],
            },
            {
              type: "Identifier",
              original: " abc123",
              value: "abc123",
              kind: "User",
              pos: [6, 7, 13],
            },
          ],
          "",
          13,
        ),
      );
    });

    test("system identifiers (capital first letter)", () => {
      const tokens = tokenize("Sin Cos Tan ABC");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "Sin",
              value: "SIN",
              kind: "System",
              pos: [0, 0, 3],
            },
            {
              type: "Identifier",
              original: " Cos",
              value: "COS",
              kind: "System",
              pos: [3, 4, 7],
            },
            {
              type: "Identifier",
              original: " Tan",
              value: "TAN",
              kind: "System",
              pos: [7, 8, 11],
            },
            {
              type: "Identifier",
              original: " ABC",
              value: "ABC",
              kind: "System",
              pos: [11, 12, 15],
            },
          ],
          "",
          15,
        ),
      );
    });

    test("user identifiers (lowercase first letter)", () => {
      const tokens = tokenize("sin cos tan abc");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "sin",
              value: "sin",
              kind: "User",
              pos: [0, 0, 3],
            },
            {
              type: "Identifier",
              original: " cos",
              value: "cos",
              kind: "User",
              pos: [3, 4, 7],
            },
            {
              type: "Identifier",
              original: " tan",
              value: "tan",
              kind: "User",
              pos: [7, 8, 11],
            },
            {
              type: "Identifier",
              original: " abc",
              value: "abc",
              kind: "User",
              pos: [11, 12, 15],
            },
          ],
          "",
          15,
        ),
      );
    });

    test("mixed case normalization", () => {
      const tokens = tokenize("MyVar yourVar");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "MyVar",
              value: "MYVAR",
              kind: "System",
              pos: [0, 0, 5],
            },
            {
              type: "Identifier",
              original: " yourVar",
              value: "yourvar",
              kind: "User",
              pos: [5, 6, 13],
            },
          ],
          "",
          13,
        ),
      );
    });

    test("snake_case identifiers", () => {
      const tokens = tokenize("my_var _leading var_ trailing_ _");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "my_var",
              value: "my_var",
              kind: "User",
              pos: [0, 0, 6],
            },
            {
              type: "Identifier",
              original: " _leading",
              value: "_leading",
              kind: "User",
              pos: [6, 7, 15],
            },
            {
              type: "Identifier",
              original: " var_",
              value: "var_",
              kind: "User",
              pos: [15, 16, 20],
            },
            {
              type: "Identifier",
              original: " trailing_",
              value: "trailing_",
              kind: "User",
              pos: [20, 21, 30],
            },
            {
              type: "Symbol",
              original: " _",
              value: "_",
              pos: [30, 31, 32],
            },
          ],
          "",
          32,
        ),
      );
    });

    test("system snake_case identifiers", () => {
      const tokens = tokenize("My_Var _Leading_Cap");
      expect(tokens).toEqual(
        withEnd(
          [
            {
              type: "Identifier",
              original: "My_Var",
              value: "MY_VAR",
              kind: "System",
              pos: [0, 0, 6],
            },
            {
              type: "Identifier",
              original: " _Leading_Cap",
              value: "_LEADING_CAP",
              kind: "System",
              pos: [6, 7, 19],
            },
          ],
          "",
          19,
        ),
      );
    });
  });

  describe("Number tokens", () => {
    describe("integers", () => {
      test("positive integers", () => {
        const tokens = tokenize("0 12 5678");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "0", value: "0", pos: [0, 0, 1] },
            { type: "Number", original: " 12", value: "12", pos: [1, 2, 4] },
            {
              type: "Number",
              original: " 5678",
              value: "5678",
              pos: [4, 5, 9],
            },
          ]),
        );
      });

      test("negative integers", () => {
        const tokens = tokenize("-3 -42 -0");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "-3", value: "-3", pos: [0, 0, 2] },
            { type: "Number", original: " -42", value: "-42", pos: [2, 3, 6] },
            { type: "Number", original: " -0", value: "-0", pos: [6, 7, 9] },
          ]),
        );
      });
    });

    describe("decimals", () => {
      test("positive decimals", () => {
        const tokens = tokenize("3.14 0.5 42.0");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3.14", value: "3.14", pos: [0, 0, 4] },
            { type: "Number", original: " 0.5", value: "0.5", pos: [4, 5, 8] },
            {
              type: "Number",
              original: " 42.0",
              value: "42.0",
              pos: [8, 9, 13],
            },
          ]),
        );
      });

      test("leading decimal point numbers", () => {
        const tokens = tokenize(".5 .123 .0");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: ".5", value: ".5", pos: [0, 0, 2] },
            {
              type: "Number",
              original: " .123",
              value: ".123",
              pos: [2, 3, 7],
            },
            { type: "Number", original: " .0", value: ".0", pos: [7, 8, 10] },
          ]),
        );
      });

      test("negative decimals", () => {
        const tokens = tokenize("-3.14 -.5");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "-3.14",
              value: "-3.14",
              pos: [0, 0, 5],
            },
            { type: "Number", original: " -.5", value: "-.5", pos: [5, 6, 9] },
          ]),
        );
      });
    });

    describe("repeating decimals", () => {
      test("repeating decimals with fractional part", () => {
        const tokens = tokenize("0.12#45 1.3#7");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "0.12#45",
              value: "0.12#45",
              pos: [0, 0, 7],
            },
            {
              type: "Number",
              original: " 1.3#7",
              value: "1.3#7",
              pos: [7, 8, 13],
            },
          ]),
        );
      });

      test("repeating decimals without fractional part", () => {
        const tokens = tokenize("7#3 2#56");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "7#3", value: "7#3", pos: [0, 0, 3] },
            {
              type: "Number",
              original: " 2#56",
              value: "2#56",
              pos: [3, 4, 8],
            },
          ]),
        );
      });

      test("negative repeating decimals", () => {
        const tokens = tokenize("-0.12#45 -7#3");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "-0.12#45",
              value: "-0.12#45",
              pos: [0, 0, 8],
            },
            {
              type: "Number",
              original: " -7#3",
              value: "-7#3",
              pos: [8, 9, 13],
            },
          ]),
        );
      });
    });

    describe("rationals", () => {
      test("positive rationals", () => {
        const tokens = tokenize("3/4 22/7 1/2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3/4", value: "3/4", pos: [0, 0, 3] },
            {
              type: "Number",
              original: " 22/7",
              value: "22/7",
              pos: [3, 4, 8],
            },
            { type: "Number", original: " 1/2", value: "1/2", pos: [8, 9, 12] },
          ]),
        );
      });

      test("negative rationals", () => {
        const tokens = tokenize("-3/4 -1/2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "-3/4", value: "-3/4", pos: [0, 0, 4] },
            {
              type: "Number",
              original: " -1/2",
              value: "-1/2",
              pos: [4, 5, 9],
            },
          ]),
        );
      });

      test("rational with spaces becomes separate tokens", () => {
        const tokens = tokenize("3 / 4");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3", value: "3", pos: [0, 0, 1] },
            { type: "Symbol", original: " /", value: "/", pos: [1, 2, 3] },
            { type: "Number", original: " 4", value: "4", pos: [3, 4, 5] },
          ]),
        );
      });
    });

    describe("mixed numbers", () => {
      test("positive mixed numbers", () => {
        const tokens = tokenize("1..3/4 2..5/8");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "1..3/4",
              value: "1..3/4",
              pos: [0, 0, 6],
            },
            {
              type: "Number",
              original: " 2..5/8",
              value: "2..5/8",
              pos: [6, 7, 13],
            },
          ]),
        );
      });

      test("negative mixed numbers", () => {
        const tokens = tokenize("-1..3/4 -2..1/8");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "-1..3/4",
              value: "-1..3/4",
              pos: [0, 0, 7],
            },
            {
              type: "Number",
              original: " -2..1/8",
              value: "-2..1/8",
              pos: [7, 8, 15],
            },
          ]),
        );
      });
    });

    describe("intervals", () => {
      test("simple intervals", () => {
        const tokens = tokenize("2:5 1.5:2.7");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "2:5", value: "2:5", pos: [0, 0, 3] },
            {
              type: "Number",
              original: " 1.5:2.7",
              value: "1.5:2.7",
              pos: [3, 4, 11],
            },
          ]),
        );
      });

      test("complex intervals", () => {
        const tokens = tokenize("3/4:1.23#56 1..3/4:2..1/8");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "3/4:1.23#56",
              value: "3/4:1.23#56",
              pos: [0, 0, 11],
            },
            {
              type: "Number",
              original: " 1..3/4:2..1/8",
              value: "1..3/4:2..1/8",
              pos: [11, 12, 25],
            },
          ]),
        );
      });

      test("negative intervals", () => {
        const tokens = tokenize("-5:-2 -1.5:3.7");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "-5:-2",
              value: "-5:-2",
              pos: [0, 0, 5],
            },
            {
              type: "Number",
              original: " -1.5:3.7",
              value: "-1.5:3.7",
              pos: [5, 6, 14],
            },
          ]),
        );
      });
    });

    describe("radix shift notation (_^)", () => {
      test("positive radix shift", () => {
        const tokens = tokenize("1_^2 3.14_^-2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "1_^2", value: "1_^2", pos: [0, 0, 4] },
            {
              type: "Number",
              original: " 3.14_^-2",
              value: "3.14_^-2",
              pos: [4, 5, 13],
            },
          ]),
        );
      });

      test("negative radix shift", () => {
        const tokens = tokenize("-1_^5 -3.14_^-2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "-1_^5", value: "-1_^5", pos: [0, 0, 5] },
            {
              type: "Number",
              original: " -3.14_^-2",
              value: "-3.14_^-2",
              pos: [5, 6, 15],
            },
          ]),
        );
      });

      test("radix shift with grouped separators", () => {
        const tokens = tokenize("1.234_4_^10");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "1.234_4_^10", value: "1.234_4_^10", pos: [0, 0, 11] },
          ]),
        );
      });
    });

    describe("continued fractions (.~)", () => {
      test("simple continued fraction", () => {
        const tokens = tokenize("3.~7~15~1~292");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3.~7~15~1~292", value: "3.~7~15~1~292", pos: [0, 0, 13] },
          ]),
        );
      });

      test("continued fraction with one term", () => {
        const tokens = tokenize("1.~2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "1.~2", value: "1.~2", pos: [0, 0, 4] },
          ]),
        );
      });

      test("explicit-start continued fraction with positive coefficient", () => {
        const tokens = tokenize("~1.~2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "~1.~2", value: "~1.~2", pos: [0, 0, 5] },
          ]),
        );
      });

      test("explicit-start continued fraction with negative coefficient", () => {
        const tokens = tokenize("~-1.~2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "~-1.~2", value: "~-1.~2", pos: [0, 0, 6] },
          ]),
        );
      });

      test("explicit-start CF with multiple terms", () => {
        const tokens = tokenize("~-2.~1~2~2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "~-2.~1~2~2", value: "~-2.~1~2~2", pos: [0, 0, 10] },
          ]),
        );
      });

      test("negation of explicit CF: -~1.~2 is unary minus + explicit CF", () => {
        const tokens = tokenize("-~1.~2");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "-", value: "-", pos: [0, 0, 1] },
            { type: "Number", original: "~1.~2", value: "~1.~2", pos: [1, 1, 6] },
          ]),
        );
      });

      test("ambiguous CF -INT.~ throws syntax error", () => {
        expect(() => tokenize("-1.~2")).toThrow(/[Aa]mbiguous/);
        expect(() => tokenize("-2.~1~2~2")).toThrow(/[Aa]mbiguous/);
      });
    });

    describe("numbers without units", () => {
      test("numbers are parsed without units", () => {
        const tokens = tokenize("5 10 3.14");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "5", value: "5", pos: [0, 0, 1] },
            {
              type: "Number",
              original: " 10",
              value: "10",
              pos: [1, 2, 4],
            },
            {
              type: "Number",
              original: " 3.14",
              value: "3.14",
              pos: [4, 5, 9],
            },
          ]),
        );
      });

      test("tilde after number is separate symbol", () => {
        const tokens = tokenize("5~ 3.14~");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "5", value: "5", pos: [0, 0, 1] },
            { type: "Symbol", original: "~", value: "~", pos: [1, 1, 2] },
            {
              type: "Number",
              original: " 3.14",
              value: "3.14",
              pos: [2, 3, 7],
            },
            { type: "Symbol", original: "~", value: "~", pos: [7, 7, 8] },
          ]),
        );
      });
    });

    describe("numbers with algebraic extensions", () => {
      test("imaginary numbers", () => {
        const tokens = tokenize("2~{i} -5~{j} 3.14~{i}");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "2", value: "2", pos: [0, 0, 1] },
            { type: "Symbol", original: "~{", value: "~{", pos: [1, 1, 3] },
            {
              type: "Identifier",
              original: "i",
              value: "i",
              kind: "User",
              pos: [3, 3, 4],
            },
            { type: "Symbol", original: "}", value: "}", pos: [4, 4, 5] },
            {
              type: "Number",
              original: " -5",
              value: "-5",
              pos: [5, 6, 8],
            },
            { type: "Symbol", original: "~{", value: "~{", pos: [8, 8, 10] },
            {
              type: "Identifier",
              original: "j",
              value: "j",
              kind: "User",
              pos: [10, 10, 11],
            },
            { type: "Symbol", original: "}", value: "}", pos: [11, 11, 12] },
            {
              type: "Number",
              original: " 3.14",
              value: "3.14",
              pos: [12, 13, 17],
            },
            { type: "Symbol", original: "~{", value: "~{", pos: [17, 17, 19] },
            {
              type: "Identifier",
              original: "i",
              value: "i",
              kind: "User",
              pos: [19, 19, 20],
            },
            { type: "Symbol", original: "}", value: "}", pos: [20, 20, 21] },
          ]),
        );
      });

      test("algebraic extensions", () => {
        const tokens = tokenize("1~{sqrt2} 3/4~{sqrt3}");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "1",
              value: "1",
              pos: [0, 0, 1],
            },
            { type: "Symbol", original: "~{", value: "~{", pos: [1, 1, 3] },
            {
              type: "Identifier",
              original: "sqrt2",
              value: "sqrt2",
              kind: "User",
              pos: [3, 3, 8],
            },
            { type: "Symbol", original: "}", value: "}", pos: [8, 8, 9] },
            {
              type: "Number",
              original: " 3/4",
              value: "3/4",
              pos: [9, 10, 13],
            },
            { type: "Symbol", original: "~{", value: "~{", pos: [13, 13, 15] },
            {
              type: "Identifier",
              original: "sqrt3",
              value: "sqrt3",
              kind: "User",
              pos: [15, 15, 20],
            },
            { type: "Symbol", original: "}", value: "}", pos: [20, 20, 21] },
          ]),
        );
      });
    });

    describe("decimal intervals", () => {
      test("decimal with interval notation", () => {
        const tokens = tokenize("1.23[56:67] 0.5[+1,-2]");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "Number",
              original: "1.23[56:67]",
              value: "1.23[56:67]",
              pos: [0, 0, 11],
            },
            {
              type: "Number",
              original: " 0.5[+1,-2]",
              value: "0.5[+1,-2]",
              pos: [11, 12, 22],
            },
          ]),
        );
      });
    });
  });

  describe("String tokens", () => {
    describe("double quotes", () => {
      test("simple quoted strings", () => {
        const tokens = tokenize('"hello" "world"');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '"hello"',
              value: "hello",
              kind: "quote",
              pos: [0, 1, 7],
            },
            {
              type: "String",
              original: ' "world"',
              value: "world",
              kind: "quote",
              pos: [7, 9, 15],
            },
          ]),
        );
      });

      test("quoted strings preserve raw content", () => {
        const tokens = tokenize('" hello " " world  "');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '" hello "',
              value: " hello ",
              kind: "quote",
              pos: [0, 1, 9],
            },
            {
              type: "String",
              original: ' " world  "',
              value: " world  ",
              kind: "quote",
              pos: [9, 11, 20],
            },
          ]),
        );
      });

      test("quoted strings with spaces preserve exact content", () => {
        const tokens = tokenize('" " "  " "   "');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '" "',
              value: " ",
              kind: "quote",
              pos: [0, 1, 3],
            },
            {
              type: "String",
              original: ' "  "',
              value: "  ",
              kind: "quote",
              pos: [3, 5, 8],
            },
            {
              type: "String",
              original: ' "   "',
              value: "   ",
              kind: "quote",
              pos: [8, 10, 14],
            },
          ]),
        );
      });

      test("unmatched empty quotes throw error", () => {
        expect(() => tokenize('""')).toThrow("Delimiter unmatched at line 1:1. Need");
      });

      test("multiple quote delimiters", () => {
        const tokens = tokenize('""complex string"" """even more complex"""');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '""complex string""',
              value: "complex string",
              kind: "quote",
              pos: [0, 2, 18],
            },
            {
              type: "String",
              original: ' """even more complex"""',
              value: "even more complex",
              kind: "quote",
              pos: [18, 22, 42],
            },
          ]),
        );
      });

      test("unmatched empty quotes throw error", () => {
        expect(() => tokenize('""')).toThrow("Delimiter unmatched at line 1:1. Need");
      });

      test("multiple quote delimiters", () => {
        const tokens = tokenize('""complex string"" """even more complex"""');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '""complex string""',
              value: "complex string",
              kind: "quote",
              pos: [0, 2, 18],
            },
            {
              type: "String",
              original: ' """even more complex"""',
              value: "even more complex",
              kind: "quote",
              pos: [18, 22, 42],
            },
          ]),
        );
      });

      test("quotes inside different length delimiters", () => {
        const tokens = tokenize('""string with "quotes" inside""');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '""string with "quotes" inside""',
              value: 'string with "quotes" inside',
              kind: "quote",
              pos: [0, 2, 31],
            },
          ]),
        );
      });

      test("strings with newlines", () => {
        const tokens = tokenize('"multi\nline\nstring"');
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: '"multi\nline\nstring"',
              value: "multi\nline\nstring",
              kind: "quote",
              pos: [0, 1, 19],
            },
          ]),
        );
      });
    });

    describe("backticks", () => {
      test("simple backtick strings", () => {
        const tokens = tokenize("`hello` `P(x):x^2+1`");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "`hello`",
              value: "hello",
              kind: "backtick",
              pos: [0, 1, 7],
            },
            {
              type: "String",
              original: " `P(x):x^2+1`",
              value: "P(x):x^2+1",
              kind: "backtick",
              pos: [7, 9, 20],
            },
          ]),
        );
      });

      test("multiple backtick delimiters", () => {
        const tokens = tokenize("``code with ` inside`` ```even more```");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "``code with ` inside``",
              value: "code with ` inside",
              kind: "backtick",
              pos: [0, 2, 22],
            },
            {
              type: "String",
              original: " ```even more```",
              value: "even more",
              kind: "backtick",
              pos: [22, 26, 38],
            },
          ]),
        );
      });

      test("type-notated numbers", () => {
        const tokens = tokenize("`F:6/8` `P(x):2x^2+3x+1`");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "`F:6/8`",
              value: "F:6/8",
              kind: "backtick",
              pos: [0, 1, 7],
            },
            {
              type: "String",
              original: " `P(x):2x^2+3x+1`",
              value: "P(x):2x^2+3x+1",
              kind: "backtick",
              pos: [7, 9, 24],
            },
          ]),
        );
      });
    });

    describe("comments", () => {
      test("line comments", () => {
        const tokens = tokenize("## this is a comment\n## another comment");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "## this is a comment",
              value: " this is a comment",
              kind: "comment",
              pos: [0, 2, 20],
            },
            {
              type: "String",
              original: "\n## another comment",
              value: " another comment",
              kind: "comment",
              pos: [20, 23, 39],
            },
          ]),
        );
      });

      test("multi-line tag comments", () => {
        const tokens = tokenize("##TAG## multi\nline ##TAG##");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "##TAG## multi\nline ##TAG##",
              value: " multi\nline ",
              kind: "comment",
              pos: [0, 7, 26],
            },
          ]),
        );
      });

      test("case-insensitive tag matching", () => {
        const tokens = tokenize("##CamelCase## mixed case ##camelcase##");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "##CamelCase## mixed case ##camelcase##",
              value: " mixed case ",
              kind: "comment",
              pos: [0, 13, 38],
            },
          ]),
        );
      });

      test("nested-style comments with different tags", () => {
        const tokens = tokenize("##OUTER## outer ##INNER## inner ##INNER## outer ##OUTER##");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "##OUTER## outer ##INNER## inner ##INNER## outer ##OUTER##",
              value: " outer ##INNER## inner ##INNER## outer ",
              kind: "comment",
              pos: [0, 9, 57],
            },
          ]),
        );
      });

      test("## with space is a line comment, not a tag", () => {
        const tokens = tokenize("## tag ## this is just a line comment");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "## tag ## this is just a line comment",
              value: " tag ## this is just a line comment",
              kind: "comment",
              pos: [0, 2, 37],
            },
          ]),
        );
      });

      test("unclosed multi-line comment throws error with line:col", () => {
        expect(() => tokenize("##TAG## forgotten close")).toThrow(
          'Unclosed multi-line comment with tag "TAG" at line 1:1',
        );
      });

      test("block comments", () => {
        const tokens = tokenize("/* simple block */ /** doc comment **/");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "/* simple block */",
              value: " simple block ",
              kind: "comment",
              pos: [0, 2, 18],
            },
            {
              type: "String",
              original: " /** doc comment **/",
              value: " doc comment ",
              kind: "comment",
              pos: [18, 22, 38],
            },
          ]),
        );
      });

      test("nested star count in comments", () => {
        const tokens = tokenize("/*** comment with ** inside ***/");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "/*** comment with ** inside ***/",
              value: " comment with ** inside ",
              kind: "comment",
              pos: [0, 4, 32],
            },
          ]),
        );
      });

      test("multiline block comments", () => {
        const tokens = tokenize("/*\nmultiline\ncomment\n*/");
        expect(tokens).toEqual(
          withEnd([
            {
              type: "String",
              original: "/*\nmultiline\ncomment\n*/",
              value: "\nmultiline\ncomment\n",
              kind: "comment",
              pos: [0, 2, 23],
            },
          ]),
        );
      });
    });

    describe("unit operators", () => {
      test("scientific unit operator ~[", () => {
        const tokens = tokenize("3~[m] 5~[kg/s^2]");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3", value: "3", pos: [0, 0, 1] },
            { type: "Symbol", original: "~[", value: "~[", pos: [1, 1, 3] },
            {
              type: "Identifier",
              original: "m",
              value: "m",
              kind: "User",
              pos: [3, 3, 4],
            },
            { type: "Symbol", original: "]", value: "]", pos: [4, 4, 5] },
            { type: "Number", original: " 5", value: "5", pos: [5, 6, 7] },
            { type: "Symbol", original: "~[", value: "~[", pos: [7, 7, 9] },
            {
              type: "Identifier",
              original: "kg",
              value: "kg",
              kind: "User",
              pos: [9, 9, 11],
            },
            { type: "Symbol", original: "/", value: "/", pos: [11, 11, 12] },
            {
              type: "Identifier",
              original: "s",
              value: "s",
              kind: "User",
              pos: [12, 12, 13],
            },
            { type: "Symbol", original: "^", value: "^", pos: [13, 13, 14] },
            { type: "Number", original: "2", value: "2", pos: [14, 14, 15] },
            { type: "Symbol", original: "]", value: "]", pos: [15, 15, 16] },
          ]),
        );
      });

      test("mathematical unit operator ~{", () => {
        const tokens = tokenize("2~{i} 1~{sqrt2} 3~{pi}");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "2", value: "2", pos: [0, 0, 1] },
            { type: "Symbol", original: "~{", value: "~{", pos: [1, 1, 3] },
            {
              type: "Identifier",
              original: "i",
              value: "i",
              kind: "User",
              pos: [3, 3, 4],
            },
            { type: "Symbol", original: "}", value: "}", pos: [4, 4, 5] },
            { type: "Number", original: " 1", value: "1", pos: [5, 6, 7] },
            { type: "Symbol", original: "~{", value: "~{", pos: [7, 7, 9] },
            {
              type: "Identifier",
              original: "sqrt2",
              value: "sqrt2",
              kind: "User",
              pos: [9, 9, 14],
            },
            { type: "Symbol", original: "}", value: "}", pos: [14, 14, 15] },
            { type: "Number", original: " 3", value: "3", pos: [15, 16, 17] },
            { type: "Symbol", original: "~{", value: "~{", pos: [17, 17, 19] },
            {
              type: "Identifier",
              original: "pi",
              value: "pi",
              kind: "User",
              pos: [19, 19, 21],
            },
            { type: "Symbol", original: "}", value: "}", pos: [21, 21, 22] },
          ]),
        );
      });
    });
  });

  describe("Symbol tokens", () => {
    describe("assignment and equations", () => {
      test("assignment operators", () => {
        const tokens = tokenize(":=: :>=: :<=: :>: :<: :=> :=");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: ":=:", value: ":=:", pos: [0, 0, 3] },
            {
              type: "Symbol",
              original: " :>=:",
              value: ":>=:",
              pos: [3, 4, 8],
            },
            {
              type: "Symbol",
              original: " :<=:",
              value: ":<=:",
              pos: [8, 9, 13],
            },
            {
              type: "Symbol",
              original: " :>:",
              value: ":>:",
              pos: [13, 14, 17],
            },
            {
              type: "Symbol",
              original: " :<:",
              value: ":<:",
              pos: [17, 18, 21],
            },
            {
              type: "Symbol",
              original: " :=>",
              value: ":=>",
              pos: [21, 22, 25],
            },
            { type: "Symbol", original: " :=", value: ":=", pos: [25, 26, 28] },
          ]),
        );
      });

      test("boolean operators", () => {
        const tokens = tokenize("=== ?= ?|");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "===", value: "===", pos: [0, 0, 3] },
            { type: "Symbol", original: " ?=", value: "?=", pos: [3, 4, 6] },
            { type: "Symbol", original: " ?|", value: "?|", pos: [6, 7, 9] },
          ]),
        );
      });
    });

    describe("pipe operators", () => {
      test("pipe operators", () => {
        const tokens = tokenize("||> |>> |>: |>? |+ |* |: |; |^ |^: |?");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "||>", value: "||>", pos: [0, 0, 3] },
            { type: "Symbol", original: " |>>", value: "|>>", pos: [3, 4, 7] },
            { type: "Symbol", original: " |>:", value: "|>:", pos: [7, 8, 11] },
            {
              type: "Symbol",
              original: " |>?",
              value: "|>?",
              pos: [11, 12, 15],
            },
            { type: "Symbol", original: " |+", value: "|+", pos: [15, 16, 18] },
            { type: "Symbol", original: " |*", value: "|*", pos: [18, 19, 21] },
            { type: "Symbol", original: " |:", value: "|:", pos: [21, 22, 24] },
            { type: "Symbol", original: " |;", value: "|;", pos: [24, 25, 27] },
            { type: "Symbol", original: " |^", value: "|^", pos: [27, 28, 30] },
            {
              type: "Symbol",
              original: " |^:",
              value: "|^:",
              pos: [30, 31, 34],
            },
            { type: "Symbol", original: " |?", value: "|?", pos: [34, 35, 37] },
          ]),
        );
      });
    });

    describe("division and modulo", () => {
      test("division operators", () => {
        const tokens = tokenize("/% /^ /~");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "/%", value: "/%", pos: [0, 0, 2] },
            { type: "Symbol", original: " /^", value: "/^", pos: [2, 3, 5] },
            { type: "Symbol", original: " /~", value: "/~", pos: [5, 6, 8] },
          ]),
        );
      });

      test("division combo-assignment operators", () => {
        const tokens = tokenize("/^= /~= /\\=");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "/^=", value: "/^=", pos: [0, 0, 3] },
            { type: "Symbol", original: " /~=", value: "/~=", pos: [3, 4, 7] },
            { type: "Symbol", original: " /\\=", value: "/\\=", pos: [7, 8, 11] },
          ]),
        );
      });
    });

    describe("combo assignment operators", () => {
      test("set and concat combo-assignment operators", () => {
        const tokens = tokenize("++= \\/= \\= **=");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "++=", value: "++=", pos: [0, 0, 3] },
            { type: "Symbol", original: " \\/=", value: "\\/=", pos: [3, 4, 7] },
            { type: "Symbol", original: " \\=", value: "\\=", pos: [7, 8, 10] },
            { type: "Symbol", original: " **=", value: "**=", pos: [10, 11, 14] },
          ]),
        );
      });
    });

    describe("interval operators", () => {
      test("interval operators", () => {
        const tokens = tokenize("::+ :~/ :/:  :~ :/% :: :+ :%");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "::+", value: "::+", pos: [0, 0, 3] },
            { type: "Symbol", original: " :~/", value: ":~/", pos: [3, 4, 7] },
            { type: "Symbol", original: " :/:", value: ":/:", pos: [7, 8, 11] },
            {
              type: "Symbol",
              original: "  :~",
              value: ":~",
              pos: [11, 13, 15],
            },
            {
              type: "Symbol",
              original: " :/%",
              value: ":/%",
              pos: [15, 16, 19],
            },
            { type: "Symbol", original: " ::", value: "::", pos: [19, 20, 22] },
            { type: "Symbol", original: " :+", value: ":+", pos: [22, 23, 25] },
            { type: "Symbol", original: " :%", value: ":%", pos: [25, 26, 28] },
          ]),
        );
      });
    });

    describe("basic operators", () => {
      test("arithmetic operators", () => {
        const tokens = tokenize("+ - * / ^ ** %");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "+", value: "+", pos: [0, 0, 1] },
            { type: "Symbol", original: " -", value: "-", pos: [1, 2, 3] },
            { type: "Symbol", original: " *", value: "*", pos: [3, 4, 5] },
            { type: "Symbol", original: " /", value: "/", pos: [5, 6, 7] },
            { type: "Symbol", original: " ^", value: "^", pos: [7, 8, 9] },
            { type: "Symbol", original: " **", value: "**", pos: [9, 10, 12] },
            { type: "Symbol", original: " %", value: "%", pos: [12, 13, 14] },
          ]),
        );
      });

      test("comparison operators", () => {
        const tokens = tokenize("<= >= == != << >>");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "<=", value: "<=", pos: [0, 0, 2] },
            { type: "Symbol", original: " >=", value: ">=", pos: [2, 3, 5] },
            { type: "Symbol", original: " ==", value: "==", pos: [5, 6, 8] },
            { type: "Symbol", original: " !=", value: "!=", pos: [8, 9, 11] },
            { type: "Symbol", original: " <<", value: "<<", pos: [11, 12, 14] },
            { type: "Symbol", original: " >>", value: ">>", pos: [14, 15, 17] },
          ]),
        );
      });

      test("unit operators", () => {
        const tokens = tokenize("~[ ~{ %");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "~[", value: "~[", pos: [0, 0, 2] },
            { type: "Symbol", original: " ~{", value: "~{", pos: [2, 3, 5] },
            { type: "Symbol", original: " %", value: "%", pos: [5, 6, 7] },
          ]),
        );
      });
    });

    describe("brackets and punctuation", () => {
      test("brackets", () => {
        const tokens = tokenize("( ) [ ] { }");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: "(", value: "(", pos: [0, 0, 1] },
            { type: "Symbol", original: " )", value: ")", pos: [1, 2, 3] },
            { type: "Symbol", original: " [", value: "[", pos: [3, 4, 5] },
            { type: "Symbol", original: " ]", value: "]", pos: [5, 6, 7] },
            { type: "Symbol", original: " {", value: "{", pos: [7, 8, 9] },
            { type: "Symbol", original: " }", value: "}", pos: [9, 10, 11] },
          ]),
        );
      });

      test("punctuation", () => {
        const tokens = tokenize(", ; . @ _ ~");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: ",", value: ",", pos: [0, 0, 1] },
            { type: "Symbol", original: " ;", value: ";", pos: [1, 2, 3] },
            { type: "Symbol", original: " .", value: ".", pos: [3, 4, 5] },
            { type: "Symbol", original: " @", value: "@", pos: [5, 6, 7] },
            { type: "Symbol", original: " _", value: "_", pos: [7, 8, 9] },
            { type: "Symbol", original: " ~", value: "~", pos: [9, 10, 11] },
          ]),
        );
      });
    });

    describe("maximal munch principle", () => {
      test("longer symbols take precedence", () => {
        const tokens = tokenize(":=: :>: :<=:");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: ":=:", value: ":=:", pos: [0, 0, 3] },
            { type: "Symbol", original: " :>:", value: ":>:", pos: [3, 4, 7] },
            {
              type: "Symbol",
              original: " :<=:",
              value: ":<=:",
              pos: [7, 8, 12],
            },
          ]),
        );
      });

      test("complex symbol combinations", () => {
        const tokens = tokenize(":=:||>|>>");
        expect(tokens).toEqual(
          withEnd([
            { type: "Symbol", original: ":=:", value: ":=:", pos: [0, 0, 3] },
            { type: "Symbol", original: "||>", value: "||>", pos: [3, 3, 6] },
            { type: "Symbol", original: "|>>", value: "|>>", pos: [6, 6, 9] },
          ]),
        );
      });

      test("symbol vs number disambiguation", () => {
        const tokens = tokenize("3 - 4 . 5");
        expect(tokens).toEqual(
          withEnd([
            { type: "Number", original: "3", value: "3", pos: [0, 0, 1] },
            { type: "Symbol", original: " -", value: "-", pos: [1, 2, 3] },
            { type: "Number", original: " 4", value: "4", pos: [3, 4, 5] },
            { type: "Symbol", original: " .", value: ".", pos: [5, 6, 7] },
            { type: "Number", original: " 5", value: "5", pos: [7, 8, 9] },
          ]),
        );
      });
    });
  });

  describe("Complex expressions", () => {
    test("mathematical expression", () => {
      const tokens = tokenize("x^2 + 3*y - 1/2");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: "^", value: "^", pos: [1, 1, 2] },
          { type: "Number", original: "2", value: "2", pos: [2, 2, 3] },
          { type: "Symbol", original: " +", value: "+", pos: [3, 4, 5] },
          { type: "Number", original: " 3", value: "3", pos: [5, 6, 7] },
          { type: "Symbol", original: "*", value: "*", pos: [7, 7, 8] },
          {
            type: "Identifier",
            original: "y",
            value: "y",
            kind: "User",
            pos: [8, 8, 9],
          },
          { type: "Symbol", original: " -", value: "-", pos: [9, 10, 11] },
          { type: "Number", original: " 1/2", value: "1/2", pos: [11, 12, 15] },
        ]),
      );
    });

    test("function assignment", () => {
      const tokens = tokenize("Sin(x) := x^2 + 1");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "Sin",
            value: "SIN",
            kind: "System",
            pos: [0, 0, 3],
          },
          { type: "Symbol", original: "(", value: "(", pos: [3, 3, 4] },
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [4, 4, 5],
          },
          { type: "Symbol", original: ")", value: ")", pos: [5, 5, 6] },
          { type: "Symbol", original: " :=", value: ":=", pos: [6, 7, 9] },
          {
            type: "Identifier",
            original: " x",
            value: "x",
            kind: "User",
            pos: [9, 10, 11],
          },
          { type: "Symbol", original: "^", value: "^", pos: [11, 11, 12] },
          { type: "Number", original: "2", value: "2", pos: [12, 12, 13] },
          { type: "Symbol", original: " +", value: "+", pos: [13, 14, 15] },
          { type: "Number", original: " 1", value: "1", pos: [15, 16, 17] },
        ]),
      );
    });

    test("number with hash prefix", () => {
      const tokens = tokenize("#123");
      expect(tokens).toEqual(
        withEnd([
          { type: "Symbol", original: "#", value: "#", pos: [0, 0, 1] },
          { type: "Number", original: "123", value: "123", pos: [1, 1, 4] },
        ]),
      );
    });

    test("mixed tokens with comments", () => {
      const tokens = tokenize("x = 5; ## set x to 5\ny = 10; ## set y to 10");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: " =", value: "=", pos: [1, 2, 3] },
          { type: "Number", original: " 5", value: "5", pos: [3, 4, 5] },
          { type: "Symbol", original: ";", value: ";", pos: [5, 5, 6] },
          {
            type: "String",
            original: " ## set x to 5",
            value: " set x to 5",
            kind: "comment",
            pos: [6, 9, 20],
          },
          {
            type: "Identifier",
            original: "\ny",
            value: "y",
            kind: "User",
            pos: [20, 21, 22],
          },
          { type: "Symbol", original: " =", value: "=", pos: [22, 23, 24] },
          { type: "Number", original: " 10", value: "10", pos: [24, 25, 27] },
          { type: "Symbol", original: ";", value: ";", pos: [27, 27, 28] },
          {
            type: "String",
            original: " ## set y to 10",
            value: " set y to 10",
            kind: "comment",
            pos: [28, 31, 43],
          },
        ]),
      );
    });

    test("interval with mixed types", () => {
      const tokens = tokenize("1..3/4:2.5#6");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Number",
            original: "1..3/4:2.5#6",
            value: "1..3/4:2.5#6",
            pos: [0, 0, 12],
          },
        ]),
      );
    });

    test("mixed tokens with comments", () => {
      const tokens = tokenize("x + 2 /* addition */ ## line comment\n:= 5");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: " +", value: "+", pos: [1, 2, 3] },
          { type: "Number", original: " 2", value: "2", pos: [3, 4, 5] },
          {
            type: "String",
            original: " /* addition */",
            value: " addition ",
            kind: "comment",
            pos: [5, 8, 20],
          },
          {
            type: "String",
            original: " ## line comment",
            value: " line comment",
            kind: "comment",
            pos: [20, 23, 36],
          },
          { type: "Symbol", original: "\n:=", value: ":=", pos: [36, 37, 39] },
          { type: "Number", original: " 5", value: "5", pos: [39, 40, 41] },
        ]),
      );
    });

    test("string with typed literal", () => {
      const tokens = tokenize("`F:3/4` + 2.5");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "String",
            original: "`F:3/4`",
            value: "F:3/4",
            kind: "backtick",
            pos: [0, 1, 7],
          },
          { type: "Symbol", original: " +", value: "+", pos: [7, 8, 9] },
          { type: "Number", original: " 2.5", value: "2.5", pos: [9, 10, 13] },
        ]),
      );
    });

    test("pipe operation sequence", () => {
      const tokens = tokenize("[1,2,3] |>> Sin |>? x -> x > 0");
      expect(tokens).toEqual(
        withEnd([
          { type: "Symbol", original: "[", value: "[", pos: [0, 0, 1] },
          { type: "Number", original: "1", value: "1", pos: [1, 1, 2] },
          { type: "Symbol", original: ",", value: ",", pos: [2, 2, 3] },
          { type: "Number", original: "2", value: "2", pos: [3, 3, 4] },
          { type: "Symbol", original: ",", value: ",", pos: [4, 4, 5] },
          { type: "Number", original: "3", value: "3", pos: [5, 5, 6] },
          { type: "Symbol", original: "]", value: "]", pos: [6, 6, 7] },
          { type: "Symbol", original: " |>>", value: "|>>", pos: [7, 8, 11] },
          {
            type: "Identifier",
            original: " Sin",
            value: "SIN",
            kind: "System",
            pos: [11, 12, 15],
          },
          { type: "Symbol", original: " |>?", value: "|>?", pos: [15, 16, 19] },
          {
            type: "Identifier",
            original: " x",
            value: "x",
            kind: "User",
            pos: [19, 20, 21],
          },
          { type: "Symbol", original: " ->", value: "->", pos: [21, 22, 24] },
          {
            type: "Identifier",
            original: " x",
            value: "x",
            kind: "User",
            pos: [24, 25, 26],
          },
          { type: "Symbol", original: " >", value: ">", pos: [26, 27, 28] },
          { type: "Number", original: " 0", value: "0", pos: [28, 29, 30] },
        ]),
      );
    });
  });

  describe("Edge cases and error handling", () => {
    test("unmatched quotes throw error", () => {
      expect(() => tokenize('x + "unclosed string')).toThrow(
        "Delimiter unmatched at line 1:5. Need",
      );
    });

    test("unmatched backticks throw error", () => {
      expect(() => tokenize("x + `unclosed backtick")).toThrow(
        "Delimiter unmatched at line 1:5. Need",
      );
    });

    test("unmatched block comment throws error", () => {
      expect(() => tokenize("x + /* unclosed comment")).toThrow(
        "Delimiter unmatched at line 1:5. Need",
      );
    });

    test("unit operators are tokenized separately", () => {
      const tokens = tokenize("x ~[ y ~{");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: " ~[", value: "~[", pos: [1, 2, 4] },
          {
            type: "Identifier",
            original: " y",
            value: "y",
            kind: "User",
            pos: [4, 5, 6],
          },
          { type: "Symbol", original: " ~{", value: "~{", pos: [6, 7, 9] },
        ]),
      );
    });

    test("minus not immediately followed by digit is symbol", () => {
      const tokens = tokenize("x - y");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: " -", value: "-", pos: [1, 2, 3] },
          {
            type: "Identifier",
            original: " y",
            value: "y",
            kind: "User",
            pos: [3, 4, 5],
          },
        ]),
      );
    });

    test("tilde is separate from numbers", () => {
      const tokens = tokenize("3.2~ m ~");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Number",
            original: "3.2",
            value: "3.2",
            pos: [0, 0, 3],
          },
          { type: "Symbol", original: "~", value: "~", pos: [3, 3, 4] },
          {
            type: "Identifier",
            original: " m",
            value: "m",
            kind: "User",
            pos: [4, 5, 6],
          },
          { type: "Symbol", original: " ~", value: "~", pos: [6, 7, 8] },
        ]),
      );
    });

    test("minus with space before digit is symbol", () => {
      const tokens = tokenize("- 5");
      expect(tokens).toEqual(
        withEnd([
          { type: "Symbol", original: "-", value: "-", pos: [0, 0, 1] },
          { type: "Number", original: " 5", value: "5", pos: [1, 2, 3] },
        ]),
      );
    });

    test("number patterns with spaces break into separate tokens", () => {
      // .. is now the double-dot operator, so "1 .. 3 / 4" tokenizes as: 1 .. 3 / 4
      const tokens = tokenize("1 .. 3 / 4");
      expect(tokens).toEqual(
        withEnd([
          { type: "Number", original: "1", value: "1", pos: [0, 0, 1] },
          { type: "Symbol", original: " ..", value: "..", pos: [1, 2, 4] },
          { type: "Number", original: " 3", value: "3", pos: [4, 5, 6] },
          { type: "Symbol", original: " /", value: "/", pos: [6, 7, 8] },
          { type: "Number", original: " 4", value: "4", pos: [8, 9, 10] },
        ]),
      );
    });

    test("unit operators work with spaces", () => {
      const tokens = tokenize("3.2 ~[ m ]");
      expect(tokens).toEqual(
        withEnd([
          { type: "Number", original: "3.2", value: "3.2", pos: [0, 0, 3] },
          { type: "Symbol", original: " ~[", value: "~[", pos: [3, 4, 6] },
          {
            type: "Identifier",
            original: " m",
            value: "m",
            kind: "User",
            pos: [6, 7, 8],
          },
          { type: "Symbol", original: " ]", value: "]", pos: [8, 9, 10] },
        ]),
      );
    });

    test("leading decimal numbers are recognized", () => {
      const tokens = tokenize(".5 + x");
      expect(tokens).toEqual([
        { type: "Number", original: ".5", value: ".5", pos: [0, 0, 2] },
        { type: "Symbol", original: " +", value: "+", pos: [2, 3, 4] },
        {
          type: "Identifier",
          original: " x",
          value: "x",
          kind: "User",
          pos: [4, 5, 6],
        },
        { type: "End", original: "", value: null, pos: [6, 6, 6] },
      ]);
    });

    test("unicode identifiers", () => {
      const tokens = tokenize("αβγ δεζ Αβγ Δεζ");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "αβγ",
            value: "αβγ",
            kind: "User",
            pos: [0, 0, 3],
          },
          {
            type: "Identifier",
            original: " δεζ",
            value: "δεζ",
            kind: "User",
            pos: [3, 4, 7],
          },
          {
            type: "Identifier",
            original: " Αβγ",
            value: "ΑΒΓ",
            kind: "System",
            pos: [7, 8, 11],
          },
          {
            type: "Identifier",
            original: " Δεζ",
            value: "ΔΕΖ",
            kind: "System",
            pos: [11, 12, 15],
          },
        ]),
      );
    });

    test("whitespace input produces End token", () => {
      const tokens = tokenize("   ");
      expect(tokens).toEqual([
        { type: "End", original: "   ", value: null, pos: [0, 0, 3] },
      ]);
    });

    test("single character tokens", () => {
      const tokens = tokenize("x+y*z/w^v");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "Identifier",
            original: "x",
            value: "x",
            kind: "User",
            pos: [0, 0, 1],
          },
          { type: "Symbol", original: "+", value: "+", pos: [1, 1, 2] },
          {
            type: "Identifier",
            original: "y",
            value: "y",
            kind: "User",
            pos: [2, 2, 3],
          },
          { type: "Symbol", original: "*", value: "*", pos: [3, 3, 4] },
          {
            type: "Identifier",
            original: "z",
            value: "z",
            kind: "User",
            pos: [4, 4, 5],
          },
          { type: "Symbol", original: "/", value: "/", pos: [5, 5, 6] },
          {
            type: "Identifier",
            original: "w",
            value: "w",
            kind: "User",
            pos: [6, 6, 7],
          },
          { type: "Symbol", original: "^", value: "^", pos: [7, 7, 8] },
          {
            type: "Identifier",
            original: "v",
            value: "v",
            kind: "User",
            pos: [8, 8, 9],
          },
        ]),
      );
    });
  });

  describe("Token properties", () => {
    test("all tokens have required properties", () => {
      const tokens = tokenize('x + 2.5 "hello" /*comment*/');
      expect(tokens[tokens.length - 1].type).toBe("End");
      tokens.forEach((token) => {
        expect(token).toHaveProperty("type");
        expect(token).toHaveProperty("original");
        expect(token).toHaveProperty("value");
        expect(["Identifier", "Number", "String", "Symbol", "End"]).toContain(
          token.type,
        );

        if (token.type === "Identifier" || token.type === "String") {
          expect(token).toHaveProperty("kind");
        }
      });
    });

    test("identifier kinds are correct", () => {
      const tokens = tokenize("x Sin myVar COS");
      expect(tokens[0].kind).toBe("User");
      expect(tokens[1].kind).toBe("System");
      expect(tokens[2].kind).toBe("User");
      expect(tokens[3].kind).toBe("System");
    });

    test("string kinds are correct", () => {
      const tokens = tokenize('"quote" `backtick` /*comment*/');
      expect(tokens[0].kind).toBe("quote");
      expect(tokens[1].kind).toBe("backtick");
      expect(tokens[2].kind).toBe("comment");
    });

    test("original concatenation preserves input", () => {
      const inputs = [
        "x + 2",
        "Sin(x) := x^2",
        "3/4 + 1..2/3",
        '"hello world" + `F:3/4`',
        "/* comment */ ## line comment",
        "1.23E-5~m/s~ + αβγ",
        ".5 + -.25",
      ];

      inputs.forEach((input) => {
        const tokens = tokenize(input);
        const reconstructed = tokens.map((t) => t.original).join("");
        expect(reconstructed).toBe(input);
      });
    });
  });

  describe("Regex Literals", () => {
    test("basic regex literal", () => {
      const tokens = tokenize("{/pattern/}");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "RegexLiteral",
            original: "{/pattern/}",
            pattern: "pattern",
            flags: "",
            mode: "ONE",
            pos: [0, 0, 11],
          },
        ])
      );
    });

    test("regex with spaces and flags", () => {
      const tokens = tokenize("{ /a.*b/ig }");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "RegexLiteral",
            original: "{ /a.*b/ig }",
            pattern: "a.*b",
            flags: "ig",
            mode: "ONE",
            pos: [0, 0, 12],
          },
        ])
      );
    });

    test("regex with modes", () => {
      const tokens = tokenize("{/test/i?} {/test/*} {/test/:}");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "RegexLiteral",
            original: "{/test/i?}",
            pattern: "test",
            flags: "i",
            mode: "TEST",
            pos: [0, 0, 10],
          },
          {
            type: "RegexLiteral",
            original: " {/test/*}",
            pattern: "test",
            flags: "",
            mode: "ALL",
            pos: [10, 11, 20],
          },
          {
            type: "RegexLiteral",
            original: " {/test/:}",
            pattern: "test",
            flags: "",
            mode: "ITER",
            pos: [20, 21, 30],
          },
        ])
      );
    });

    test("regex with escaped slash", () => {
      const tokens = tokenize("{/a\\/b/}");
      expect(tokens).toEqual(
        withEnd([
          {
            type: "RegexLiteral",
            original: "{/a\\/b/}",
            pattern: "a\\/b",
            flags: "",
            mode: "ONE",
            pos: [0, 0, 8],
          },
        ])
      );
    });

    test("unclosed regex throws error", () => {
      expect(() => tokenize("{/pattern")).toThrow("Unterminated regex literal");
      expect(() => tokenize("{/pattern/")).toThrow("Unterminated regex literal");
    });
  });

  describe("RiX base I/O tokens", () => {
    test("_> and <_ tokenize as single symbols", () => {
      const tokens = tokenize('5 _> 0b; "101" <_ 0b;');
      const symbols = tokens.filter((t) => t.type === "Symbol").map((t) => t.value);
      expect(symbols.includes("_>")).toBe(true);
      expect(symbols.includes("<_")).toBe(true);
    });

    test("uppercase prefixed quoted literal tokenizes as Number", () => {
      const tokens = tokenize('0A"4A.F"');
      const numbers = tokens.filter((t) => t.type === "Number");
      expect(numbers.length).toBe(1);
      expect(numbers[0].value).toBe('0A"4A.F"');
    });

    test("uppercase prefixed unquoted literal tokenizes as Number", () => {
      const tokens = tokenize("0A4A.F");
      const numbers = tokens.filter((t) => t.type === "Number");
      expect(numbers.length).toBe(1);
      expect(numbers[0].value).toBe("0A4A.F");
    });

    test("prefixed continued fraction tokenizes as Number", () => {
      const tokens = tokenize("0b101.~11~10");
      const numbers = tokens.filter((t) => t.type === "Number");
      expect(numbers.length).toBe(1);
      expect(numbers[0].value).toBe("0b101.~11~10");
    });

    test("explicit prefixed continued fraction tokenizes as Number", () => {
      const tokens = tokenize("~0b101.~11~10");
      const numbers = tokens.filter((t) => t.type === "Number");
      expect(numbers.length).toBe(1);
      expect(numbers[0].value).toBe("~0b101.~11~10");
    });
  });

  describe("Brace sigil space/name rule", () => {
    test("{@ without space throws error", () => {
      expect(() => tokenize("{@a += x}")).toThrow(/must be followed by a space/);
    });

    test("{@ with space produces anonymous {@ token", () => {
      const tokens = tokenize("{@ a }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe(null);
    });

    test("{@cool@ produces named {@ token with containerName 'cool'", () => {
      const tokens = tokenize("{@cool@ a }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("cool");
    });

    test("{;hot1; produces named {; token with containerName 'hot1'", () => {
      const tokens = tokenize("{;hot1; stmt }");
      const brace = tokens.find((t) => t.value === "{;");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("hot1");
    });

    test("{|name| produces named {| token with containerName 'name'", () => {
      const tokens = tokenize("{|name| 1, 2 |}");
      const brace = tokens.find((t) => t.value === "{|");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("name");
    });

    test("{+ without space throws error", () => {
      expect(() => tokenize("{+1, 2}")).toThrow(/must be followed by a space/);
    });

    test("{+ with space produces {+ token", () => {
      const tokens = tokenize("{+ 1, 2}");
      const brace = tokens.find((t) => t.value === "{+");
      expect(brace).toBeDefined();
    });

    test("{ without space throws error", () => {
      expect(() => tokenize("{expr}")).toThrow(/must be followed by a space/);
    });

    test("{ with space produces plain { token", () => {
      const tokens = tokenize("{ expr }");
      const brace = tokens.find((t) => t.value === "{");
      expect(brace).toBeDefined();
    });

    test("{/regex/flags} is exempt (handled as RegexLiteral)", () => {
      const tokens = tokenize("{/\\d+/g}");
      const regex = tokens.find((t) => t.type === "RegexLiteral");
      expect(regex).toBeDefined();
      expect(regex.pattern).toBe("\\d+");
      expect(regex.flags).toBe("g");
    });

    test("{digit} passes through without error (unit notation)", () => {
      expect(() => tokenize("{2}")).not.toThrow();
      const tokens = tokenize("{2}");
      const sym = tokens.find((t) => t.value === "{");
      expect(sym).toBeDefined();
    });

    test("named container name is lowercased", () => {
      const tokens = tokenize("{@LOOP@ body }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("loop");
    });

    test("{@:100@ stores an explicit loop max", () => {
      const tokens = tokenize("{@:100@ body }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe(null);
      expect(brace.loopMax).toBe(100);
      expect(brace.loopUnlimited).toBeUndefined();
    });

    test("{@cool:100@ stores loop name and max", () => {
      const tokens = tokenize("{@cool:100@ body }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("cool");
      expect(brace.loopMax).toBe(100);
    });

    test("{@::@ stores unlimited loop metadata", () => {
      const tokens = tokenize("{@::@ body }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe(null);
      expect(brace.loopUnlimited).toBe(true);
      expect(brace.loopMax).toBeUndefined();
    });

    test("{@cool::@ stores named unlimited loop metadata", () => {
      const tokens = tokenize("{@cool::@ body }");
      const brace = tokens.find((t) => t.value === "{@");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("cool");
      expect(brace.loopUnlimited).toBe(true);
    });

    test("malformed loop header max is rejected", () => {
      expect(() => tokenize("{@:abc@ body }")).toThrow(/Loop max must be a nonnegative integer literal/);
      expect(() => tokenize("{@cool:@ body }")).toThrow(/Loop max must be a nonnegative integer literal/);
      expect(() => tokenize("{@cool::100@ body }")).toThrow(/Unlimited loop header must end/);
    });

    test("{|| with space produces {|| operator-brace token (not sigil)", () => {
      const tokens = tokenize("{|| 1, 2}");
      const brace = tokens.find((t) => t.value === "{||");
      expect(brace).toBeDefined();
    });

    test("{| with space produces {| sigil token (not operator)", () => {
      const tokens = tokenize("{| 1, 2 |}");
      const brace = tokens.find((t) => t.value === "{|");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe(null);
    });

    test("{:2x3:} produces a named {: token and allows immediate close", () => {
      const tokens = tokenize("{:2x3:}");
      const brace = tokens.find((t) => t.value === "{:");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("2x3");
      expect(tokens.map((t) => t.value)).toEqual(["{:", "}", null]);
    });

    test("{=.. produces the brace-array alias token", () => {
      const tokens = tokenize("{=.. a[1:2] }");
      const brace = tokens.find((t) => t.value === "{..");
      expect(brace).toBeDefined();
    });

    test("{=:2x3: produces the tensor alias token", () => {
      const tokens = tokenize("{=:2x3: a[2,1:3] }");
      const brace = tokens.find((t) => t.value === "{:");
      expect(brace).toBeDefined();
      expect(brace.containerName).toBe("2x3");
    });

    test("{# with space produces anonymous {# token", () => {
      const tokens = tokenize("{# p = x + 1 }");
      const brace = tokens.find((t) => t.value === "{#");
      expect(brace).toBeDefined();
      expect(brace.specHeaderPresent).toBe(false);
    });

    test("{#x,y:p# stores parsed system spec header", () => {
      const tokens = tokenize("{#x,y:p# p = x + y }");
      const brace = tokens.find((t) => t.value === "{#");
      expect(brace).toBeDefined();
      expect(brace.specInputs).toEqual(["x", "y"]);
      expect(brace.specOutputs).toEqual(["p"]);
      expect(brace.specOutputsDeclared).toBe(true);
    });

    test("malformed {# header is rejected", () => {
      expect(() => tokenize("{#x,,y# p = 1 }")).toThrow(/Malformed inputs list in system spec header/);
    });

    test("^^ tokenizes as a single postfix symbol", () => {
      const tokens = tokenize("m^^");
      expect(tokens.map((t) => t.value)).toEqual(["m", "^^", null]);
    });
  });

  describe("Self reference", () => {
    test("$ tokenizes as a symbol and composes with property/call syntax", () => {
      const tokens = tokenize("$.label $(x) $..");
      expect(tokens.map((token) => token.value)).toEqual([
        "$",
        ".",
        "label",
        "$",
        "(",
        "x",
        ")",
        "$",
        "..",
        null,
      ]);
    });
  });
});
