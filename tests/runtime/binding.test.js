import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    createWidgetSession,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

function session() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("Binding lenses", () => {
    test(".Bind captures Cell identity and supports Get, At, Set, and subscriptions", () => {
        const state = session();
        const binding = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            .Bind(m)
        `, state);
        const events = [];
        const unsubscribe = binding.subscribe((event) => events.push(event));

        expect(binding.name).toBe("m");
        expect(formatValue(binding.get())).toContain("{:2x2:");
        expect(formatValue(binding.at(2, 1).get())).toBe("3");
        binding.at(2, 1).set(parseAndEvaluate("9"));
        expect(formatValue(state.context.get("m").data[2])).toBe("9");
        expect(events).toHaveLength(1);
        expect(events[0].path).toHaveLength(2);

        parseAndEvaluate("m := {:1x1: 100}", state);
        binding.at(1, 2).set(parseAndEvaluate("8"));
        expect(formatValue(binding.at(1, 2).get())).toBe("8");
        expect(formatValue(state.context.get("m"))).toContain("100");
        unsubscribe();
    });

    test("Binding methods are callable from RiX", () => {
        const value = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            lens := .Bind(m);
            lens.At(2, 2).Set(12);
            lens.At(2, 2).Get()
        `);
        expect(formatValue(value)).toBe("12");
    });

    test(".Bind rejects computed values so lvalue identity stays explicit", () => {
        expect(() => parseAndEvaluate(".Bind([1, 2, 3])")).toThrow("requires a variable name");
    });
});

