import { Rational, RationalInterval } from "@ratmath/core";

/** Difficult exact sources shared by metadata, Canvas, and browser checks. */
export function coordinateScene() {
    const denominator = 10n ** 400n;
    const circle = (x, y, id) => ({ type: "output", kind: "circle", center: [x, new Rational(y)],
        radius: new Rational(1n, 3n), style: new Map([["id", id], ["fill", "#2563eb"]]) });
    return { type: "output", kind: "graphic", size: [new Rational(12), new Rational(8)], metadata: null,
        children: [
            circle(new Rational(denominator + 1n, denominator), 1, "huge-rational"),
            circle(new RationalInterval(new Rational(1n, denominator), new Rational(2n, denominator)), 2, "narrow-interval"),
            circle(new RationalInterval(5, 4), 3, "reversed-interval"),
            circle(new Rational(1n, 3n), 4, "collision-a"),
            circle(new Rational(3334n, 10000n), 5, "collision-b"),
            { type: "output", kind: "clip", bounds: [0, 0, 8, 8], children: [
                { type: "output", kind: "text_mark", position: [new Rational(1n, 3n), 6], text: "First label",
                    style: new Map([["id", "label-a"], ["size", new Rational(1n, 2n)]]) },
                { type: "output", kind: "text_mark", position: [new Rational(3334n, 10000n), 6], text: "Second label",
                    style: new Map([["id", "label-b"], ["size", new Rational(1n, 2n)]]) },
            ] },
        ] };
}

export function denseLabelScene() {
    return { type: "output", kind: "graphic", size: [new Rational(4), new Rational(3)], metadata: null,
        children: Array.from({ length: 64 }, (_, index) => ({ type: "output", kind: "text_mark",
            position: [new Rational(1000000n + BigInt(index), 3000000n), new Rational(1)], text: `Dense label ${index + 1}`,
            style: new Map([["id", `dense-${index + 1}`], ["size", new Rational(1n, 5n)]]) })) };
}
