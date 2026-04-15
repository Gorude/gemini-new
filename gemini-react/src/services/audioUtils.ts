// Audio conversion utilities for Gemini Live API
// Gemini expects PCM 16-bit Mono

/**
 * Converts a Float32Array (from AudioWorklet) to Int16 PCM (Base64)
 */
export function floatToPcm16(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
}

/**
 * Converts Int16 PCM (Base64) to Float32Array for AudioContext playback
 */
export function pcm16ToFloat(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }
  return float32Array;
}
