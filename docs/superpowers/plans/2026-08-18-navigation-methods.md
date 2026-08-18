# Native Navigation Methods on Sonoscope and Viewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide first-class `attachNavigation()` methods directly on `Sonoscope` and viewer instances (`SpectrogramViewer`, `WaveformViewer`, `TimeRulerViewer`, `FrequencyRulerViewer`) with structured options for temporal/frequency axes, wheel/drag toggles, key modifiers, and automatic lifecycle cleanup.

**Architecture:** Extend `@sonoscope/core` navigation types to support flexible modifier keys (`'ctrl' | 'shift' | 'alt' | 'meta' | 'none'`) and nested wheel/drag configurations. Implement `attachNavigation(options?)` on each viewer class using its internal canvas and coordinate mappings, and implement `attachNavigation(target, options?)` on `Sonoscope`. Ensure all attached listeners are automatically registered in the respective instance's destruction cleanup pipeline.

**Tech Stack:** TypeScript, WebGL2, Vitest, Astro/Starlight docs.

## Global Constraints
- Retain full backward compatibility for existing standalone functions (`attachCanvasNavigation`, `attachCanvasWheelNavigation`, `attachCanvasDragNavigation`).
- All new methods must return a manual detach `() => void` cleanup function.
- All attached listeners must automatically tear down when `destroy()` is called on the owning viewer or `Sonoscope` instance.
- Maintain documentation integrity and typecheck cleanly across all packages (`core`, `react`, `anywidget`, `docs`).

---

### Task 1: Navigation Types and Options Enhancements

**Files:**
- Modify: `packages/core/src/navigation.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/navigation.test.ts`

**Interfaces:**
- Produces:
  - `ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta' | 'none'`
  - `WheelNavigationOptions`: axis, panSensitivity, zoomSensitivity, frequencyPanSensitivity, frequencyZoomSensitivity, zoomModifier, frequencyModifier
  - `DragNavigationOptions`: axis, button, modifier, frequencyModifier, dragThreshold, cursor, onDragStart, onDragEnd
  - `NavigationOptions`: axis, wheel (`boolean | WheelNavigationOptions`), drag (`boolean | DragNavigationOptions`), onNavigate

- [x] **Step 1: Write failing unit tests for new option formats and modifier keys**

```typescript
// in packages/core/src/navigation.test.ts
describe("NavigationOptions nested config and modifier keys", () => {
  it("supports 'none' as modifier key to trigger without modifier", () => { ... });
  it("supports boolean false for wheel or drag to selectively disable", () => { ... });
  it("supports nested wheel and drag options", () => { ... });
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test packages/core/src/navigation.test.ts`
Expected: FAIL (types/options not yet matching)

- [x] **Step 3: Implement normalized options parsing in `navigation.ts`**

Update `packages/core/src/navigation.ts` to export `ModifierKey`, `WheelNavigationOptions`, `DragNavigationOptions`, `NavigationOptions`, update `modifierPressed` to handle `'none'`, and normalize options inside `attachCanvasNavigation`.

- [x] **Step 4: Run tests to verify pass**

Run: `npm test packages/core/src/navigation.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/core/src/navigation.ts packages/core/src/types.ts packages/core/src/navigation.test.ts
git commit -m "feat(core): enhance navigation options with flexible modifier keys and nested wheel/drag config"
```

---

