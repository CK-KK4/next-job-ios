import * as RNFS from '@dr.pogodin/react-native-fs';
import {toByteArray} from 'base64-js';

// AVAudioRecorder may insert JUNK, FLLR or extended fmt chunks before PCM.
// Locate data instead of assuming every WAV has Android's 44-byte header.
export async function getJobPcmRange(path: string, size: number) {
  const read = async (offset: number, length: number) => {
    const data = toByteArray(await RNFS.read(path, length, offset, 'base64'));
    if (data.length !== length) {
      throw new Error('录音文件不完整，请重新录制。');
    }
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  };
  const tag = (view: DataView, start = 0) =>
    String.fromCharCode(
      ...Array.from({length: 4}, (_, i) => view.getUint8(start + i)),
    );
  if (size < 44) {
    throw new Error('录音文件为空或已损坏。');
  }
  const header = await read(0, 12);
  if (tag(header) !== 'RIFF' || tag(header, 8) !== 'WAVE') {
    throw new Error('录音格式不正确，请重新录制。');
  }
  let validFormat = false;
  let offset = 12;
  for (let count = 0; count < 128 && offset + 8 <= size; count++) {
    const chunk = await read(offset, 8);
    const length = chunk.getUint32(4, true);
    const start = offset + 8;
    if (start + length > size) {
      throw new Error('录音文件不完整，请重新录制。');
    }
    if (tag(chunk) === 'fmt ') {
      if (length < 16) {
        throw new Error('录音格式信息不完整。');
      }
      const format = await read(start, 16);
      validFormat =
        format.getUint16(0, true) === 1 &&
        format.getUint16(2, true) === 1 &&
        format.getUint32(4, true) === 16000 &&
        format.getUint32(8, true) === 32000 &&
        format.getUint16(12, true) === 2 &&
        format.getUint16(14, true) === 16;
    } else if (tag(chunk) === 'data') {
      if (!validFormat || length === 0 || length % 2 !== 0) {
        throw new Error('录音为空或不是 16kHz 单声道 PCM，请重新录制。');
      }
      return {start, end: start + length};
    }
    offset = start + length + (length % 2);
  }
  throw new Error('没有找到录音内容，请重新录制。');
}
