import { describe, expect, it } from "vitest";
import { version } from "./index";

describe("public entrypoint", () => {
	it("exports a package version string", () => {
		expect(version).toBe("0.0.0");
	});
});
