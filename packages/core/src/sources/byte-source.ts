export type ByteStreamSource = {
  stream(): ReadableStream<Uint8Array>;
};

export type SeekableByteSource = ByteStreamSource & {
  readRange(start: number, end: number): Promise<Uint8Array>;
  size?: number;
};

export function isSeekableByteSource(
  source: ByteStreamSource,
): source is SeekableByteSource {
  return (
    "readRange" in source &&
    typeof (source as { readRange?: unknown }).readRange === "function"
  );
}

export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function readPrefix(
  source: ByteStreamSource,
  length: number,
): Promise<Uint8Array> {
  const reader = source.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < length) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  return concatChunks(chunks).slice(0, length);
}

export class FetchByteSource implements SeekableByteSource {
  size?: number;

  private constructor(
    readonly url: string,
    options?: { size?: number },
  ) {
    if (options && "size" in options) this.size = options.size;
  }

  static fromUrl(url: string, options?: { size?: number }): FetchByteSource {
    return new FetchByteSource(url, options);
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const response = await fetch(this.url);
          if (!response.ok)
            throw new Error(`Failed to fetch byte stream: ${response.status}`);
          const contentLength = response.headers?.get?.("content-length");
          if (contentLength && !Number.isNaN(Number(contentLength))) {
            this.size = Number(contentLength);
          }
          if (!response.body)
            throw new Error("Fetch response does not expose a readable body");
          const reader = response.body.getReader();
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            controller.enqueue(result.value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start
    )
      throw new Error("Invalid byte range");
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end - 1}` },
    });
    if (!response.ok)
      throw new Error(`Failed to fetch byte range: ${response.status}`);
    if (response.status !== 206)
      throw new Error(`Server ignored byte range request: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export class BlobByteSource implements SeekableByteSource {
  readonly size: number;

  constructor(
    private readonly blob: Blob,
    options?: { size?: number },
  ) {
    this.size = options?.size ?? blob.size;
  }

  stream(): ReadableStream<Uint8Array> {
    if (typeof this.blob.stream === "function") {
      return this.blob.stream();
    }
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const buffer = await this.blob.arrayBuffer();
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start
    ) {
      throw new Error("Invalid byte range");
    }
    const sliced = this.blob.slice(start, end);
    return new Uint8Array(await sliced.arrayBuffer());
  }
}

export class BufferByteSource implements SeekableByteSource {
  readonly size: number;
  private readonly uint8Array: Uint8Array;

  constructor(buffer: ArrayBuffer | Uint8Array, options?: { size?: number }) {
    this.uint8Array =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.size = options?.size ?? this.uint8Array.byteLength;
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(this.uint8Array);
        controller.close();
      },
    });
  }

  async readRange(start: number, end: number): Promise<Uint8Array> {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.size
    ) {
      throw new Error("Invalid byte range");
    }
    return this.uint8Array.subarray(start, end);
  }
}
