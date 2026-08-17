/** Serializable Scene3D-to-WebGL lowering plus a browser-safe executor. */

import {
    diagnostic,
    field,
    numberValue,
    option,
    plainValue,
    rixString,
    sequence,
} from "../renderers/common.js";

const SCENE_SCHEMA = "rix.scene3d@1";
const REALIZED_SCHEMA = "rix.scene3d.realized@1";

function text(value, fallback = null) {
    return rixString(value) ?? (typeof value === "string" ? value : fallback);
}

function vector(value, length, label) {
    const values = sequence(value, label);
    if (values.length !== length) throw new Error(`${label} must contain ${length} coordinates`);
    return values.map((entry, index) => numberValue(entry, `${label} coordinate ${index + 1}`));
}

function indices(value, label) {
    return sequence(value, label).map((entry, index) => sequence(entry, `${label} ${index + 1}`)
        .map((item) => numberValue(item, `${label} index`) - 1));
}

function color(value, fallback = "#275dad") {
    const source = text(value, fallback);
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(source || "");
    const hex = match?.[1]?.length === 3
        ? [...match[1]].map((digit) => `${digit}${digit}`).join("")
        : match?.[1] || fallback.slice(1);
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function style(value) {
    const opacity = numberValue(field(value, "opacity", 1), "Scene3D style opacity");
    return {
        color: color(field(value, "color")),
        opacity,
        width: numberValue(field(value, "width", 1), "Scene3D style width"),
    };
}

function primitive(value, index) {
    const kind = text(field(value, "kind"));
    const points = sequence(field(value, "points"), `Scene3D primitive ${index + 1} points`)
        .map((point, pointIndex) => vector(point, 3, `Scene3D primitive ${index + 1} point ${pointIndex + 1}`));
    return {
        kind,
        points,
        segments: indices(field(value, "segments", { type: "sequence", values: [] }), `Scene3D primitive ${index + 1} segments`),
        triangles: indices(field(value, "triangles", { type: "sequence", values: [] }), `Scene3D primitive ${index + 1} triangles`),
        radius: kind === "points" ? numberValue(field(value, "radius", 3), "Scene3D point radius") : null,
        text: text(field(value, "text")),
        style: style(field(value, "style")),
        pickId: text(field(value, "pickid")),
        label: text(field(value, "label")),
        interaction: plainValue(field(value, "interaction")),
        annotationPolicy: plainValue(field(value, "annotationpolicy")),
    };
}

function cameraPlan(value) {
    return {
        projection: text(field(value, "projection"), "perspective"),
        position: vector(field(value, "position"), 3, "Scene3D camera position"),
        target: vector(field(value, "target"), 3, "Scene3D camera target"),
        up: vector(field(value, "up"), 3, "Scene3D camera up"),
        fov: numberValue(field(value, "fov", 50), "Scene3D camera fov"),
        near: numberValue(field(value, "near", 0.01), "Scene3D camera near"),
        far: numberValue(field(value, "far", 1000), "Scene3D camera far"),
        scale: field(value, "scale") == null ? null : numberValue(field(value, "scale"), "Scene3D camera scale"),
        orbit: plainValue(field(value, "orbit")),
    };
}

function lightPlan(value, index) {
    const kind = text(field(value, "kind"));
    return {
        kind,
        color: color(field(value, "color"), "#ffffff"),
        intensity: numberValue(field(value, "intensity", 1), `Scene3D light ${index + 1} intensity`),
        ...(kind === "directional_light" ? { direction: vector(field(value, "direction"), 3, "Directional light direction") } : {}),
        ...(kind === "point_light" ? { position: vector(field(value, "position"), 3, "Point light position") } : {}),
    };
}

export function createWebGLPlan(scene, options = null) {
    if (text(field(scene, "type")) !== "output"
        || text(field(scene, "kind")) !== "scene3d"
        || text(field(scene, "schema")) !== SCENE_SCHEMA) {
        throw new Error("webgl accepts a Scene3D scene");
    }
    const realized = field(scene, "realized");
    if (text(field(realized, "schema")) !== REALIZED_SCHEMA) {
        throw new Error(`webgl requires the public ${REALIZED_SCHEMA} realization on a Scene3D scene`);
    }
    const width = numberValue(option(options, "width", 640), "WebGL viewport width");
    const height = numberValue(option(options, "height", 480), "WebGL viewport height");
    if (width <= 0 || height <= 0) throw new Error("WebGL viewport dimensions must be positive");
    const mode = text(option(options, "mode", "solid"), "solid");
    if (!["solid", "wireframe"].includes(mode)) throw new Error("WebGL mode must be 'solid' or 'wireframe'");
    const primitives = sequence(field(realized, "primitives"), "Scene3D realized primitives").map(primitive);
    const annotations = [];
    const drawCalls = [];
    const picking = {};
    let approximated = false;
    primitives.forEach((entry, primitiveIndex) => {
        if (entry.points.some((point) => point.some((coordinate) => Math.fround(coordinate) !== coordinate))) approximated = true;
        if (entry.kind === "annotation") {
            const annotation = {
                primitive: primitiveIndex,
                position: entry.points[0],
                text: entry.text,
                color: entry.style.color,
                opacity: entry.style.opacity,
                pickId: entry.pickId,
                label: entry.label,
                interaction: entry.interaction,
                policy: entry.annotationPolicy,
            };
            annotations.push(annotation);
            if (entry.pickId) picking[entry.pickId] = { kind: "annotation", index: annotations.length - 1, label: entry.label, interaction: entry.interaction };
            return;
        }
        let drawMode;
        let drawIndices;
        if (entry.kind === "mesh") {
            drawMode = mode === "wireframe" ? "lines" : "triangles";
            drawIndices = (mode === "wireframe" ? entry.segments : entry.triangles).flat();
        } else if (entry.kind === "lines") {
            drawMode = "lines";
            drawIndices = entry.segments.flat();
        } else if (entry.kind === "points") {
            drawMode = "points";
            drawIndices = entry.points.map((_, pointIndex) => pointIndex);
        } else throw new Error(`WebGL renderer does not support Scene3D primitive '${entry.kind}'`);
        const call = {
            primitive: primitiveIndex,
            mode: drawMode,
            positions: entry.points,
            indices: drawIndices,
            color: [...entry.style.color, entry.style.opacity],
            lineWidth: entry.style.width,
            pointSize: entry.radius ?? 1,
            pickId: entry.pickId,
            label: entry.label,
            interaction: entry.interaction,
        };
        drawCalls.push(call);
        if (entry.pickId) picking[entry.pickId] = { kind: "drawCall", index: drawCalls.length - 1, label: entry.label, interaction: entry.interaction };
    });
    const diagnostics = [];
    if (approximated) diagnostics.push(diagnostic(
        "webgl-float32-approximation",
        "Exact Scene3D coordinates are rounded to Float32 when the WebGL plan executes.",
    ));
    if (drawCalls.some(({ mode: drawMode, lineWidth }) => drawMode === "lines" && lineWidth !== 1)) diagnostics.push(diagnostic(
        "webgl-line-width-portability",
        "WebGL implementations may clamp Scene3D line widths to one device pixel.",
        "info",
    ));
    if (annotations.length) diagnostics.push(diagnostic(
        "webgl-annotation-overlay",
        "Scene3D annotations are returned as projected host overlays so text remains accessible and interactive.",
        "info",
    ));
    const lights = sequence(field(scene, "lights"), "Scene3D lights").map(lightPlan);
    if (lights.length) diagnostics.push(diagnostic(
        "webgl-flat-material-baseline",
        "The baseline WebGL executor retains light descriptors but draws portable flat material colors.",
        "info",
    ));
    return {
        schema: "rix.webgl-plan@1",
        sourceSchema: SCENE_SCHEMA,
        viewport: { width, height },
        background: color(option(options, "background", "#ffffff"), "#ffffff"),
        coordinateSystem: plainValue(field(realized, "coordinatesystem")),
        mode,
        camera: cameraPlan(field(scene, "camera")),
        lights,
        drawCalls,
        annotations,
        picking,
        diagnostics,
    };
}

function subtract(left, right) {
    return left.map((value, index) => value - right[index]);
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
    return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
}

function normalize(value) {
    const length = Math.hypot(...value);
    if (!length) throw new Error("WebGL camera vectors must not be degenerate");
    return value.map((entry) => entry / length);
}

function multiply4(left, right) {
    const result = new Array(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
            for (let index = 0; index < 4; index += 1) result[column * 4 + row] += left[index * 4 + row] * right[column * 4 + index];
        }
    }
    return result;
}