describe("WidgetSession", () => {
    test("routes semantic sheet:set events through a Binding and refreshes the snapshot", () => {
        const state = session();
        const sheet = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            .Sheet(.Bind(m), {= title="Live matrix" })
        `, state);
        const changes = [];
        const widget = createWidgetSession(sheet, {
            onChange: (change) => changes.push(change),
        });

        expect(sheet.editable).toBe(true);
        expect(sheet.addressBase).toBe("m");
        expect(sheet.bindingId).toBe(sheet.binding.id);
        const updated = widget.dispatch({
            type: "sheet:set",
            index: [2, 1],
            value: parseAndEvaluate("17"),
        });

        expect(widget.revision).toBe(1);
        expect(formatValue(state.context.get("m").data[2])).toBe("17");
        expect(formatValue(updated.cells[1][0].value)).toBe("17");
        expect(widget.current()).toBe(updated);
        expect(widget.snapshot().editable).toBe(false);
        expect(widget.snapshot().binding).toBeNull();
        expect(changes).toHaveLength(1);
        expect(changes[0].bindingEvent.metadata.index).toEqual([2, 1]);
        widget.dispose();
    });

    test("refresh preserves complete-map Sheet presentation options", () => {
        const sheet = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet({=
                data=.Bind(m),
                title="Mapped live view",
                address="coefficients",
                axes=["term", "power"]
            })
        `);
        const widget = createWidgetSession(sheet);
        const updated = widget.dispatch({
            type: "sheet:set",
            index: [1, 2],
            value: parseAndEvaluate("9"),
        });
        expect(updated.title).toBe("Mapped live view");
        expect(updated.addressBase).toBe("coefficients");
        expect(updated.axes).toEqual(["term", "power"]);
        widget.dispose();
    });

    test("routes formula edits and refreshes all dependent values", () => {
        const sheet = parseAndEvaluate(`
            model := .FormulaSheet([[
                @{1},
                @{ grid[1,1] + 1 },
                @{ grid[1,2] + 1 }
            ]]);
            .Sheet(model, {= title="Formula model" })
        `);
        const changes = [];
        const widget = createWidgetSession(sheet, { onChange: (change) => changes.push(change) });
        const updated = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "10",
            assignmentMode: "~=",
        });

        expect(widget.editMode).toBe("formula");
        expect(widget.revision).toBe(1);
        expect(updated.cells[0].map((cell) => formatValue(cell.value))).toEqual(["10", "11", "12"]);
        expect(updated.cells[0][0].formulaSource).toBe("10");
        expect(updated.cells[0][0].assignmentMode).toBe("~=");
        expect(updated.cells[0][0].slotId).toBe(sheet.cells[0][0].slotId);
        expect(widget.cellUpdates(formatValue).map(({ text }) => text)).toEqual(["10", "11", "12"]);
        expect(widget.cellUpdates(formatValue)[1].dependencies).toEqual(["1,1"]);
        expect(changes[0].formulaEvent.type).toBe("formula:commit");

        const explicit = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "::= 20",
        });
        expect(explicit.cells[0][0].formulaSource).toBe("20");
        expect(explicit.cells[0][0].assignmentMode).toBe("::=");

        const labeled = widget.dispatch({
            type: "sheet:header",
            axis: 2,
            coordinate: 2,
            label: "Middle",
        });
        expect(labeled.columnHeaders).toEqual(["A · 1", "Middle · 2", "C · 3"]);
        expect(labeled.axisLabels[1]).toEqual([null, "Middle", null]);
        expect(widget.revision).toBe(3);
        widget.dispose();
    });

    test("refreshes failed formula edits with last-good values and diagnostics", () => {
        const sheet = parseAndEvaluate(`
            model := .FormulaSheet([[@{2}, @{ grid[1,1] * 3 }]]);
            .Sheet(model)
        `);
        const changes = [];
        const widget = createWidgetSession(sheet, { onChange: (change) => changes.push(change) });

        expect(() => widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "1 +",
        })).toThrow();
        expect(widget.revision).toBe(1);
        expect(formatValue(widget.current().cells[0][0].value)).toBe("2");
        expect(widget.current().cells[0][0]).toMatchObject({
            state: "error",
            diagnosticKind: "parse",
            diagnosticSource: "1 +",
        });
        expect(widget.cellUpdates(formatValue)[0]).toMatchObject({
            text: "2",
            state: "error",
            diagnosticKind: "parse",
            diagnosticSource: "1 +",
        });
        expect(changes.at(-1).formulaEvent.type).toBe("formula:error");

        expect(() => widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "grid[1,1] + 1",
        })).toThrow("Formula cycle");
        expect(widget.revision).toBe(2);
        expect(widget.current().cells[0][0].diagnosticKind).toBe("cycle");

        const recovered = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "4",
        });
        expect(widget.revision).toBe(3);
        expect(recovered.cells[0][0].state).toBe("clean");
        expect(recovered.cells[0][0].diagnostics).toEqual([]);
        expect(recovered.cells[0].map((cell) => formatValue(cell.value))).toEqual(["4", "12"]);
        widget.dispose();
    });

    test("routes semantic graphic:position events into reactive definitions", () => {
        const state = session();
        const graphic = parseAndEvaluate(`
            $$origin := {: 20,30};
            $$point := $origin;
            $$total := {; p := $point; p[1] + p[2] };
            .Graphics.Graphic([200,120], [
                .Graphics.DragPoint($$point, 8, {= fill="#7c3aed" }, "Move test point")
            ])
        `, state);
        const changes = [];
        const widget = createWidgetSession(graphic, { onChange: (change) => changes.push(change) });
        const targetId = graphic.children[0].targetId;
        const result = widget.dispatch({
            type: "graphic:position",
            targetId,
            position: [40.5, 50],
            source: "pointer",
        });

        expect(widget.editMode).toBe("position");
        expect(widget.revision).toBe(1);
        expect(formatValue(result)).toBe("( 40..1/2, 50 )");
        expect(formatValue(state.context.get("point").peek())).toBe("( 40..1/2, 50 )");
        expect(formatValue(state.context.get("total").peek())).toBe("90..1/2");
        expect(state.context.get("point").live().dependencies).toEqual([]);
        expect(state.context.get("origin").live().dependents).toEqual([]);
        state.context.get("origin").replaceValue(parseAndEvaluate("{: 1,2}"));
        expect(formatValue(state.context.get("point").peek())).toBe("( 40..1/2, 50 )");
        expect(changes).toHaveLength(1);
        expect(changes[0].sourceEvent.cause.metadata).toMatchObject({
            widgetKind: "graphic",
            eventType: "graphic:position",
            targetId,
            inputSource: "pointer",
            replacedDependencies: ["origin"],
        });
        expect(() => widget.dispatch({
            type: "graphic:position",
            targetId: "missing",
            position: [1, 2],
        })).toThrow("Unknown Graphic drag target");
        widget.dispose();
    });

    test("routes semantic control:set events like $name := an exact value", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$origin := 1;
            $$x := $origin * 2;
            $$double := $x * 2;
            .ControlPanel([
                .Controls.Slider($$x, 0:5, 1/2, "x")
            ], "Parameters")
        `, state);
        const changes = [];
        const widget = createWidgetSession(panel, { onChange: (change) => changes.push(change) });
        const targetId = panel.controls[0].targetId;
        const result = widget.dispatch({
            type: "control:set",
            targetId,
            index: 7,
            source: "range",
        });

        expect(widget.editMode).toBe("control");
        expect(widget.revision).toBe(1);
        expect(formatValue(result)).toBe("3..1/2");
        expect(formatValue(state.context.get("x").peek())).toBe("3..1/2");
        expect(formatValue(state.context.get("double").peek())).toBe("7");
        expect(state.context.get("x").live().dependencies).toEqual([]);
        expect(state.context.get("origin").live().dependents).toEqual([]);
        expect(changes[0].sourceEvent.cause.metadata).toMatchObject({
            widgetKind: "control_panel",
            controlKind: "control_slider",
            eventType: "control:set",
            targetId,
            inputSource: "range",
            replacedDependencies: ["origin"],
        });
        expect(() => widget.dispatch({
            type: "control:set",
            targetId,
            index: 20,
        })).toThrow("between 0 and 10");
        expect(() => widget.dispatch({
            type: "control:set",
            targetId: "missing",
            index: 1,
        })).toThrow("Unknown ControlPanel target");
        widget.dispose();
    });

    test("Action controls evaluate a RiX callback and retain a frozen exact snapshot", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$frozen := [];
            $$a := 2;
            .ControlPanel([
                .Controls.Action({=
                    id="freeze",
                    target=$$frozen,
                    action=versions -> versions ++ [{= coefficient=$a }],
                    label="Freeze quadratic"
                })
            ])
        `, state);
        const control = panel.controls[0];
        const widget = createWidgetSession(panel);
        const result = widget.dispatch({
            type: "control:action",
            controlId: control.id,
            targetId: control.targetId,
            source: "action",
        });

        expect(formatValue(result)).toBe("[{= coefficient=2 }]");
        expect(formatValue(state.context.get("frozen").peek())).toBe("[{= coefficient=2 }]");
        expect(() => widget.stage({ type: "control:action", controlId: control.id, targetId: control.targetId }))
            .toThrow("Unsupported staged");
        widget.dispose();
    });

    test("commits multiple controls through one atomic reactive epoch", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$x := 1;
            $$y := 2;
            $$sum := $x + $y;
            .ControlPanel([
                .Controls.Slider($$x, 0:10, 1, "x"),
                .Controls.Slider($$y, 0:10, 1, "y")
            ])
        `, state);
        const graph = state.context.get("x").graph;
        const epoch = graph.epoch;
        const events = [];
        graph.subscribe((event) => events.push(event));
        const widget = createWidgetSession(panel);

        const values = widget.dispatch({
            type: "control:batch",
            changes: panel.controls.map((control, index) => ({
                controlId: control.id,
                targetId: control.targetId,
                index: index + 4,
                source: "batch",
            })),
        });

        expect(values.map(formatValue)).toEqual(["4", "5"]);
        expect(graph.epoch).toBe(epoch + 1);
        expect(events).toHaveLength(1);
        expect(events[0].changed).toEqual(["x", "y", "sum"]);
        expect(events[0].cause).toMatchObject({
            type: "control:batch",
            widgetKind: "control_panel",
            targets: panel.controls.map(({ targetId }) => targetId),
        });
        expect(formatValue(state.context.get("sum").peek())).toBe("9");
        widget.dispose();
    });

    test("stages controls without mutation, then applies or discards the set atomically", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$x := 1;
            $$y := 2;
            $$sum := $x + $y;
            .ControlPanel({=
                controls=[
                    .Controls.Slider($$x, 0:10, 1, "x"),
                    .Controls.Slider($$y, 0:10, 1, "y")
                ],
                mode=:staged
            })
        `, state);
        const graph = state.context.get("x").graph;
        const events = [];
        graph.subscribe((event) => events.push(event));
        const widget = createWidgetSession(panel);
        const [xControl, yControl] = panel.controls;

        widget.stage({ type: "control:set", controlId: xControl.id, targetId: xControl.targetId, index: 6 });
        widget.stage({ type: "control:set", controlId: yControl.id, targetId: yControl.targetId, index: 7 });
        expect(widget.stagedChanges()).toHaveLength(2);
        expect(formatValue(state.context.get("sum").peek())).toBe("3");
        expect(events).toHaveLength(0);

        widget.commit();
        expect(formatValue(state.context.get("sum").peek())).toBe("13");
        expect(events).toHaveLength(1);
        expect(widget.stagedChanges()).toHaveLength(0);

        widget.stage({ type: "control:set", controlId: xControl.id, targetId: xControl.targetId, index: 2 });
        expect(widget.clearStage()).toBe(1);
        expect(formatValue(state.context.get("x").peek())).toBe("6");
        expect(events).toHaveLength(1);
        widget.dispose();
    });

    test("rejects an invalid atomic control batch before changing any target", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$x := 1;
            $$y := 2;
            .ControlPanel([
                .Controls.Slider($$x, 0:10, 1, "x"),
                .Controls.Slider($$y, 0:3, 1, "y")
            ])
        `, state);
        const graph = state.context.get("x").graph;
        const epoch = graph.epoch;
        const widget = createWidgetSession(panel);

        expect(() => widget.dispatch({
            type: "control:batch",
            changes: [
                { controlId: panel.controls[0].id, targetId: panel.controls[0].targetId, index: 8 },
                { controlId: panel.controls[1].id, targetId: panel.controls[1].targetId, index: 9 },
            ],
        })).toThrow("between 0 and 3");
        expect(graph.epoch).toBe(epoch);
        expect(formatValue(state.context.get("x").peek())).toBe("1");
        expect(formatValue(state.context.get("y").peek())).toBe("2");
        widget.dispose();
    });

    test("a ControlPanel refreshes a named reactive $view through ordinary dollar dependencies", () => {
        const state = session();
        const reactiveReads = new Set();
        const view = parseAndEvaluate(`
            $$x := 2;
            $$square := $x^2;
            $$view := .Fragment([
                .ControlPanel([.Controls.Slider($$x, 0:5, 1, "x")], "Parameters"),
                .Text($square)
            ]);
            $view
        `, { ...state, reactiveReads });
        const observed = [...reactiveReads];
        expect(observed).toEqual([state.context.get("view")]);
        expect(formatValue(view.children[1])).toBe("4");

        const panel = view.children[0];
        const widget = createWidgetSession(panel);
        widget.dispatch({
            type: "control:set",
            targetId: panel.controls[0].targetId,
            index: 3,
            source: "range",
        });

        const refreshed = observed[0].peek();
        expect(formatValue(refreshed.children[0].controls[0].value)).toBe("3");
        expect(formatValue(refreshed.children[1])).toBe("9");
        widget.dispose();
    });

    test("all ControlPanel controls replace the same $$ identities with RiX values", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$amount := 1/3;
            $$scale := 1;
            $$enabled := 0;
            $$window := 2:5;
            .ControlPanel([
                .Controls.Input($$amount, "amount"),
                .Controls.Choice($$scale, [1/2, 1, 2], "scale"),
                .Controls.Toggle($$enabled, 0, 1, "enabled"),
                .Controls.Range($$window, 0:10, 1, "window"),
                .Controls.Reset($$amount, 1/3, "reset amount")
            ])
        `, state);
        const widget = createWidgetSession(panel);
        const byKind = new Map(panel.controls.map((control) => [control.kind, control]));

        const inputValue = parseAndEvaluate("7/9", state);
        widget.dispatch({
            type: "control:set",
            targetId: byKind.get("control_input").targetId,
            value: inputValue,
            source: "text",
        });
        widget.dispatch({
            type: "control:set",
            targetId: byKind.get("control_choice").targetId,
            index: 2,
            source: "select",
        });
        widget.dispatch({
            type: "control:set",
            targetId: byKind.get("control_toggle").targetId,
            index: 1,
            source: "checkbox",
        });
        widget.dispatch({
            type: "control:set",
            targetId: byKind.get("control_range").targetId,
            indices: [3, 7],
            source: "range",
        });

        expect(formatValue(state.context.get("amount").peek())).toBe("7/9");
        expect(formatValue(state.context.get("scale").peek())).toBe("2");
        expect(formatValue(state.context.get("enabled").peek())).toBe("1");
        expect(formatValue(state.context.get("window").peek())).toBe("3:7");
        widget.dispatch({
            type: "control:set",
            controlId: byKind.get("control_reset").id,
            targetId: byKind.get("control_reset").targetId,
            source: "reset",
        });
        expect(formatValue(state.context.get("amount").peek())).toBe("1/3");
        expect(widget.revision).toBe(5);
        expect(() => widget.dispatch({
            type: "control:set",
            targetId: byKind.get("control_range").targetId,
            indices: [8, 2],
        })).toThrow("lower endpoint");
        widget.dispose();
    });

    test("control IDs disambiguate two control kinds targeting one $$ identity", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            $$mode := 1;
            .ControlPanel([
                .Controls.Choice($$mode, [1, 4/5], "preset"),
                .Controls.Toggle($$mode, 1, 4/5, "enabled")
            ])
        `, state);
        const [choice, toggle] = panel.controls;
        expect(choice.id).not.toBe(toggle.id);
        expect(choice.targetId).toBe(toggle.targetId);

        const widget = createWidgetSession(panel);
        widget.dispatch({
            type: "control:set",
            controlId: choice.id,
            targetId: choice.targetId,
            index: 1,
        });
        expect(formatValue(state.context.get("mode").peek())).toBe("4/5");
        widget.dispatch({
            type: "control:set",
            controlId: toggle.id,
            targetId: toggle.targetId,
            index: 0,
        });
        expect(formatValue(state.context.get("mode").peek())).toBe("1");
        widget.dispose();
    });

    test("control validation, disabled, and read-only policies are enforced by the session", () => {
        const state = session();
        const panel = parseAndEvaluate(`
            ValidatePositive(x) -> x > 0 ?: _ ?_ "amount must be positive";
            $$amount := 1;
            $$locked := 2;
            $$paused := 3;
            .ControlPanel([
                .Controls.Input({=
                    target=$$amount,
                    label="amount",
                    validate=ValidatePositive
                }),
                .Controls.Slider({=
                    target=$$locked,
                    interval=0:5,
                    step=1,
                    disabled=1
                }),
                .Controls.Reset({=
                    target=$$paused,
                    initial=1,
                    readOnly=1
                })
            ])
        `, state);
        const [input, disabled, readOnly] = panel.controls;
        expect(input.validation).toBeNull();
        expect(disabled.disabled).toBe(true);
        expect(readOnly.readOnly).toBe(true);
        const widget = createWidgetSession(panel);

        expect(() => widget.dispatch({
            type: "control:set",
            controlId: input.id,
            targetId: input.targetId,
            value: parseAndEvaluate("-1"),
        })).toThrow("amount must be positive");
        expect(formatValue(state.context.get("amount").peek())).toBe("1");
        expect(() => widget.dispatch({
            type: "control:set",
            controlId: disabled.id,
            targetId: disabled.targetId,
            index: 4,
        })).toThrow("disabled");
        expect(() => widget.dispatch({
            type: "control:set",
            controlId: readOnly.id,
            targetId: readOnly.targetId,
        })).toThrow("read-only");
        widget.dispose();
    });

    test("rejects malformed and out-of-range events", () => {
        const sheet = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet(.Bind(m))
        `);
        const widget = createWidgetSession(sheet);
        expect(() => widget.dispatch({ type: "click", index: [1, 1], value: null })).toThrow("Unsupported widget event");
        expect(() => widget.dispatch({ type: "sheet:set", index: [1, 3], value: null })).toThrow("out of range");
        widget.dispose();
    });
});
