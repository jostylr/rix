/**
 * RiX Lowering Pass: AST → IR
 *
 * Converts parser AST nodes into a flat IR tree of system function calls.
 * Every IR node has the form: { fn: "NAME", args: [...] }
 *
 * This is the bridge between parsing and evaluation.
 */

import { ir } from "./ir.js";

// Operator → system function mapping
const BINARY_OP_MAP = {
  "+": "ADD",
  "-": "SUB",
  "*": "MUL",
  "/": "DIV",
  "//": "INTDIV",
  "%": "MOD",
  "^": "POW",
  "**": "POWPROD",
  "==": "EQ",
  "!=": "NEQ",
  "<": "LT",
  ">": "GT",
  "<=": "LTE",
  ">=": "GTE",
  "===": "SAME_CELL",
  "AND": "AND",
  "&&": "AND",
  "OR": "OR",
  "||": "OR",
  "\\/": "UNION",
  "/\\": "INTERSECT",
  "\\": "SET_DIFF",
  "<>": "SET_SYMDIFF",
  "?": "MEMBER",
  "!?": "NOT_MEMBER",
  "?&": "INTERSECTS",
  "++": "CONCAT",
  "/^": "DIVUP",
  "/~": "DIVROUND",
  "/%": "DIVMOD",
  "?|": "HOLE_COALESCE",
};

/**
 * Lower an array of AST statements into an array of IR nodes.
 */
export function lower(ast) {
  if (!Array.isArray(ast)) {
    return lowerNode(ast);
  }
  return ast.map(lowerNode);
}

/**
 * Lower a single AST node into an IR node.
 */
export function lowerNode(node) {
  if (!node || !node.type) {
    return node;
  }

  const handler = LOWERERS[node.type];
  if (!handler) {
    throw new Error(`Unknown AST node type: ${node.type}`);
  }
  const result = handler(node);
  if (result && typeof result === "object" && !Array.isArray(result) && node.pos) {
    result.pos = node.pos;
  }
  return result;
}

function lowerFunctionBody(node) {
  if (!node || !node.type) {
    return lowerNode(node);
  }

  if (node.type === "Grouping") {
    if (node.expression) {
      return lowerFunctionBody(node.expression);
    }
    return ir("NULL");
  }

  if (node.type === "TernaryOperation") {
    return ir(
      "TERNARY",
      lowerNode(node.condition),
      ir("DEFER", lowerFunctionBody(node.trueExpression)),
      ir("DEFER", node.nullExpression ? lowerFunctionBody(node.nullExpression) : ir("NULL")),
      ir("DEFER", node.undecidedExpression ? lowerFunctionBody(node.undecidedExpression) : ir("UNDECIDED")),
    );
  }

  if (node.type === "Call" && node.target?.type === "SelfRef") {
    const args = lowerCallArgs(node.arguments);
    return ir("TAIL_SELF", ...args);
  }

  if (node.type === "BlockContainer" || node.type === "SystemContainer" || node.type === "AsyncContainer") {
    const elements = node.elements || [];
    const loweredElements = elements.map((element, index) =>
      index === elements.length - 1 ? lowerFunctionBody(element) : lowerNode(element),
    );
    const fn = node.type === "BlockContainer" ? "BLOCK" : node.type === "SystemContainer" ? "SYSTEM" : "ASYNC_SCOPE";
    const hasMeta = (node.imports && node.imports.length > 0) || node.name || node.concurrencyLimit !== undefined;
    if (!hasMeta) {
      return ir(fn, ...loweredElements);
    }
    const meta = {};
    if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
    if (node.name) meta.name = node.name;
    if (node.concurrencyLimit !== undefined) meta.concurrencyLimit = node.concurrencyLimit;
    return ir(fn, meta, ...loweredElements);
  }

  return lowerNode(node);
}

const COMBO_ASSIGN_OP_MAP = {
  "+=": "+",
  "-=": "-",
  "*=": "*",
  "++=": "++",
  "/=": "/",
  "//=": "//",
  "/\\=": "/\\",
  "/^=": "/^",
  "/~=": "/~",
  "%=": "%",
  "^=": "^",
  "**=": "**",
  "\\/=": "\\/",
  "\\=": "\\",
};

function uniformDimension(values, label) {
  if (values.length === 0) return 0;
  const expected = values[0];
  if (!values.every((value) => value === expected)) {
    throw new Error(`Semicolon tensor is ragged along ${label}`);
  }
  return expected;
}

function implicitTensorLayout(structure, rank) {
  const rows = structure || [];
  if (rank < 2 || rows.length === 0) {
    throw new Error("Semicolon tensor requires at least one row");
  }

  const columns = uniformDimension(rows.map((item) => item.row.length), "columns");
  const shape = new Array(rank).fill(1);
  shape[1] = columns;

  if (rank === 2) {
    shape[0] = rows.length;
  } else {
    const rowCounts = [];
    let rowCount = 0;
    for (const item of rows) {
      rowCount += 1;
      if (item.separatorLevel >= 2 || item === rows[rows.length - 1]) {
        rowCounts.push(rowCount);
        rowCount = 0;
      }
    }
    shape[0] = uniformDimension(rowCounts, "rows");

    for (let axis = 2; axis < rank; axis++) {
      const groupCounts = [];
      let groupCount = 1;
      for (const item of rows) {
        if (item.separatorLevel === axis) groupCount += 1;
        if (item.separatorLevel >= axis + 1 || item === rows[rows.length - 1]) {
          groupCounts.push(groupCount);
          groupCount = 1;
        }
      }
      shape[axis] = uniformDimension(groupCounts, `axis ${axis + 1}`);
    }
  }

  const expectedRows = shape[0] * shape.slice(2).reduce((product, size) => product * size, 1);
  if (rows.length !== expectedRows) {
    throw new Error(`Semicolon tensor shape inference expected ${expectedRows} rows, received ${rows.length}`);
  }

  let completedBlock = shape[0];
  for (let index = 0; index < rows.length; index++) {
    let expectedSeparator = 0;
    if (index < rows.length - 1) {
      expectedSeparator = 1;
      completedBlock = shape[0];
      while ((index + 1) % completedBlock === 0 && expectedSeparator < rank - 1) {
        expectedSeparator += 1;
        completedBlock *= shape[expectedSeparator];
      }
    }
    if (rows[index].separatorLevel !== expectedSeparator) {
      throw new Error(
        `Malformed semicolon tensor boundary after row ${index + 1}: expected '${";".repeat(expectedSeparator)}'`,
      );
    }
  }

  const displayElements = rows.flatMap((item) => item.row);
  if (rank === 2 || displayElements.length === 0) return { shape, elements: displayElements };

  const displayShape = [...shape.slice(2).reverse(), shape[0], shape[1]];
  const externalStrides = shape.map((_, axis) =>
    shape.slice(axis + 1).reduce((product, size) => product * size, 1));
  const elements = new Array(displayElements.length);
  for (let linear = 0; linear < displayElements.length; linear++) {
    let remainder = linear;
    const displayCoordinates = displayShape.map((size, axis) => {
      const stride = displayShape.slice(axis + 1).reduce((product, value) => product * value, 1);
      const coordinate = stride === 0 ? 0 : Math.floor(remainder / stride);
      remainder = stride === 0 ? 0 : remainder % stride;
      return coordinate;
    });
    const higher = displayCoordinates.slice(0, -2).reverse();
    const externalCoordinates = [
      displayCoordinates[displayCoordinates.length - 2],
      displayCoordinates[displayCoordinates.length - 1],
      ...higher,
    ];
    const externalIndex = externalCoordinates.reduce(
      (sum, coordinate, axis) => sum + coordinate * externalStrides[axis],
      0,
    );
    elements[externalIndex] = displayElements[linear];
  }
  return { shape, elements };
}

