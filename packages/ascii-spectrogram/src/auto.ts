import { registerAsciiRenderer } from "./index";

// Auto-register "ascii" renderer upon importing this subpath
registerAsciiRenderer("ascii");

export * from "./index";
