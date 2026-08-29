export const RECORDER_WORKLET_NAME = "sonoscope-microphone-processor";

export const RECORDER_WORKLET_CODE = `
class SonoscopeMicrophoneProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      const channelCount = input.length;
      const sampleCount = input[0].length;
      const channels = [];
      const transferList = [];
      for (let ch = 0; ch < channelCount; ch++) {
        const copy = new Float32Array(input[ch]);
        channels.push(copy);
        transferList.push(copy.buffer);
      }
      this.port.postMessage({ channels, sampleCount }, transferList);
    }
    const output = outputs[0];
    if (output && output[0]) {
      output[0].fill(0);
    }
    return true;
  }
}
registerProcessor("${RECORDER_WORKLET_NAME}", SonoscopeMicrophoneProcessor);
`;
