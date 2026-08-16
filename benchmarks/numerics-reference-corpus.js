/**
 * Stable conformance witnesses for certified RiX real functions.
 *
 * Each published decimal is represented as a tiny outward interval rather
 * than pretending that a rounded decimal is the exact transcendental value.
 * `lower` and `upper` are decimal strings and are converted to exact RiX
 * Rationals by the conformance test and benchmark runner.
 */
export const numericsReferenceCases = [
    {
        name: "pi",
        expression: ".numerics.Pi()",
        lower: "3.141592653589793238462643383279",
        upper: "3.141592653589793238462643383280",
        width: "1/10000000",
        maxWork: 400,
        reference: "NIST DLMF §3.12(i)",
    },
    {
        name: "exp(1)",
        expression: ".numerics.Exp(1)",
        lower: "2.718281828459045235360287471352",
        upper: "2.718281828459045235360287471353",
        width: "1/10000000",
        maxWork: 600,
        reference: "NIST DLMF §4.2",
    },
    {
        name: "log(2)",
        expression: ".numerics.Log(2)",
        lower: "0.693147180559945309417232121457",
        upper: "0.693147180559945309417232121459",
        width: "1/10000000",
        maxWork: 800,
        reference: "NIST DLMF §4.2",
    },
    {
        name: "sin(1)",
        expression: ".numerics.Sin(1)",
        lower: "0.841470984807896506652502321630",
        upper: "0.841470984807896506652502321631",
        width: "1/10000000",
        maxWork: 800,
        reference: "NIST DLMF §4.14",
    },
    {
        name: "gamma(1/2)",
        expression: ".numerics.Gamma(1/2)",
        lower: "1.77245",
        upper: "1.77246",
        width: "1/1000",
        maxWork: 1200,
        reference: "NIST DLMF §5.4(i)",
    },
    {
        name: "J_2(1)",
        expression: ".bessel.J(2, 1)",
        lower: "0.1149",
        upper: "0.1150",
        width: "1/1000",
        maxWork: 2000,
        reference: "NIST DLMF §10.2",
    },
    {
        name: "Y_2(1)",
        expression: ".bessel.Y(2, 1)",
        lower: "-1.650682606816254391077226766118",
        upper: "-1.650682606816254391077226766116",
        width: "1/1000",
        maxWork: 7000,
        reference: "NIST DLMF §10.2",
    },
    {
        name: "normal PDF(0)",
        expression: ".stats.NormalPDF(0)",
        lower: "0.398942280401432677939946059933",
        upper: "0.398942280401432677939946059935",
        width: "1/1000000",
        maxWork: 2500,
        reference: "NIST/SEMATECH e-Handbook §1.3.6.6.1",
    },
    {
        name: "normal CDF(1)",
        expression: ".stats.NormalCDF(1)",
        lower: "0.841344746068542948585232545631",
        upper: "0.841344746068542948585232545633",
        width: "1/100000",
        maxWork: 3500,
        reference: "NIST/SEMATECH e-Handbook §1.3.6.6.1",
    },
    {
        name: "normal quantile(0.975)",
        expression: ".stats.NormalQuantile(975/1000)",
        lower: "1.959963984540054235524594430519",
        upper: "1.959963984540054235524594430521",
        width: "1/1000",
        maxWork: 12000,
        reference: "NIST standard-normal probability tables",
    },
];

export function decimalToRixRational(decimal) {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal);
    if (!match) throw new Error(`Invalid corpus decimal: ${decimal}`);
    const [, sign, whole, fraction = ""] = match;
    const numerator = `${sign}${whole}${fraction}`;
    return fraction.length === 0 ? numerator : `${numerator}/10^${fraction.length}`;
}
