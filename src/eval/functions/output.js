import { createFigure, createFragment, createGraphic, createGrid, createHeading, createParagraph, createPath, createSlide, createSlides, createTable, createText } from "../../runtime/output.js";

const capability = (impl, doc) => ({ impl: (args) => impl(args), pure: true, doc });

export const outputFunctions = {
    TEXT: capability(createText, "Create a portable text output node"),
    PARAGRAPH: capability(createParagraph, "Create a portable paragraph output node"),
    HEADING: capability(createHeading, "Create a portable document heading"),
    FRAGMENT: capability(createFragment, "Compose portable output values"),
    TABLE: capability(createTable, "Create a structured output table"),
    GRID: capability(createGrid, "Create a mathematical layout grid"),
    PATH: capability(createPath, "Create a portable 2D path scene node"),
    GRAPHIC: capability(createGraphic, "Create a portable 2D scene"),
    FIGURE: capability(createFigure, "Wrap output with figure metadata"),
    SLIDE: capability(createSlide, "Create a presentation slide"),
    SLIDES: capability(createSlides, "Create a sequential presentation deck"),
};