// Per-node-type lowering functions
const LOWERERS = {
  // === Literals & Identifiers ===

  Number(node) {
    if (
      node.value &&
      node.value.includes(":") &&
      !node.value.includes("[")
    ) {
      const parts = node.value.split(":");
      return ir("INTERVAL", ...parts.map(p => ir("LITERAL", p)));
    }
    return ir("LITERAL", node.value);
  },

  String(node) {
    return ir("STRING", node.value);
  },

  InterpolatedString(node) {
    return ir("TEMPLATE_TEXT", node.body);
  },

  DocumentTemplate(node) {
    return ir("DOCUMENT_TEMPLATE", node.body);
  },

  ScriptImportExpression(node) {
    return ir("SCRIPT_IMPORT", {
      path: node.path.value,
      capabilityModifiers: lowerCapabilityModifiers(node.capabilityModifiers || []),
      inputs: lowerBindingSpecs(node.inputs || []),
      outputs: lowerBindingSpecs(node.outputs || []),
    });
  },

  ScriptBindingsDeclaration() {
    throw new Error("Script input/export declarations are only valid as the first or last statement of an imported script");
  },

  RegexLiteral(node) {
    const modeMap = {
      "ONE": 0,
      "TEST": 1,
      "ALL": 2,
      "ITER": 3
    };
    return ir(
      "REGEX",
      ir("STRING", node.pattern),
      ir("STRING", node.flags),
      ir("LITERAL", modeMap[node.mode] || 0)
    );
  },

  NULL() {
    return ir("NULL");
  },

  Hole() {
    return ir("HOLE");
  },

  UndecidedLiteral() {
    return ir("UNDECIDED");
  },

  SemanticHas(node) {
    return ir("SEMANTIC_HAS", lowerNode(node.expression), node.name);
  },

  SemanticConvertSoft(node) {
    return ir("SEMANTIC_CONVERT_SOFT", lowerNode(node.expression), node.typeName);
  },

  SemanticConvertStrict(node) {
    return ir("SEMANTIC_CONVERT_STRICT", lowerNode(node.expression), node.typeName);
  },

  SelfRef() {
    return ir("SELF");
  },

  ParentSelfRef() {
    return ir("PARENT_SELF");
  },

  ReactiveRef(node) {
    return ir("REACTIVE_READ", node.name);
  },

  ReactiveCellRef(node) {
    return ir("REACTIVE_NODE", node.name);
  },

  ReactiveTransaction(node) {
    return ir("REACTIVE_TRANSACTION", ...node.body.elements.map(lowerNode));
  },

  UserIdentifier(node) {
    return ir("RETRIEVE", node.name);
  },

  SystemIdentifier(node) {
    if (node.original && node.original.trim().startsWith("@")) {
      return ir("SYSREF", node.name);
    }
    return ir("RETRIEVE", node.name);
  },

  OuterIdentifier(node) {
    return ir("OUTER_RETRIEVE", node.name);
  },

  SystemFunctionRef(node) {
    return ir("SYSREF", node.name);
  },

  PlaceHolder(node) {
    return ir("PLACEHOLDER", node.place);
  },

  // === Statements ===

  Statement(node) {
    return lowerNode(node.expression);
  },

  SequenceExpression(node) {
    return ir("SEQ", ...node.expressions.map(lowerNode));
  },

  Comment() {
    return ir("NOP");
  },

  PostfixCheckValue() {
    return ir("POSTFIX_CHECK_VALUE");
  },

  PostfixPredicateCheck(node) {
    return ir("POSTFIX_PREDICATE_CHECK", lowerNode(node.expression), lowerNode(node.predicate));
  },

  PostfixTypeCheck(node) {
    return ir("POSTFIX_TYPE_CHECK", lowerNode(node.expression), node.spec);
  },

  PostfixDiagnosticTap(node) {
    const args = lowerCallArgs(node.arguments);
    const expression = lowerNode(node.expression);
    const action = node.action.toLowerCase();
    if (action === "debug") return ir("SYS_CALL", "Debug", ...args, expression);
    if (action === "trace") return ir("SYS_CALL", "Trace", ...args, expression);
    if (action === "info") return ir("SYS_CALL", "InfoValue", ...args, expression);
    if (action === "dump" || action === "log") return ir("SYS_CALL", "Dump", ...args, expression);
    throw new Error(`Unknown postfix diagnostic action: ${node.action}`);
  },

  PostfixFinalizer(node) {
    return ir("POSTFIX_FINALIZER", lowerNode(node.expression), lowerNode(node.handler));
  },

  PostfixFaultRecovery(node) {
    return ir("POSTFIX_FAULT_RECOVERY", lowerNode(node.expression), lowerNode(node.handler));
  },

  // === Arithmetic & Binary Operations ===

  BinaryOperation(node) {
    const op = node.operator;

    // Assignment operators — each produces a different IR node
    if (
      op === "=" || op === ":=" || op === "~=" || op === "::=" || op === "~~="
    ) {
      const leftType = node.left?.type || "";
      if (leftType.startsWith("Destructure")) {
        return ir("DESTRUCTURE_ASSIGN", lowerDestructureTarget(node.left), op, lowerNode(node.right));
      }
    }

    if (op === "=") return lowerAssignment(node, "ASSIGN");
    if (op === ":=") return lowerAssignment(node, "ASSIGN_COPY");
    if (op === "~=") return lowerAssignment(node, "ASSIGN_UPDATE");
    if (op === "::=") return lowerAssignment(node, "ASSIGN_DEEP_COPY");
    if (op === "~~=") return lowerAssignment(node, "ASSIGN_DEEP_UPDATE");

    // Bulk meta merge
    if (op === ".=") {
      return ir("META_MERGE", lowerNode(node.left), lowerNode(node.right));
    }

    // Combo assignment operators — desugar to ~= (cell-preserving update)
    const mathOpStr = COMBO_ASSIGN_OP_MAP[op];
    if (mathOpStr) {
      // De-sugar: x += 1 → x ~= x + 1 (preserves cell identity for aliases)
      const mathAstNode = {
        type: "BinaryOperation",
        operator: mathOpStr,
        left: node.left,
        right: node.right,
        pos: node.pos,
      };

      // Use ~= semantics for variable assignments (cell-preserving update)
      const assignAstNode = {
        type: "BinaryOperation",
        operator: "~=",
        left: node.left,
        right: mathAstNode,
        pos: node.pos,
      };

      return lowerAssignment(assignAstNode, "ASSIGN_UPDATE");
    }
    if (op === ":<:") {
      return ir("ASSERT_LT", lowerNode(node.left), lowerNode(node.right));
    }
    if (op === ":>:") {
      return ir("ASSERT_GT", lowerNode(node.left), lowerNode(node.right));
    }
    if (op === ":>=:") {
      return ir("ASSERT_GTE", lowerNode(node.left), lowerNode(node.right));
    }
    if (op === ":<=:") {
      return ir("ASSERT_LTE", lowerNode(node.left), lowerNode(node.right));
    }

    if (op === ":") {
      const args = [];
      const extractArgs = (n) => {
        if (n && n.type === "BinaryOperation" && n.operator === ":") {
          extractArgs(n.left);
          extractArgs(n.right);
        } else {
          const lowered = lowerNode(n);
          // If it lowered to an INTERVAL IR node, flatten it
          if (lowered && typeof lowered === "object" && lowered.fn === "INTERVAL") {
            args.push(...lowered.args);
          } else {
            args.push(lowered);
          }
        }
      };
      extractArgs(node.left);
      extractArgs(node.right);
      return ir("INTERVAL", ...args);
    }

    // Base conversion operators
    if (op === "_>") {
      return ir("TOBASE", lowerNode(node.left), lowerNode(node.right));
    }
    if (op === "~>") {
      return ir("CERTIFY_FORMAT", lowerNode(node.left), lowerNode(node.right));
    }
    if (op === "<_") {
      return ir("FROMBASE", lowerNode(node.left), lowerNode(node.right));
    }

    // ?= is only valid in parameter default positions, not as a general operator
    if (op === "?=") {
      throw new Error(
        `'?=' is not a comparison operator — use '==' for equality comparison, or use '?=' only in parameter default position (e.g., (x ?= 2) -> ...)`
      );
    }

    // Standard binary ops
    const sysFn = BINARY_OP_MAP[op];
    if (sysFn) {
      return ir(sysFn, lowerNode(node.left), lowerNode(node.right));
    }

    // Pipe variants handled as binary ops
    if (op.startsWith("|")) {
      return ir("PIPE_OP", op, lowerNode(node.left), lowerNode(node.right));
    }

    // Arrow operator -> used as alias for :-> in named function definitions
    // F(x) -> body  is equivalent to  F(x) :-> body  (same as = vs :=)
    // Detect: left is a FunctionCall with known name
    if (op === "->") {
      const left = node.left;
      if (left.type === "FunctionCall" && left.function) {
        const fn = left.function;
        const funcName = fn.name || fn.value;
        if (funcName) {
          // Convert call-style args to param definitions
          const positionalArgs = (left.arguments?.positional || []);
          const paramPosArgs = positionalArgs.map((arg) => ({
            name: arg.name || arg.value || String(arg),
            defaultValue: null,
          }));
          const params = lowerParams({
            positional: paramPosArgs,
            keyword: [],
            conditionals: [],
            metadata: {},
          });
          const body = lowerFunctionBody(node.right);
          return ir("FUNCDEF", funcName, params, body);
        }
      }
      // Otherwise treat as lambda: (params) -> body is FunctionLambda, but
      // if we get here it means an unrecognized left, fall through to BINOP
    }

    // Fallback: generic binary operation
    return ir("BINOP", op, lowerNode(node.left), lowerNode(node.right));
  },

  CustomOperator(node) {
    return ir(
      "CUSTOM_OPERATOR",
      {
        symbol: node.operator,
        spelling: node.spelling,
        target: node.definition.target,
      },
      lowerNode(node.left),
      lowerNode(node.right),
    );
  },

  UnaryOperation(node) {
    if (node.operator === "-") {
      return ir("NEG", lowerNode(node.operand));
    }
    if (node.operator === "+") {
      return lowerNode(node.operand); // unary + is identity
    }
    if (node.operator === "NOT" || node.operator === "!") {
      return ir("NOT", lowerNode(node.operand));
    }
    return ir("UNARY", node.operator, lowerNode(node.operand));
  },

  Factorial(node) {
    return ir("FACTORIAL", lowerNode(node.expression));
  },

  DoubleFactorial(node) {
    return ir("DOUBLE_FACTORIAL", lowerNode(node.expression));
  },

  ImplicitMultiplication(node) {
    return ir("MUL", lowerNode(node.left), lowerNode(node.right));
  },

  ImplicitApplication(node) {
    // Implicit callable application by adjacency: F 3x → CALL(F, 3*x)
    const callable = node.callable;
    const arg = lowerNode(node.argument);
    if (callable.type === "SystemIdentifier" || callable.type === "UserIdentifier") {
      return ir("CALL", callable.name, arg);
    }
    // A dotted root capability keeps its SystemContext dispatch path when
    // called by adjacency: `.Len value` is equivalent to `.Len(value)`.
    if (callable.type === "SystemAccess") {
      return ir("SYS_CALL", callable.property, arg);
    }
    // A declared dotted member follows the same convention: a PascalCase
    // member is callable by adjacency, while a lowercase member is a value.
    if (callable.type === "DotAccess" && callable.systemPathInfo?.kind === "function") {
      return ir("CALL_METHOD", lowerNode(callable.object), callable.property, arg);
    }
    // For expression-based callables (e.g. result of another ImplicitApplication)
    return ir("CALL_EXPR", lowerNode(callable), arg);
  },

  // === Function Calls ===

  FunctionCall(node) {
    const fn = node.function;
    const args = lowerCallArgs(node.arguments);

    if (fn.type === "SystemIdentifier" || fn.type === "UserIdentifier") {
      const name = fn.name;
      // Operators that may be parsed as function calls (unary/binary shorthand)
      if (args.length === 1) {
        if (name === "-") return ir("NEG", args[0]);
        if (name === "+") return args[0]; // unary + is identity
        if (name === "!" || name === "NOT") return ir("NOT", args[0]);
      } else if (args.length === 2) {
        if (name === "+") return ir("ADD", args[0], args[1]);
        if (name === "-") return ir("SUB", args[0], args[1]);
        if (name === "*") return ir("MUL", args[0], args[1]);
        if (name === "/") return ir("DIV", args[0], args[1]);
      }
      // Brace-syntax calls ({+ 1,2,3}, {* a,b,c}, etc.) go directly to the
      // internal Registry — these are language syntax, not user-typed names.
      if (node.fromBrace) {
        return ir(name, ...args);
      }
      // All other calls go through CALL (user scope lookup, no Registry fallback)
      return ir("CALL", name, ...args);
    }
    // Expression call: (expr)(args)
    return ir("CALL_EXPR", lowerNode(fn), ...args);
  },

  SystemCall(node) {
    const args = lowerCallArgs(node.arguments);
    // All system calls — .Name(), @_Name(), @+(args) — go through SYS_CALL
    // so they require the capability to be in the system context.
    return ir("SYS_CALL", node.name, ...args);
  },

  SystemCapabilityCall(node) {
    const args = lowerCallArgs(node.arguments);
    return ir("SYS_CALL", node.property, ...args);
  },

  // SystemObject: bare . → SYS_OBJ (returns a copy of the system context)
  SystemObject(_node) {
    return ir("SYS_OBJ");
  },

  // SystemAccess: .Name in non-call position → SYS_GET
  SystemAccess(node) {
    return ir("SYS_GET", node.property);
  },

  Call(node) {
    const args = lowerCallArgs(node.arguments);
    return ir("CALL_EXPR", lowerNode(node.target), ...args);
  },

  MethodCall(node) {
    const args = lowerCallArgs(node.arguments);
    return ir("CALL_METHOD", lowerNode(node.object), node.method, ...args);
  },

  MethodLift(node) {
    const args = lowerCallArgs(node.arguments);
    return ir("METHOD_LIFT", node.method, ...args);
  },

  PreparedTrial(node) {
    const gates = (node.gates || []).map((gate) => ({
      pattern: lowerDestructureTarget(gate.pattern),
      prep: gate.prep?.type === "Array" ? gate.prep.elements.map(lowerNode) : [],
      strict: gate.strict === true,
      ...(gate.undecidedMode && gate.undecidedMode !== "stop" ? { undecidedMode: gate.undecidedMode } : {}),
    }));
    return ir("PREP_TRIAL", lowerNode(node.candidate), ...gates);
  },

  // === Function Definitions ===

  FunctionDefinition(node) {
    const name = node.name.name || node.name.value;
    const params = lowerParams(node.parameters, node.prep, node.prepStrict, node.variantName, node.prepUndecided);
    const body = lowerFunctionBody(node.body);
    return ir("FUNCDEF", name, params, body);
  },

  FunctionLambda(node) {
    const params = lowerParams(node.parameters, node.prep, node.prepStrict, node.variantName, node.prepUndecided);
    const body = lowerFunctionBody(node.body);
    return ir("LAMBDA", params, body);
  },

  FunctionVariantDefinition(node) {
    const name = node.name.name || node.name.value;
    const params = lowerParams(node.parameters, node.prep, node.prepStrict, node.variantName, node.prepUndecided);
    const body = lowerFunctionBody(node.body);
    return ir("MULTIFUNCDEF", name, node.mode, params, body);
  },

  // === Grouping ===

  Grouping(node) {
    if (node.expression) {
      return lowerNode(node.expression);
    }
    return ir("NULL");
  },

  Tuple(node) {
    return ir("TUPLE", ...node.elements.map(lowerNode));
  },

  ParameterList(node) {
    return lowerParams(node.parameters);
  },

  // === Collections ===

  Spread(node) {
    return ir("SPREAD", lowerNode(node.expression));
  },

  CapturedEntry(node) {
    return {
      captureMode: node.captureMode,
      expression: lowerNode(node.expression),
    };
  },

  SemanticHeader(node) {
    return {
      captureMode: node.captureMode || null,
      name: node.name || null,
      typeName: node.typeName || null,
      traits: (node.traits || []).map((trait) => ({
        name: trait.name,
        checkMode: trait.checkMode || null,
        order: trait.order ?? null,
      })),
    };
  },

  MapEntry(node) {
    return {
      key: lowerNode(node.key),
      value: lowerNode(node.value),
      captureMode: node.captureMode || null,
      keyType: node.key?.type || null,
    };
  },

  Array(node) {
    return ir("ARRAY", ...node.elements.map(lowerNode));
  },

  Matrix(node) {
    const structure = node.rows.map((row, index) => ({
      row,
      separatorLevel: index === node.rows.length - 1 ? 0 : 1,
    }));
    const layout = implicitTensorLayout(structure, 2);
    return ir("TENSOR_LITERAL", layout.shape, ...layout.elements.map(lowerNode));
  },

  Tensor(node) {
    const layout = implicitTensorLayout(node.structure, node.maxDimension);
    return ir("TENSOR_LITERAL", layout.shape, ...layout.elements.map(lowerNode));
  },

  TensorLiteral(node) {
    const meta = node.header ? { header: lowerNode(node.header) } : null;
    return meta
      ? ir("TENSOR_LITERAL", meta, node.shape, ...node.elements.map(lowerNode))
      : ir("TENSOR_LITERAL", node.shape, ...node.elements.map(lowerNode));
  },

  ValueOutfit(node) {
    const header = node.header ? lowerNode(node.header) : null;
    return header
      ? ir("VALUE_OUTFIT", header, lowerNode(node.expression))
      : ir("VALUE_OUTFIT", null, lowerNode(node.expression));
  },

  // === Brace Sigil Containers ===

  MapContainer(node) {
    const constructorMeta = node.header ? { header: lowerNode(node.header) } : null;
    const loweredElements = node.elements.map((el) => {
      if (el?.type === "MapEntry") {
        const keyNode = el.key;
        if (keyNode?.type === "UserIdentifier" || keyNode?.type === "SystemIdentifier") {
          return ir("MAP_PAIR", "identifier", keyNode.name, lowerNode(el.value), el.captureMode || null);
        }
        if (keyNode?.type === "Grouping") {
          return ir("MAP_PAIR", "expression", lowerNode(keyNode.expression), lowerNode(el.value), el.captureMode || null);
        }
        throw new Error("Map key expressions must be parenthesized in literals: use {= (expr)=value }");
      }
      if (
        el &&
        el.type === "BinaryOperation" &&
        (el.operator === "=" || el.operator === ":=")
      ) {
        if (el.left?.type === "UserIdentifier" || el.left?.type === "SystemIdentifier") {
          return ir("MAP_PAIR", "identifier", el.left.name, lowerNode(el.right), el.operator === ":=" ? "copy" : null);
        }
        if (el.left?.type === "Grouping") {
          return ir("MAP_PAIR", "expression", lowerNode(el.left.expression), lowerNode(el.right), el.operator === ":=" ? "copy" : null);
        }
        throw new Error("Map key expressions must be parenthesized in literals: use {= (expr)=value }");
      }
      return lowerNode(el);
    });
    return constructorMeta ? ir("MAP_OBJ", constructorMeta, ...loweredElements) : ir("MAP_OBJ", ...loweredElements);
  },

  CaseContainer(node) {
    const lowerCaseElement = (element) => {
      if (element?.type === "BinaryOperation" && element.operator === "?") {
        return ir("DEFER", ir("CONDITION", lowerNode(element.left), lowerNode(element.right)));
      }
      return ir("DEFER", lowerNode(element));
    };

    if (node.name) {
      return ir("CASE", { name: node.name }, ...node.elements.map(lowerCaseElement));
    }
    return ir("CASE", ...node.elements.map(lowerCaseElement));
  },

  BlockContainer(node) {
    const hasMeta = (node.imports && node.imports.length > 0) || node.name;
    if (hasMeta) {
      const meta = {};
      if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
      if (node.name) meta.name = node.name;
      return ir("BLOCK", meta, ...node.elements.map(lowerNode));
    }
    return ir("BLOCK", ...node.elements.map(lowerNode));
  },

  SetContainer(node) {
    const meta = node.header ? { header: lowerNode(node.header) } : null;
    return meta ? ir("SET", meta, ...node.elements.map(lowerNode)) : ir("SET", ...node.elements.map(lowerNode));
  },

  TupleContainer(node) {
    const meta = node.header ? { header: lowerNode(node.header) } : null;
    return meta ? ir("TUPLE", meta, ...node.elements.map(lowerNode)) : ir("TUPLE", ...node.elements.map(lowerNode));
  },

  ArrayContainer(node) {
    const meta = node.header ? { header: lowerNode(node.header) } : null;
    return meta ? ir("ARRAY_CAPTURE", meta, ...node.elements.map(lowerNode)) : ir("ARRAY_CAPTURE", ...node.elements.map(lowerNode));
  },

  MultifunctionContainer(node) {
    return ir("MULTIFUNCTION", ...node.elements.map(lowerNode));
  },

  HaloContainer(node) {
    return ir("HALO", ...node.elements.map(lowerNode));
  },

  LoopContainer(node) {
    const hasMeta =
      (node.imports && node.imports.length > 0) ||
      node.name ||
      node.maxIterations !== undefined ||
      node.unlimited === true;
    if (hasMeta) {
      const meta = {};
      if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
      if (node.name) meta.name = node.name;
      if (node.maxIterations !== undefined) meta.maxIterations = node.maxIterations;
      if (node.unlimited === true) meta.unlimited = true;
      return ir("LOOP", meta, ...node.elements.map((el) => ir("DEFER", lowerNode(el))));
    }
    return ir("LOOP", ...node.elements.map((el) => ir("DEFER", lowerNode(el))));
  },

  AsyncContainer(node) {
    const meta = {};
    if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
    if (node.name) meta.name = node.name;
    if (node.concurrencyLimit !== undefined) meta.concurrencyLimit = node.concurrencyLimit;
    if (node.timeoutSeconds !== undefined) meta.timeoutSeconds = node.timeoutSeconds;
    const hasMeta = Object.keys(meta).length > 0;
    return hasMeta
      ? ir("ASYNC_SCOPE", meta, ...node.elements.map(lowerNode))
      : ir("ASYNC_SCOPE", ...node.elements.map(lowerNode));
  },

  DetachedBlock(node) {
    const meta = {};
    if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
    const hasMeta = Object.keys(meta).length > 0;
    return hasMeta
      ? ir("DETACH", meta, ...node.elements.map(lowerNode))
      : ir("DETACH", ...node.elements.map(lowerNode));
  },

  SystemContainer(node) {
    const hasMeta = (node.imports && node.imports.length > 0) || node.name;
    if (hasMeta) {
      const meta = {};
      if (node.imports && node.imports.length > 0) meta.imports = lowerImports(node.imports);
      if (node.name) meta.name = node.name;
      return ir("SYSTEM", meta, ...node.elements.map(lowerNode));
    }
    return ir("SYSTEM", ...node.elements.map(lowerNode));
  },

  SystemSpecLiteral(node) {
    const meta = {
      inputs: [...(node.inputs || [])],
      outputs: [...(node.outputs || [])],
      outputsDeclared: node.outputsDeclared === true,
      outputMode: node.outputMode || "named",
      ...(node.expression ? { expression: lowerNode(node.expression) } : {}),
      statements: (node.statements || []).map((statement) => ({
        kind: statement.type === "SpecConstraint" ? "constraint" : "define",
        ...(statement.target ? { target: statement.target } : {}),
        expr: lowerNode(statement.expr),
      })),
    };
    if (node.imports && node.imports.length > 0) {
      meta.imports = lowerImports(node.imports);
    }
    return ir("SYSTEM_SPEC", meta);
  },

  SpecDefinition(node) {
    return {
      kind: "define",
      target: node.target,
      expr: lowerNode(node.expr),
    };
  },

  SpecConstraint(node) {
    return { kind: "constraint", expr: lowerNode(node.expr) };
  },

  BreakBlock(node) {
    const meta = {};
    if (node.targetType) meta.targetType = node.targetType;
    if (node.targetName) meta.targetName = node.targetName;
    return ir("BREAK", meta, lowerNode(node.value));
  },


  // === Deferred Blocks ===

  DeferredBlock(node) {
    return ir("DEFER", lowerNode(node.body));
  },

  // === Property Access ===

  DotAccess(node) {
    return ir("META_GET", lowerNode(node.object), node.property);
  },

  PropertyAccess(node) {
    const obj = lowerNode(node.object);
    if (node.property && node.property.type === "KeyLiteral") {
      // [:name] sugar — pass string key directly
      return ir("INDEX_GET", obj, node.property.name);
    }
    return ir("INDEX_GET", obj, lowerNode(node.property));
  },

  BracketIndex(node) {
    if (node.object?.type === "ReactiveRef" || node.object?.type === "ReactiveCellRef") {
      return ir(
        node.object.type === "ReactiveRef" ? "REACTIVE_INDEX_READ" : "REACTIVE_INDEX_NODE",
        node.object.name,
        node.specs.length,
        ...node.specs.map(lowerBracketSpec),
      );
    }
    return ir(
      "BRACKET_GET",
      lowerNode(node.object),
      node.specs.length,
      ...node.specs.map(lowerBracketSpec),
    );
  },

  ExternalAccess(node) {
    // node.property === null always now (a..name is parse error)
    return ir("META_ALL", lowerNode(node.object));
  },

  KeySet(node) {
    return ir("KEYS", lowerNode(node.object));
  },

  ValueSet(node) {
    return ir("VALUES", lowerNode(node.object));
  },

  // === Mutation ===

  Mutation(node) {
    const target = lowerNode(node.target);
    const ops = node.operations.map((op) => ({
      action: op.action,
      key: op.key,
      value: op.value ? lowerNode(op.value) : null,
    }));
    const fn = node.mutate ? "MUTINPLACE" : "MUTCOPY";
    return ir(fn, target, ops);
  },

  // === Pipes ===

  Pipe(node) {
    return ir("PIPE", lowerNode(node.left), lowerNode(node.right));
  },

  ForEachPipe(node) {
    return ir("PFOREACH", lowerNode(node.left), lowerNode(node.right));
  },

  ExpectedErrorPipe(node) {
    return ir("PEXPECT", lowerNode(node.left), lowerNode(node.right));
  },

  ExplicitPipe(node) {
    return ir("PIPE_EXPLICIT", lowerNode(node.left), lowerNode(node.right));
  },

  SliceStrict(node) {
    return ir("PSLICE_STRICT", lowerNode(node.left), lowerNode(node.right));
  },

  SliceClamp(node) {
    return ir("PSLICE_CLAMP", lowerNode(node.left), lowerNode(node.right));
  },

  Split(node) {
    return ir("PSPLIT", lowerNode(node.left), lowerNode(node.right));
  },

  Chunk(node) {
    return ir("PCHUNK", lowerNode(node.left), lowerNode(node.right));
  },

  Map(node) {
    return ir("PMAP", lowerNode(node.left), lowerNode(node.right));
  },

  Filter(node) {
    return ir("PFILTER", lowerNode(node.left), lowerNode(node.right));
  },

  Every(node) {
    return ir("PALL", lowerNode(node.left), lowerNode(node.right));
  },

  Some(node) {
    return ir("PANY", lowerNode(node.left), lowerNode(node.right));
  },

  Reduce(node) {
    if (node.init) {
      return ir("PREDUCE", lowerNode(node.left), lowerNode(node.right), lowerNode(node.init));
    }
    return ir("PREDUCE", lowerNode(node.left), lowerNode(node.right));
  },

  Reverse(node) {
    return ir("PREVERSE", lowerNode(node.target));
  },

  Sort(node) {
    return ir("PSORT", lowerNode(node.left), lowerNode(node.right));
  },

  // === Ternary ===

  TernaryOperation(node) {
    return ir(
      "TERNARY",
      lowerNode(node.condition),
      ir("DEFER", lowerNode(node.trueExpression)),
      ir("DEFER", node.nullExpression ? lowerNode(node.nullExpression) : ir("NULL")),
      ir("DEFER", node.undecidedExpression ? lowerNode(node.undecidedExpression) : ir("UNDECIDED")),
    );
  },

  // === Postfix Operators ===

  At(node) {
    return ir("AT", lowerNode(node.target), lowerNode(node.arg));
  },

  Ask(node) {
    return ir("ASK", lowerNode(node.target), lowerNode(node.arg));
  },

  Transpose(node) {
    return ir("TENSOR_TRANSPOSE", lowerNode(node.expression));
  },

  // === Calculus ===

  Derivative(node) {
    if (node.operations?.length) {
      throw new Error("Calculus operation sequences are not yet part of the exact symbolic subset");
    }
    if (node.variables?.length > 1) {
      throw new Error("Exact symbolic calculus currently accepts one variable per quote operation");
    }
    const variable = node.variables?.length ? ir("STRING", node.variables[0].name) : ir("NULL");
    let result = ir("DERIVATIVE", lowerNode(node.function), node.order, variable);
    if (node.evaluation?.length) result = ir("CALL_EXPR", result, ...node.evaluation.map(lowerNode));
    return result;
  },

  Integral(node) {
    if (node.operations?.length) {
      throw new Error("Calculus operation sequences are not yet part of the exact symbolic subset");
    }
    if (node.variables?.length > 1) {
      throw new Error("Exact symbolic calculus currently accepts one variable per quote operation");
    }
    const variable = node.variables?.length ? ir("STRING", node.variables[0].name) : ir("NULL");
    let result = ir("INTEGRAL", lowerNode(node.function), node.order, variable);
    if (node.evaluation?.length) result = ir("CALL_EXPR", result, ...node.evaluation.map(lowerNode));
    return result;
  },

  // === Interval Operations ===

  IntervalStepping(node) {
    return ir("STEP", lowerNode(node.interval), lowerNode(node.step));
  },

  IntervalDivision(node) {
    return ir("DIVIDE", lowerNode(node.interval), lowerNode(node.count));
  },

  IntervalPartition(node) {
    return ir("PARTITION", lowerNode(node.interval), lowerNode(node.count));
  },

  IntervalMediants(node) {
    return ir("MEDIANTS", lowerNode(node.interval), lowerNode(node.levels));
  },

  IntervalMediantPartition(node) {
    return ir(
      "MEDIANT_PARTITION",
      lowerNode(node.interval),
      lowerNode(node.levels),
    );
  },

  IntervalRandom(node) {
    return ir("RANDOM", lowerNode(node.interval), lowerNode(node.parameters));
  },

  IntervalRandomPartition(node) {
    return ir(
      "RANDOM_PARTITION",
      lowerNode(node.interval),
      lowerNode(node.count),
    );
  },

  InfiniteSequence(node) {
    return ir(
      "INFSEQ",
      lowerNode(node.start),
      node.step ? lowerNode(node.step) : null,
    );
  },

  // === Units ===

  ScientificUnit(node) {
    return ir("UNIT", lowerNode(node.target), node.unit);
  },

  MathematicalUnit(node) {
    return ir("MATHUNIT", lowerNode(node.target), node.unit);
  },

  // === Generators ===

  GeneratorChain(node) {
    const start = node.start ? lowerNode(node.start) : null;
    const ops = node.operators.map(lowerNode);
    return ir("GENERATOR", start, ...ops);
  },

  GeneratorAdd(node) { return ir("GEN_ADD", lowerNode(node.operand)); },
  GeneratorMultiply(node) { return ir("GEN_MUL", lowerNode(node.operand)); },
  GeneratorFunction(node) { return ir("GEN_FUNC", lowerNode(node.operand)); },
  GeneratorFilter(node) { return ir("GEN_FILTER", lowerNode(node.operand)); },
  GeneratorLimit(node) { return ir("GEN_LIMIT", lowerNode(node.operand)); },
  GeneratorEagerLimit(node) { return ir("GEN_EAGER_LIMIT", lowerNode(node.operand)); },
  GeneratorPipe(node) { return ir("GEN_PIPE", lowerNode(node.operand)); },

  // === Metadata ===

  WithMetadata(node) {
    const expr = lowerNode(node.expression);
    const meta = {};
    for (const [key, value] of Object.entries(node.metadata)) {
      meta[key] = lowerNode(value);
    }
    return ir("WITH_META", expr, meta);
  },

  // === Embedded Language ===

  EmbeddedLanguage(node) {
    return ir(
      "EMBEDDED",
      node.language || "SArith",
      node.modifiers || [],
      node.body || "",
      {
        context: node.context ?? null,
        explicitParser: node.explicitParser === true,
        expectedFunction: node.expectedFunction === true,
        inferredName: node.inferredName ?? null,
        legacyHeader: node.legacyHeader === true,
      },
    );
  },
};

