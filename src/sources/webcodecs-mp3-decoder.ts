export interface Mp3Decoder {
  decode(chunk: Uint8Array, timestampUs: number): Promise<Float32Array[]>;
  flush(): Promise<Float32Array[]>;
  close(): void;
}

export type Mp3DecoderConfig = {
  sampleRate: number;
  channelCount: number;
  onOutput?: (pcmChannels: Float32Array[]) => void;
};

export type Mp3DecoderFactory = (
  config: Mp3DecoderConfig,
) => Promise<Mp3Decoder>;

export async function isWebCodecsMp3Supported(): Promise<boolean> {
  if (
    typeof AudioDecoder === "undefined" ||
    typeof AudioDecoder.isConfigSupported !== "function"
  ) {
    return false;
  }

  try {
    const result = await AudioDecoder.isConfigSupported({
      codec: "mp3",
      sampleRate: 44100,
      numberOfChannels: 2,
    });
    return Boolean(result.supported);
  } catch {
    return false;
  }
}

export async function createWebCodecsMp3Decoder(
  config: Mp3DecoderConfig,
): Promise<Mp3Decoder> {
  if (
    typeof AudioDecoder === "undefined" ||
    typeof EncodedAudioChunk === "undefined"
  ) {
    throw new Error(
      "WebCodecs AudioDecoder is not supported in this environment",
    );
  }

  let decodedOutputs: Float32Array[][] = [];
  let decoderError: Error | undefined;

  const audioDecoder = new AudioDecoder({
    output: (audioData: AudioData) => {
      try {
        const channelCount = audioData.numberOfChannels;
        const frameCount = audioData.numberOfFrames;
        const channelBuffers: Float32Array[] = [];

        for (let c = 0; c < channelCount; c++) {
          const pcm = new Float32Array(frameCount);
          audioData.copyTo(pcm, { planeIndex: c, format: "f32-planar" });
          channelBuffers.push(pcm);
        }
        if (config.onOutput) {
          config.onOutput(channelBuffers);
        } else {
          decodedOutputs.push(channelBuffers);
        }
      } finally {
        audioData.close();
      }
    },
    error: (error: Error) => {
      decoderError = error;
    },
  });

  audioDecoder.configure({
    codec: "mp3",
    sampleRate: config.sampleRate,
    numberOfChannels: config.channelCount,
  });

  function drainDecoded(): Float32Array[] {
    if (decoderError) {
      const error = decoderError;
      decoderError = undefined;
      throw error;
    }
    if (decodedOutputs.length === 0) {
      return Array.from(
        { length: config.channelCount },
        () => new Float32Array(0),
      );
    }
    const outputs = decodedOutputs;
    decodedOutputs = [];
    return mergeChannelChunks(outputs, config.channelCount);
  }

  return {
    async decode(
      chunk: Uint8Array,
      timestampUs: number,
    ): Promise<Float32Array[]> {
      if (decoderError) throw decoderError;
      const encoded = new EncodedAudioChunk({
        type: "key",
        timestamp: timestampUs,
        data: chunk,
      });

      audioDecoder.decode(encoded);
      return drainDecoded();
    },

    async flush(): Promise<Float32Array[]> {
      if (decoderError) throw decoderError;
      await audioDecoder.flush();
      return drainDecoded();
    },

    close(): void {
      try {
        if (audioDecoder.state !== "closed") {
          audioDecoder.close();
        }
      } catch {
        // ignore close errors
      }
    },
  };
}

export function mergeChannelChunks(
  chunks: Float32Array[][],
  channelCount: number,
): Float32Array[] {
  const totalFrames = chunks.reduce(
    (acc, chunk) => acc + (chunk[0]?.length ?? 0),
    0,
  );
  const merged: Float32Array[] = Array.from(
    { length: channelCount },
    () => new Float32Array(totalFrames),
  );

  let offset = 0;
  for (const chunk of chunks) {
    const chunkFrames = chunk[0]?.length ?? 0;
    if (chunkFrames === 0) continue;
    for (let c = 0; c < channelCount; c++) {
      const channelPcm = chunk[c];
      if (channelPcm) {
        merged[c]!.set(channelPcm, offset);
      }
    }
    offset += chunkFrames;
  }

  return merged;
}
