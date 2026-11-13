#!/usr/bin/env node
import { createLspServer, createStdioTransport } from "../src/tools/lsp/server.js";

const transport = createStdioTransport();
const server = createLspServer(transport);
transport.onMessage((message) => server.receive(message));

