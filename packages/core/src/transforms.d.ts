import type {
  SpectrogramMatrix,
  SpectrogramTransform,
  TransformContext,
} from "./types";
export declare function getTransformPadding(
  transforms: SpectrogramTransform[],
): {
  timePaddingSeconds: number;
  frequencyPaddingBins: number;
};
export declare function applyTransforms(
  matrix: SpectrogramMatrix,
  transforms: SpectrogramTransform[],
  context: TransformContext,
): Promise<SpectrogramMatrix>;
//# sourceMappingURL=transforms.d.ts.map
