import { createNodeHostAdapter } from "../runtime/host-adapter-node.js";
import { setDefaultHostAdapter } from "../runtime/host-adapter.js";

setDefaultHostAdapter(createNodeHostAdapter());

export * from "./index.js";
export { createNodeHostAdapter } from "../runtime/host-adapter-node.js";