function lowerImports(imports) {
  return imports.map((spec) => ({
    local: spec.local,
    source: spec.source,
    mode: spec.mode,
  }));
}

function lowerBindingSpecs(specs) {
  return specs.map((spec) => ({
    target: spec.target,
    source: spec.source,
    mode: spec.mode,
    ...(spec.sourceScope ? { sourceScope: spec.sourceScope } : {}),
  }));
}

function lowerCapabilityModifiers(modifiers) {
  return modifiers.map((modifier) => ({
    action: modifier.action,
    targetType: modifier.targetType,
    target: modifier.target,
  }));
}

// === Helper Functions ===

/**
 * Lower assignment: x = expr or F(x) = expr
 * @param {Object} node - AST assignment node
 * @param {string} irFn - IR function name: ASSIGN, ASSIGN_COPY, ASSIGN_UPDATE,
 *                        ASSIGN_DEEP_COPY, ASSIGN_DEEP_UPDATE
 */
function lowerAssignment(node, irFn) {
  const left = node.left;

  // Base prefix definition assignment: 0A = ...
  if (left.type === "Number" && typeof left.value === "string") {
    const m = left.value.match(/^0([A-Z])$/);
    if (m) {
      return ir("DEFINEBASE", m[1], lowerNode(node.right));
    }
  }

  // Outer variable assignment: @a = 5
  if (left.type === "OuterIdentifier") {
    // Map assignment modes to outer variants
    const outerFn = irFn === "ASSIGN" ? "OUTER_ASSIGN"
      : (irFn === "ASSIGN_COPY" || irFn === "ASSIGN_DEEP_COPY") ? "OUTER_ASSIGN"
      : "OUTER_UPDATE";
    const depth = (irFn === "ASSIGN_DEEP_COPY" || irFn === "ASSIGN_DEEP_UPDATE") ? "deep" : "shallow";
    if (outerFn === "OUTER_UPDATE") {
      return ir("OUTER_UPDATE", left.name, lowerNode(node.right), depth);
    }
    return ir("OUTER_ASSIGN", left.name, lowerNode(node.right));
  }

  // Simple variable assignment: x = 5
  if (left.type === "UserIdentifier" || left.type === "SystemIdentifier") {
    const right =
      left.type === "SystemIdentifier" && node.right?.type === "EmbeddedLanguage"
        ? {
            ...node.right,
            expectedFunction: true,
            inferredName: left.name,
          }
        : node.right;
    return ir(irFn, left.name, lowerNode(right));
  }

  if (left.type === "SelfRef") {
    throw new Error("Cannot assign to '$'; it is read-only and only valid within a function body");
  }

  if (left.type === "ReactiveRef") {
    if (irFn !== "ASSIGN_COPY") {
      throw new Error("Reactive updates use '$name := expression'");
    }
    return ir("REACTIVE_UPDATE", left.name, ir("DEFER", lowerNode(node.right)));
  }

  if (left.type === "ReactiveCellRef") {
    if (irFn !== "ASSIGN_COPY") {
      throw new Error("Reactive declarations use '$$name := expression'");
    }
    return ir("REACTIVE_DECLARE", left.name, ir("DEFER", lowerNode(node.right)));
  }

  if (left.type === "BracketIndex" && left.object?.type === "ReactiveRef") {
    if (irFn !== "ASSIGN_COPY") {
      throw new Error("Reactive FormulaSheet updates use '$sheet[index] := @{ ... }'");
    }
    return ir(
      "REACTIVE_INDEX_UPDATE",
      left.object.name,
      left.specs.length,
      ...left.specs.map(lowerBracketSpec),
      lowerNode(node.right),
    );
  }

  // System context meta assignment: .freeze = true, .immutable = false
  if (left.type === "SystemAccess") {
    return ir("SYS_SET", left.property, lowerNode(node.right));
  }

  // Meta assignment: obj.name = val
  if (left.type === "DotAccess") {
    return ir(
      "META_SET",
      lowerNode(left.object),
      left.property,
      lowerNode(node.right),
    );
  }

  // ExternalAccess assignment: a..prop = val is no longer valid
  if (left.type === "ExternalAccess") {
    throw new Error("a..prop assignment is no longer supported; use a.prop = val for meta access");
  }

  // Index assignment: arr[i] = val (with KeyLiteral support)
  if (left.type === "PropertyAccess") {
    const obj = lowerNode(left.object);
    if (left.property && left.property.type === "KeyLiteral") {
      return ir("INDEX_SET", obj, left.property.name, lowerNode(node.right));
    }
    return ir(
      "INDEX_SET",
      obj,
      lowerNode(left.property),
      lowerNode(node.right),
    );
  }

  if (left.type === "BracketIndex") {
    return ir(
      "BRACKET_SET",
      lowerNode(left.object),
      left.specs.length,
      ...left.specs.map(lowerBracketSpec),
      lowerNode(node.right),
    );
  }

  if (irFn === "ASSIGN_UPDATE" || irFn === "ASSIGN_DEEP_UPDATE") {
    throw new Error("Invalid update target");
  }

  // Fallback: generic assignment expression
  return ir("ASSIGN_EXPR", lowerNode(left), lowerNode(node.right));
}

