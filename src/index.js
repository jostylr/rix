export {
    parse, RixParseError, tokenize, posToLineCol,
    BUILTIN_PRECEDENCE_BANDS, extractOperatorDeclarations, extractOperatorDeclarationsFromSource,
    mergeOperatorDefinitions, parseOperatorDeclarationLine,
} from "./parser/index.js";
export { createSystemManifest, createSystemLookup } from "./runtime/system-manifest.js";
export { complete, REPL_COMMANDS } from "./repl/completion.js";
export {
    lower, lowerNode, ir, IR, Registry, evaluate, evaluateAsync, evaluateObserved, evaluateObservedAsync,
    createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync,
    parseAndEvaluateObserved, parseAndEvaluateObservedAsync,
    drainBackgroundTasks, irToText, irListToText, formatValue, formatValueSource, formatNumberWithProfile,
    RIX_LINT_LEVELS, RIX_LINT_PROFILES, RIX_LINT_RULES,
    analyzeRix, lintRix, explainRixScopes, formatLintDiagnostic,
    applyRixLintFixes, lintDiagnosticsToSarif,
} from "./eval/index.js";
export { UNDECIDED, UndecidedDiagnostic, undecidedDiagnostic, undecidedReason, isUndecided, decisionState, reviveDecisionValue } from "./runtime/decision.js";
export { INTERVAL_LINEAR_SCHEMA, INTERVAL_NEWTON_BOX_SCHEMA, BOX_SUBDIVISION_SCHEMA, VALIDATED_BOX_CHECKER,
    evaluateIntervalLinearSolve, evaluateIntervalNewtonBox, evaluateBoxSubdivision, resumeBoxSubdivision,
    checkValidatedBoxResult } from "./runtime/validated-boxes.js";
