import { registerTopographicProgram } from "./index";

// Auto-register "topographic" program upon importing this subpath
registerTopographicProgram("topographic");

export * from "./index";
