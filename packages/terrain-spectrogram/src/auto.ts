import { registerTerrainProgram } from "./index";

// Auto-register "terrain" program upon importing this subpath
registerTerrainProgram("terrain");

export * from "./index";
