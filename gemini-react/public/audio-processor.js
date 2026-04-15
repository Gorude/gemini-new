class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      // Note: we just send the raw float channel data to the main thread
      // The main thread will handle conversion to PCM16
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
