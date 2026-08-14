export type ByteStreamSource = {
  stream(): ReadableStream<Uint8Array>;
};
export type SeekableByteSource = ByteStreamSource & {
  readRange(start: number, end: number): Promise<Uint8Array>;
  size?: number;
};
export declare function isSeekableByteSource(
  source: ByteStreamSource,
): source is SeekableByteSource;
export declare function concatChunks(chunks: Uint8Array[]): Uint8Array;
export declare function readPrefix(
  source: ByteStreamSource,
  length: number,
): Promise<Uint8Array>;
export declare class FetchByteSource implements SeekableByteSource {
  readonly url: string;
  size?: number;
  private constructor();
  static fromUrl(
    url: string,
    options?: {
      size?: number;
    },
  ): FetchByteSource;
  stream(): ReadableStream<Uint8Array>;
  readRange(start: number, end: number): Promise<Uint8Array>;
}
//# sourceMappingURL=byte-source.d.ts.map