function lookAt(eye, target, up) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return [
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ];
}

function projection(camera, aspect, drawCalls) {
    if (camera.projection === "perspective") {
        const f = 1 / Math.tan(camera.fov * Math.PI / 360);
        return [
            f / aspect, 0, 0, 0, 0, f, 0, 0,
            0, 0, (camera.far + camera.near) / (camera.near - camera.far), -1,
            0, 0, (2 * camera.far * camera.near) / (camera.near - camera.far), 0,
        ];
    }
    const points = drawCalls.flatMap(({ positions }) => positions);
    const radius = points.length ? Math.max(1, ...points.map((point) => Math.hypot(...subtract(point, camera.target)))) : 1;
    const vertical = camera.scale || radius * 2.2;
    const horizontal = vertical * aspect;
    return [
        2 / horizontal, 0, 0, 0, 0, 2 / vertical, 0, 0,
        0, 0, -2 / (camera.far - camera.near), 0,
        0, 0, -(camera.far + camera.near) / (camera.far - camera.near), 1,
    ];
}

function shader(gl, type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (gl.getShaderParameter && !gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
        throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(value) || "unknown error"}`);
    }
    return value;
}

function transformPoint(matrix, point) {
    const source = [...point, 1];
    const result = [0, 0, 0, 0];
    for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) result[row] += matrix[column * 4 + row] * source[column];
    }
    return result;
}

/** Execute a rix.webgl-plan@1 against WebGLRenderingContext or WebGL2RenderingContext. */
export function paintWebGLPlan(gl, plan) {
    if (!gl || typeof gl.createBuffer !== "function") throw new Error("WebGL plan requires a WebGL rendering context");
    if (plan?.schema !== "rix.webgl-plan@1") throw new Error("Unsupported WebGL plan schema");
    const vertex = shader(gl, gl.VERTEX_SHADER, "attribute vec3 a_position; uniform mat4 u_mvp; uniform float u_point_size; void main(){gl_Position=u_mvp*vec4(a_position,1.0);gl_PointSize=u_point_size;}");
    const fragment = shader(gl, gl.FRAGMENT_SHADER, "precision mediump float; uniform vec4 u_color; void main(){gl_FragColor=u_color;}");
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (gl.getProgramParameter && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`WebGL program linking failed: ${gl.getProgramInfoLog(program) || "unknown error"}`);
    }
    gl.useProgram(program);
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const matrixLocation = gl.getUniformLocation(program, "u_mvp");
    const colorLocation = gl.getUniformLocation(program, "u_color");
    const pointSizeLocation = gl.getUniformLocation(program, "u_point_size");
    const { width, height } = plan.viewport;
    const view = lookAt(plan.camera.position, plan.camera.target, plan.camera.up);
    const matrix = multiply4(projection(plan.camera, width / height, plan.drawCalls), view);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(...plan.background, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(matrixLocation, false, new Float32Array(matrix));
    for (const call of plan.drawCalls) {
        const vertices = call.indices.flatMap((index) => call.positions[index]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(colorLocation, new Float32Array(call.color));
        gl.uniform1f(pointSizeLocation, call.pointSize);
        if (call.mode === "lines" && gl.lineWidth) gl.lineWidth(call.lineWidth);
        gl.drawArrays(call.mode === "triangles" ? gl.TRIANGLES : call.mode === "lines" ? gl.LINES : gl.POINTS, 0, call.indices.length);
        if (gl.deleteBuffer) gl.deleteBuffer(buffer);
    }
    const annotations = plan.annotations.map((annotation) => {
        const clip = transformPoint(matrix, annotation.position);
        const visible = clip[3] > 0 && Math.abs(clip[0]) <= clip[3] && Math.abs(clip[1]) <= clip[3] && Math.abs(clip[2]) <= clip[3];
        return {
            ...annotation,
            visible,
            screen: clip[3] === 0 ? null : [width * (clip[0] / clip[3] + 1) / 2, height * (1 - clip[1] / clip[3]) / 2],
            depth: clip[3] === 0 ? null : clip[2] / clip[3],
        };
    });
    return { context: gl, picking: plan.picking, annotations, matrix };
}
