# Observed evaluation handles

Browser and notebook hosts can evaluate a retained reactive output once and
mount it without duplicating RiX's reactive-read detection:

```js
const result = parseAndEvaluateObserved(source, options);
const disposeWidgets = mountOutputWidgets(root, result.value, {
  observe: result.observe,
});

// When the host removes the output:
disposeWidgets();
result.dispose();
```

`parseAndEvaluateObserved` and `parseAndEvaluateObservedAsync` return
`{ value, observe, dispose }`. `observe` is `null` for ordinary values and for
derived expressions that do not return one unambiguous reactive source. A
listener receives `(nextValue, event)`. Its unsubscribe function and the
handle's `dispose()` are idempotent; neither disposes the underlying reactive
identity owned by the RiX context.

Hosts that already parse and lower source can use `evaluateObserved` or
`evaluateObservedAsync` for one IR node. Their optional `selectValue` callback
supports host publication commands whose displayed value is selected during
evaluation rather than returned by the command itself.
