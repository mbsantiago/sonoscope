import { describe, expect, it } from "vitest";
import { TypedEventEmitter } from "./events";

type Events = { ping: { value: number } };

describe("TypedEventEmitter", () => {
	it("emits and unsubscribes handlers", () => {
		const emitter = new TypedEventEmitter<Events>();
		const values: number[] = [];
		const off = emitter.on("ping", (event) => values.push(event.value));
		emitter.emit("ping", { value: 1 });
		off();
		emitter.emit("ping", { value: 2 });
		expect(values).toEqual([1]);
	});
});