export { HaloNeighborhood, isHaloNeighborhood } from "./runtime/halo.js";
export {
    Context, SystemContext, PluginCatalog, parsePluginYaml, readPluginHeader, readSourceHeader,
    HOST_ADAPTER_ENV, createBrowserHostAdapter, getDefaultHostAdapter, getHostAdapter, setDefaultHostAdapter,
    EVALUATION_BUDGET_ENV, EvaluationLimitError,
    RendererRegistry, UnsupportedRenderError, createRenderResult, createRendererCollection, createRendererPluginCollection, isRenderResult, renderResultValue,
    Cell, HOLE, isHole, DiagnosticsRegistry,
    createFormulaSheet, isFormulaSheet, createLiveView, isLiveView, isReactiveSource,
    RIXCEL_FORMAT, RIXCEL_VERSION, RIXCEL_ASSIGNMENT_MODES,
    appendRixCelEvent, clearRixCelDraft, createRixCelDocument,
    materializeRixCelDocument, parseRixCelDocument, exportRixCelDocument,
    rixCelEventCommand, setRixCelCursor, setRixCelDraft, stringifyRixCelDocument,
    importRixCelDocument, rewriteRixCelReferences,
    createReactiveGraph, isReactiveGraph, isReactiveNode, REACTIVE_READ_ENV,
    getDiagnostics, RixAbort, isRixAbort, createEvent, runtimeDefaults,
    REFINEMENT_REQUEST_SCHEMA, REFINEMENT_RESULT_SCHEMA, REFINEMENT_CAPABILITIES_SCHEMA,
    normalizeRefinementRequest, refinementEffectiveLimits, refinementSupports,
    checkRefinementResult, unsupportedRefinementResult, refinementOutcome,
    RANGE_EVIDENCE_SCHEMA, RANGE_CHECKER_VOCABULARY, checkRangeEvidence,
    CALCULUS_GRAPH_RANGE_SCHEMA, CALCULUS_GRAPH_RANGE_CHECKER,
    CALCULUS_GRAPH_SIMPLIFICATION_SCHEMA, CALCULUS_GRAPH_SIMPLIFICATION_CHECKER,
    CALCULUS_GRAPH_REWRITE_SCHEMA, CALCULUS_GRAPH_REWRITE_CHECKER,
    calculusGraphStructuralKey, evaluateCalculusGraphRange,
    simplifyCalculusGraph, checkCalculusGraphSimplification,
    checkCalculusGraphRangeResult, calculusGraphRangeValue,
    calculusGraphRangeCheckValue, recognizeCalculusGraph,
    calculusGraphRecognitionValue, calculusGraphSimplificationValue,
    calculusGraphSimplificationCheckValue, differentiateCalculusPrimitiveGraphN,
    proposeCalculusGraphRewrite, checkCalculusGraphRewrite,
    calculusGraphRewriteValue, calculusGraphRewriteCheckValue,
    differentiateCalculusPrimitiveGraph,
    checkCalculusDerivativeTransformation, derivativeObligationChecks, calculusDerivativeCheckValue,
    CALCULUS_DERIVATIVE_SIGN_SCHEMA, evaluateCalculusDerivativeSign,
    calculusDerivativeSignValue,
    CALCULUS_LIPSCHITZ_RANGE_SCHEMA, CALCULUS_TAYLOR_RANGE_SCHEMA,
    CALCULUS_STRATEGY_RANGE_CHECKER,
    evaluateCalculusLipschitzRange, evaluateCalculusTaylorRange,
    checkCalculusStrategyRangeResult,
    calculusLipschitzRangeValue, calculusTaylorRangeValue,
    substituteCalculusGraphVariable,
    RATIONAL_BOX_SCHEMA, MULTIVARIATE_RANGE_REQUEST_SCHEMA,
    JACOBIAN_BOX_RANGE_SCHEMA, AFFINE_BOX_RANGE_SCHEMA,
    TAYLOR_MODEL_BOX_RANGE_SCHEMA, MULTIVARIATE_RANGE_CHECKER,
    KRAWCZYK_BOX_SCHEMA, KRAWCZYK_CHECKER,
    createRationalBox, createMultivariateRangeRequest,
    evaluateJacobianBoxRange, evaluateAffineBoxRange,
    evaluateTaylorModelBoxRange, checkMultivariateRangeResult,
    evaluateKrawczykBox, checkKrawczykResult,
    rationalBoxValue, multivariateRangeRequestValue,
    jacobianBoxRangeValue, affineBoxRangeValue,
    taylorModelBoxRangeValue, multivariateRangeCheckValue,
    krawczykBoxValue, krawczykCheckValue,
    RANGE_SET_INTERCHANGE_VERSION, RANGE_SET_STABLE_VERSIONS,
    RangeSetInterchangeVersionError, rangeSetMigrationPlan,
    createRngImplementation, createRuntimeRng, configureRuntimeRandom,
    OperationalFault, TimeoutFault, CleanupGraceFault, isOperationalFault, faultToRixValue,
    createAsyncStream, asyncStreamFromIterable, createHotAsyncStream, isAsyncStream,
    closeAsyncStream, asyncStreamStatus, asyncStreamCanCompleteWithoutPull,
    AsyncScheduler, registerBackgroundTask,
    registerAsyncResource, unregisterAsyncResource, disposeAsyncResources,
    createDefaultUnitCollection, createUnit, constructQuantity, convertQuantity,
    parseUnitExpression, isUnitValue, isQuantity, createDefaultExactCollection,
    createExactGenerator, exactGeneratorFromPolynomial, isExactValue,
    createDefaultComplexCollection, complexConjugate, complexParts,
    complexFromParts, complexNormSquared,
    CAYLEY_INFINITY, isCayleyValue, isCayleyInfinity, exactSquareRoot,
    createCayley, cayleyFromCartesian, cayleyCartesian, addCayley,
    subtractCayley, multiplyCayley, divideCayley, powCayley,
    negateCayley, conjugateCayley, inverseCayley, equalCayley,
    isOutputValue, outputValueKind, isInlineOutput, isBlockOutput, formatOutputText, renderOutputHtml, renderGraphicSvg, createSheet, createSheetSnapshot,
    createEmphasis, createStrong, createCode, createMath, createLink, createLineBreak,
    createSection, createList, createListItem, createQuote, createCallout, createCodeBlock, createMathBlock,
    createAsset, createImage, createAudio, createVideo,
    createControlPanelSnapshot, serializeControlPanel, renderControlPanelStaticHtml, renderControlPanelMarkdown,
    createAlgebraOutputCollection, createGraphicsOutputCollection, createTimelineOutputCollection, createControlsOutputCollection, createSyntheticDivision, createPlotOutputCollection,
    createPolynomialPlot, createGroup, createTransform, createTextMark,
    createRectangle, createCircle, createDragPoint, createGraphicAction, createClip, createSliderControl, createInputControl,
    createChoiceControl, createToggleControl, createRangeControl, createResetControl, createActionControl, createHoldControl, createControlPanel, createSnapshots, createTimelineTrack, createTimelineSequence, createTimelineManifest, createTimelineRender,
} from "./runtime/index.js";
export { createDrawPluginCollection, installDrawPlugin } from "../plugins/draw/draw.plugin.rix.js";
export { installBundledPlugins } from "../plugins/bundled.js";
export {
    RIXCEL_FORMULA_CLIPBOARD_TYPE,
    enhanceSheetViews,
    moveSheetSelection,
    parseSheetFormulaClipboard,
    sheetDisplayAddress,
    sheetPlaneKey,
} from "./tools/sheet-view.js";
export { exactExplorationInterval, boundedExactExplorationInterval, createExactNumberLineGraphic, traceExactArithmetic } from "./tools/exact-exploration.js";
export { WidgetSession, GraphicWidgetSession, ControlPanelWidgetSession, createWidgetSession } from "./tools/widget-session.js";
export {
    createGraphicDensityPlan, enhanceGraphicViews, graphicPointFromClient,
    graphicSelectionCatalog, serializeGeometryConstructionRecord,
    updateGraphicGesture,
} from "./tools/graphic-view.js";
export {
    GEOMETRY_CONSTRUCTION_RECORD_SCHEMA, GEOMETRY_CONSTRUCTION_SOURCE_SCHEMA,
    GeometryConstructionSource, createGeometryAuthoringProgram,
    decodeGeometryConstructionRecord, encodeGeometryConstructionSource,
    geometryConstructionRecordFromGraph, validateGeometryConstructionRecord,
} from "./tools/geometry-construction-codec.js";
export {
    createAudioTracePlan, createGraphicsTextPlan, graphicValueExactness,
    renderGraphicAccessibilityHtml,
} from "./tools/graphic-accessibility.js";
export {
    audioTraceFrequency, createAudioTraceState, enhanceAudioTraceView, stepAudioTrace,
} from "./tools/audio-trace-view.js";
export {
    createScene3DViewState, describeScene3DSelection, dollyScene3DCamera,
    enhanceScene3DViews, layoutScene3DAnnotations, orbitScene3DCamera,
    pickScene3DPlan, projectScene3DPoint, renderScene3DSvgFallback,
    resetScene3DCamera, scene3DSelectionCatalog, toggleScene3DProjection,
    truckScene3DCamera, updateScene3DGesture,
} from "./tools/scene3d-view.js";
export { enhanceControlPanelViews, enhanceControlShortcuts } from "./tools/control-panel-view.js";
export {
    createTimelineViewState, enhanceTimelineView, enhanceTimelineViews,
    setTimelineFrame, stepTimelineFrame, timelineFrameInterval,
} from "./tools/timeline-view.js";
export { mountOutputWidgets, restoreGraphicFocus, restoreControlPanelFocus } from "./tools/output-widgets.js";
export {
    RIX_LANGUAGE_SERVICE_VERSION,
    RIX_SEMANTIC_TOKEN_TYPES,
    RIX_SEMANTIC_TOKEN_MODIFIERS,
    analyzeRixDocument,
    astNodes,
    checkRixFormat,
    codeActionsForRange,
    completionAt,
    createRixDocumentStore,
    definitionsAt,
    formatRix,
    hoverAt,
    lintRuleCatalog,
    occurrenceAt,
    referencesAt,
    renameAt,
} from "./tools/language-service/index.js";

export { OUTPUT_DOCUMENT_SCHEMA, encodeOutputJSON, decodeOutputJSON, snapshotOutputDocument } from "./runtime/output-json.js";

export { NUMERIC_PRESENTATION_SCHEMA, createNumericPolicy, presentNumericValue, numericFormatter, withNumericPresentation } from "./runtime/numeric-presentation.js";

export { OUTPUT_BUNDLE_SCHEMA, OUTPUT_ASSET_MANIFEST_SCHEMA, OUTPUT_ASSET_LIMITS, normalizeAssetReference, isExternalAssetReference, createMemoryAssetStore, hashAssetBytes, resolveAssetManifest, bundleOutputDocument, encodeOutputBundle, decodeOutputBundle } from "./runtime/output-assets.js";
export { createOutputBundleHost } from "./runtime/output-bundle-host.js";

export { PUBLICATION_PLAN_SCHEMA, PUBLICATION_PROJECT_SCHEMA, createPublicationPlan, resolvePublicationPlan, withPublicationPlan, validatePublicationTree, visitPublicationTree, publicationDiagnostics, quartoProjectYaml } from "./runtime/publication-plan.js";

export { createPublicationProject, readPublicationProject } from "./runtime/publication-project.js";