function lowerDestructureTarget(node) {
  if (!node || !node.type) {
    throw new Error("Invalid destructure target");
  }

  switch (node.type) {
    case "DestructureVariableTarget":
      return { type: node.type, name: node.name };
    case "DestructureBindingModeTarget":
      return { type: node.type, bindingMode: node.bindingMode, target: lowerDestructureTarget(node.target) };
    case "DestructureSemanticTarget":
      return { type: node.type, header: node.header ? lowerNode(node.header) : null, target: lowerDestructureTarget(node.target) };
    case "DestructureRestTarget":
      return { type: node.type, target: lowerDestructureTarget(node.target) };
    case "DestructureIndexedTarget":
      return {
        type: node.type,
        wholeTarget: node.wholeTarget ? lowerDestructureTarget(node.wholeTarget) : null,
        specs: (node.specs || []).map((spec) => {
          if (spec?.type === "FullSlice") {
            return { kind: "full" };
          }
          if (spec?.type === "SliceSpec") {
            return {
              kind: "slice",
              start: lowerNode(spec.start),
              end: lowerNode(spec.end),
            };
          }
          return {
            kind: "index",
            value: lowerNode(spec),
          };
        }),
        nestedTarget: node.nestedTarget ? lowerDestructureTarget(node.nestedTarget) : null,
      };
    case "DestructureArrayPattern":
    case "DestructureTuplePattern":
      return {
        type: node.type,
        entries: (node.entries || []).map(lowerDestructureTarget),
        rest: node.rest ? lowerDestructureTarget(node.rest) : null,
      };
    case "DestructureMapPattern":
      return {
        type: node.type,
        entries: (node.entries || []).map(lowerDestructureTarget),
        rest: node.rest ? lowerDestructureTarget(node.rest) : null,
      };
    case "DestructureMapEntry":
      {
        let loweredKey;
        if (node.sourceKey?.type === "UserIdentifier" || node.sourceKey?.type === "SystemIdentifier") {
          loweredKey = { type: "MapKeyIdentifier", value: node.sourceKey.name };
        } else {
          loweredKey = lowerNode(node.sourceKey);
        }
        return {
          type: node.type,
          sourceKey: loweredKey,
          wholeTarget: node.wholeTarget ? lowerDestructureTarget(node.wholeTarget) : null,
          nestedTarget: node.nestedTarget ? lowerDestructureTarget(node.nestedTarget) : null,
        };
      }
    case "DestructureTensorPattern":
      return {
        type: node.type,
        shape: [...(node.shape || [])],
        rows: (node.rows || []).map((row) => row.map(lowerDestructureTarget)),
      };
    default:
      throw new Error(`Unknown destructure target node type: ${node.type}`);
  }
}