### Task 2: Implement `attachNavigation` on Viewer Classes with Auto-Cleanup

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts`
- Modify: `packages/core/src/viewers/spectrogram/types.ts`
- Modify: `packages/core/src/viewers/waveform/viewer.ts`
- Modify: `packages/core/src/viewers/waveform/types.ts`
- Modify: `packages/core/src/viewers/time-ruler/viewer.ts`
- Modify: `packages/core/src/viewers/time-ruler/types.ts`
- Modify: `packages/core/src/viewers/frequency-ruler/viewer.ts`
- Modify: `packages/core/src/viewers/frequency-ruler/types.ts`
- Test: `packages/core/src/navigation.test.ts`

**Interfaces:**
- Produces:
  - `ISpectrogramViewer.attachNavigation(options?: NavigationOptions): () => void`
  - `IWaveformViewer.attachNavigation(options?: NavigationOptions): () => void`
  - `ITimeRulerViewer.attachNavigation(options?: NavigationOptions): () => void`
  - `IFrequencyRulerViewer.attachNavigation(options?: NavigationOptions): () => void`

- [x] **Step 1: Write failing tests for viewer `attachNavigation` and lifecycle cleanup**

```typescript
it("attaches navigation via spec.attachNavigation() and automatically cleans up on spec.destroy()", () => { ... });
it("attaches navigation via waveform.attachNavigation({ axis: 'time' })", () => { ... });
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test packages/core/src/navigation.test.ts`
Expected: FAIL (`attachNavigation` is not a function)

- [x] **Step 3: Implement `attachNavigation` and tracking in each viewer class**

Add `navCleanups: Array<() => void> = []` to each viewer class. In `attachNavigation(options)`:
1. Call `attachCanvasNavigation(this, this.canvas, options)`.
2. Push cleanup to `this.navCleanups`.
3. In `destroy()`, execute and clear `this.navCleanups`.
4. Return a detach function that invokes cleanup and removes it from `this.navCleanups`.

- [x] **Step 4: Run tests to verify pass**

Run: `npm test packages/core/src/navigation.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/core/src/viewers/ packages/core/src/navigation.test.ts
git commit -m "feat(core): add attachNavigation to Spectrogram, Waveform, and Ruler viewers with auto-cleanup"
```

---

### Task 3: Implement `attachNavigation` on `Sonoscope`

**Files:**
- Modify: `packages/core/src/sonoscope.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/sonoscope.test.ts`

**Interfaces:**
- Produces:
  - `ISonoscope.attachNavigation(target: HTMLCanvasElement | AnyNavigableViewer, options?: NavigationOptions): () => void`

- [x] **Step 1: Write failing tests for `scope.attachNavigation`**

```typescript
it("attaches navigation directly to a canvas using scope.attachNavigation(canvas)", () => { ... });
it("attaches navigation to a viewer using scope.attachNavigation(viewer)", () => { ... });
it("automatically cleans up scope navigations when scope.destroy() is called", () => { ... });
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test packages/core/src/sonoscope.test.ts`
Expected: FAIL (`attachNavigation` is not a function on Sonoscope)

- [x] **Step 3: Implement `attachNavigation` on `Sonoscope` class**

In `packages/core/src/sonoscope.ts`:
1. If `target` is a viewer (`'getViewport'` in target && `'requestRender'` in target), delegate to `target.attachNavigation(options)`.
2. If `target` is an `HTMLCanvasElement`, construct a navigation adapter wrapping the scope (viewing full time bounds) and call `attachCanvasNavigation`.
3. Track cleanups in `this.navigationCleanups` and invoke on `scope.destroy()`.

- [x] **Step 4: Run tests to verify pass**

Run: `npm test packages/core/src/sonoscope.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/core/src/sonoscope.ts packages/core/src/types.ts packages/core/src/sonoscope.test.ts
git commit -m "feat(core): add attachNavigation method to Sonoscope with auto-cleanup on scope.destroy"
```

---

### Task 4: Documentation, Demos, and Type Validation

**Files:**
- Modify: `docs/src/content/docs/demos/spectrogram.mdx`
- Modify: `docs/src/content/docs/demos/waveform.mdx`
- Modify: `docs/src/content/docs/packages/core.mdx`
- Modify: `docs/src/content/docs/guides/quick-start.mdx`

- [x] **Step 1: Update documentation and demo code snippets**

Replace verbose `import { attachCanvasNavigation }` with streamlined `spec.attachNavigation()` and `waveform.attachNavigation()`.

- [x] **Step 2: Run all tests, linters, type checks, and docs build**

Run: `npm run test && npm run check:types && npm run build:docs`
Expected: All tests pass, zero type errors, 0 broken links in docs validator.

- [x] **Step 3: Commit**

```bash
git add docs/ packages/
git commit -m "docs: showcase native viewer and scope attachNavigation methods in live demos and guides"
```
