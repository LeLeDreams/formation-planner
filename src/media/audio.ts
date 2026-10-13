import { computePeaks, type Peaks } from '@/core/peaks'

/** Files above this are not decoded for a waveform (decoding holds the whole track in memory). */
const MAX_DECODE_BYTES = 600 * 1024 * 1024
const DECODE_SAMPLE_RATE = 22050

/**
 * Decode a video/audio file's audio track and reduce it to a peak envelope.
 * Decodes at a low sample rate to keep memory use down; this is only used for drawing.
 * Throws a friendly Error if the browser can't decode the audio.
 */
export async function decodeWaveform(file: File): Promise<Peaks> {
  if (file.size > MAX_DECODE_BYTES) {
    throw new Error('This file is too large to draw a waveform for.')
  }
  const Ctx = window.OfflineAudioContext
  if (!Ctx) throw new Error('This browser can’t decode audio for a waveform.')
  let data: ArrayBuffer
  try {
    data = await file.arrayBuffer()
  } catch {
    throw new Error('Not enough memory to draw a waveform for this file. Playback still works.')
  }
  const ctx = new Ctx(1, 1, DECODE_SAMPLE_RATE)
  let buffer: AudioBuffer
  try {
    buffer = await ctx.decodeAudioData(data)
  } catch {
    throw new Error('Couldn’t read this file’s audio track, so there is no waveform. Playback still works.')
  }
  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c))
  return computePeaks(channels, buffer.sampleRate, 100)
}
