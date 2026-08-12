# Streaming Audio Decode Design

## Goal

Start spectrogram rendering before the entire audio file is decoded. The first implementation streams WAV/PCM data and keeps the existing full-buffer decoder as the fallback for compressed or unknown formats.

## Scope

- Add generic byte source interfaces for sequential and seekable byte reads.
- Add fetch-backed byte source helpers.
- Add a streaming WAV/PCM audio source.
- Add a helper that creates the best available audio source from a URL.
- Notify the viewer when newly decoded ranges become available so visible tiles can retry.
- Prioritize visible missing ranges when byte-range reads are available.

Out of scope:

- Streaming compressed audio formats such as MP3, Opus, AAC, or FLAC.
- Replacing the current `DecodedAudioSource` full-buffer fallback.
- Multichannel rendering. The viewer continues to render the selected channel only.

## Byte Source Interfaces

The byte layer has two small interfaces:

```ts
export type ByteStreamSource = {
  stream(): ReadableStream<Uint8Array>;
};

export type SeekableByteSource = ByteStreamSource & {
  readRange(start: number, end: number): Promise<Uint8Array>;
  size?: number;
};
```

`ByteStreamSource` supports sequential decode from the start. `SeekableByteSource` supports prioritized reads for visible time ranges. Consumers can test for `readRange` to decide whether random access is available.

## Source Creation API

Existing APIs remain valid. New streaming behavior is opt-in through source helpers:

```ts
const source = await StreamingWavSource.fromByteSource(FetchByteSource.fromUrl(url));
const viewer = await SpectrogramViewer.create({ canvas, audio, source });
```

For application code that does not want to branch on file type:

```ts
const source = await createAudioSourceFromUrl(url);
```

`createAudioSourceFromUrl(url)` inspects the first bytes or content type. WAV/PCM inputs use `StreamingWavSource`; unsupported or unknown formats fall back to `DecodedAudioSource.fromUrl(url)`.

## Streaming WAV Source

`StreamingWavSource` implements the existing `AudioSource` contract. It parses enough WAV header data to expose `sampleRate`, `duration`, and `channelCount`, then decodes PCM samples into an internal time-range buffer.

Supported first-pass WAV data:

- RIFF/WAVE container.
- PCM integer samples.
- 8-bit unsigned PCM.
- 16-bit signed PCM.
- 24-bit signed PCM.
- 32-bit signed PCM.
- 32-bit float PCM if the WAV format tag indicates IEEE float.

Unsupported WAV variants fail in the streaming source and fall back when created through `createAudioSourceFromUrl`.

## AudioSource Read Behavior

The current `AudioSource.read(options)` shape remains:

```ts
read(options: { channel: number; startTime: number; endTime: number }): Float32Array | Promise<Float32Array>;
```

For streaming sources, `read` returns a promise when the requested time range is not decoded yet. The promise resolves when the range is available. The viewer already treats tile computation as async, so missing ranges continue to show placeholders while the source waits.

## Range Availability Notification

Streaming sources may expose an optional decoded-range notification method:

```ts
onRangeAvailable?(handler: (range: { startTime: number; endTime: number }) => void): () => void;
```

The viewer subscribes when the method exists. When a newly available range intersects the current viewport, the viewer schedules another render. This avoids polling and lets visible placeholders fill as soon as data arrives.

## Prioritization

Visible tile ranges are highest priority. Prefetch ranges are lower priority.

For seekable byte sources, `StreamingWavSource.read` converts missing time ranges to WAV data byte ranges and requests those bytes through `readRange`. This allows far-ahead seek and zoom operations to decode the visible range before earlier audio.

For sequential-only byte sources, the decoder keeps streaming forward from the start. It cannot skip ahead, so placeholders remain until the sequential decode reaches the requested range.

## Viewer Flow

Current full-buffer flow:

1. Fetch entire audio file.
2. Decode a complete `AudioBuffer`.
3. Create `DecodedAudioSource`.
4. Compute visible STFT tiles.

Streaming flow:

1. Create a streaming source from a byte source.
2. Parse enough metadata to initialize viewer bounds.
3. Render immediately.
4. Compute STFT for visible decoded ranges.
5. Show opaque placeholders for missing decoded or uncomputed ranges.
6. Prioritize missing visible ranges.
7. Rerender when newly decoded ranges intersect the viewport.

Cached computed tiles remain valid and are not recomputed when unrelated ranges arrive.

## Errors

- Invalid or unsupported WAV: fail in `StreamingWavSource`; fallback to `DecodedAudioSource.fromUrl` when using `createAudioSourceFromUrl`.
- Network or range request failure: emit a recoverable viewer error with phase `source` when possible; missing tiles remain placeholders.
- Truncated audio: use the actual available duration if it can be determined safely, otherwise surface a source error.
- Unsupported compressed formats: use full-buffer decode, not streaming.

## Tests

- WAV header parsing for supported and unsupported formats.
- PCM conversion for 8-bit, 16-bit, 24-bit, 32-bit integer, and 32-bit float WAV data.
- Sequential streaming decode exposes ranges as chunks arrive.
- Seekable byte source prioritizes requested visible ranges.
- `read` waits for missing ranges and resolves when samples become available.
- Viewer keeps placeholders while source reads are pending, then rerenders after range availability.
- `createAudioSourceFromUrl` routes WAV to streaming and unknown formats to `DecodedAudioSource`.
