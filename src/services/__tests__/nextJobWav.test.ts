import * as RNFS from '@dr.pogodin/react-native-fs';
import {fromByteArray} from 'base64-js';
import {getJobPcmRange} from '../nextJobWav';

jest.mock('@dr.pogodin/react-native-fs', () => ({read: jest.fn()}));

function fixture(extra = 0, rate = 16000) {
  const bytes = new Uint8Array(44 + extra + 64);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      bytes[offset + i] = text.charCodeAt(i);
  };
  tag(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  if (extra) {
    tag(36, 'FLLR');
    view.setUint32(40, extra - 8, true);
  }
  tag(36 + extra, 'data');
  view.setUint32(40 + extra, 64, true);
  (RNFS.read as jest.Mock).mockImplementation((_path, length, offset) =>
    Promise.resolve(fromByteArray(bytes.slice(offset, offset + length))),
  );
  return bytes;
}

it('finds standard Android PCM', async () => {
  const bytes = fixture();
  await expect(getJobPcmRange('audio.wav', bytes.length)).resolves.toEqual({
    start: 44,
    end: 108,
  });
});
it('skips the iOS filler chunk without transcribing metadata as audio', async () => {
  const bytes = fixture(4096);
  await expect(getJobPcmRange('audio.wav', bytes.length)).resolves.toEqual({
    start: 4140,
    end: 4204,
  });
});
it('rejects truncated PCM instead of analyzing incomplete data', async () => {
  const bytes = fixture(4096);
  await expect(getJobPcmRange('audio.wav', bytes.length - 8)).rejects.toThrow(
    '不完整',
  );
});
it('rejects audio with the wrong sample rate', async () => {
  const bytes = fixture(0, 48000);
  await expect(getJobPcmRange('audio.wav', bytes.length)).rejects.toThrow(
    '16kHz',
  );
});