/**
 * Lower function call arguments { positional: [...], keyword: {...} }
 * into a flat array of IR nodes, with keyword args as KWARG nodes.
 */
function lowerCallArgs(args) {
  if (!args) return [];

  const result = [];

  // Positional args
  if (args.positional) {
    for (const arg of args.positional) {
      result.push(lowerNode(arg));
    }
  }

  // Keyword args
  if (args.keyword) {
    for (const [key, value] of Object.entries(args.keyword)) {
      result.push(ir("KWARG", key, lowerNode(value)));
    }
  }

  return result;
}

/**
 * Lower parameter definitions into a serializable format.
 */
function lowerParams(params, prep = null, prepStrict = false, variantName = null, prepUndecided = "stop") {
  if (!params) return { positional: [], keyword: [], conditionals: [] };

  return {
    positional: (params.positional || []).map((p) => {
      const res = {
        name: p.name,
        holeDefault: p.holeDefault ? lowerNode(p.holeDefault) : null,
      };
      if (p.isRest) {
        res.isRest = true;
      }
      return res;
    }),
    keyword: (params.keyword || []).map((p) => ({
      name: p.name,
    })),
    conditionals: (params.conditionals || []).map(lowerNode),
    prep: prep && prep.type === "Array" ? prep.elements.map(lowerNode) : [],
    prepStrict: prepStrict === true,
    prepUndecided,
    metadata: {
      ...(params.metadata || {}),
      ...(variantName ? { variantName } : {}),
    },
  };
}

function lowerBracketSpec(spec) {
  if (spec.type === "FullSlice") {
    return ir("FULL_SLICE");
  }
  if (spec.type === "SliceSpec") {
    return ir("SLICE_SPEC", lowerNode(spec.start), lowerNode(spec.end));
  }
  return lowerNode(spec);
}
