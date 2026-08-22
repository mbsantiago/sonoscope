import { describe, expect, it, vi } from "vitest";
import { ViewportController } from "./viewport";

describe("ViewportController", () => {
  it("initializes with default values", () => {
    const controller = new ViewportController({
      totalDuration: 20,
      minFrequency: 0,
      maxFrequency: 20000,
    });

    const vp = controller.getViewport();
    expect(vp.startTime).toBe(0);
    expect(vp.endTime).toBe(10);
    expect(vp.duration).toBe(10);
    expect(vp.totalDuration).toBe(20);
    expect(vp.minFrequency).toBe(0);
    expect(vp.maxFrequency).toBe(20000);
  });

  it("updates viewport state via setViewport", () => {
    const controller = new ViewportController({
      totalDuration: 20,
    });

    const listener = vi.fn();
    controller.on("viewportchange", listener);

    controller.setViewport({ startTime: 2, endTime: 6 });

    const vp = controller.getViewport();
    expect(vp.startTime).toBe(2);
    expect(vp.endTime).toBe(6);
    expect(vp.duration).toBe(4);
    expect(listener).toHaveBeenCalledWith({
      viewport: vp,
      source: undefined,
    });
  });

  it("pans time within bounds", () => {
    const controller = new ViewportController({
      totalDuration: 20,
      startTime: 0,
      endTime: 5,
    });

    controller.panTime(2);
    expect(controller.getViewport().startTime).toBe(2);
    expect(controller.getViewport().endTime).toBe(7);

    // Cannot pan past totalDuration
    controller.panTime(20);
    expect(controller.getViewport().startTime).toBe(15);
    expect(controller.getViewport().endTime).toBe(20);

    // Cannot pan before 0
    controller.panTime(-30);
    expect(controller.getViewport().startTime).toBe(0);
    expect(controller.getViewport().endTime).toBe(5);
  });

  it("zooms time centered around a timestamp", () => {
    const controller = new ViewportController({
      totalDuration: 20,
      startTime: 0,
      endTime: 10,
    });

    // Zoom in (factor 0.5) around center = 5s
    controller.zoomTime(0.5, 5);
    const vp = controller.getViewport();
    expect(vp.duration).toBe(5);
    expect(vp.startTime).toBe(2.5);
    expect(vp.endTime).toBe(7.5);
  });

  it("pans and zooms frequency bounds", () => {
    const controller = new ViewportController({
      totalDuration: 10,
      minFrequency: 0,
      maxFrequency: 10000,
    });

    controller.setViewport({ minFrequency: 1000, maxFrequency: 5000 });
    expect(controller.getViewport().minFrequency).toBe(1000);
    expect(controller.getViewport().maxFrequency).toBe(5000);

    controller.panFrequency(500);
    expect(controller.getViewport().minFrequency).toBe(1500);
    expect(controller.getViewport().maxFrequency).toBe(5500);

    // Zoom in frequency around 3500 Hz
    controller.zoomFrequency(0.5, 3500);
    const vp = controller.getViewport();
    expect(vp.maxFrequency - vp.minFrequency).toBe(2000);
    expect(vp.minFrequency).toBe(2500);
    expect(vp.maxFrequency).toBe(4500);
  });

  it("supports standalone unconstrained viewports for multi-source coordination", () => {
    const controller = new ViewportController();
    expect(controller.getViewport().startTime).toBe(0);
    expect(controller.getViewport().endTime).toBeGreaterThan(0);

    controller.setViewport({
      startTime: 5,
      endTime: 15,
      minFrequency: 100,
      maxFrequency: 8000,
    });
    const vp = controller.getViewport();
    expect(vp.startTime).toBe(5);
    expect(vp.endTime).toBe(15);
    expect(vp.minFrequency).toBe(100);
    expect(vp.maxFrequency).toBe(8000);
  });

  it("constrains panning and zooming within minTime and maxTime", () => {
    const controller = new ViewportController({
      minTime: 5,
      maxTime: 15,
      startTime: 5,
      endTime: 10,
    });

    expect(controller.getViewport().startTime).toBe(5);
    expect(controller.getViewport().endTime).toBe(10);

    // Cannot pan before minTime (5)
    controller.panTime(-10);
    expect(controller.getViewport().startTime).toBe(5);
    expect(controller.getViewport().endTime).toBe(10);

    // Cannot pan after maxTime (15)
    controller.panTime(20);
    expect(controller.getViewport().startTime).toBe(10);
    expect(controller.getViewport().endTime).toBe(15);

    // setTimeBounds dynamically updates bounds and clamps viewport
    controller.setTimeBounds(6, 12);
    expect(controller.getTimeBounds()).toEqual({ minTime: 6, maxTime: 12 });
    const vp = controller.getViewport();
    expect(vp.startTime).toBeGreaterThanOrEqual(6);
    expect(vp.endTime).toBeLessThanOrEqual(12);
  });
});
