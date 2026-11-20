import {AppState} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {fromByteArray} from 'base64-js';
import {transcribeJobRecording} from '../nextJobAudio';
import {whisperAsrEngine} from '../asr';
jest.mock('../nextJobWav', () => ({
  getJobPcmRange: jest.fn().mockResolvedValue({start: 44, end: 960044}),
}));

jest.mock('../../specs/NativeNextJob', () => ({__esModule: true, default: {}}));
jest.mock('../../store/ASRStore', () => ({
  asrStore: {init: jest.fn(), installBundledBase: jest.fn()},
}));
jest.mock('../asr', () => ({
  ...jest.requireActual('../asr/energyVad'),
  whisperAsrEngine: {
    isInstalled: jest.fn().mockResolvedValue(true),
    transcribe: jest.fn(),
    release: jest.fn(),
    cancelTranscription: jest.fn(),
  },
}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
  stat: jest.fn(),
  read: jest.fn(),
  writeFile: jest.fn(),
}));

const file = {
  path: '/private/review.wav',
  kind: 'review' as const,
  recording: false,
  durationMs: 30000,
};
const header = fromByteArray(
  Uint8Array.from([82, 73, 70, 70, ...new Array(40).fill(0)]),
);
const voiced = fromByteArray(
  Uint8Array.from({length: 32000}, (_, index) => (index % 2 === 0 ? 0 : 16)),
);

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  (RNFS.stat as jest.Mock).mockResolvedValue({size: 960044});
  (RNFS.read as jest.Mock).mockImplementation((_path, _length, offset) =>
    Promise.resolve(offset === 0 ? header : voiced),
  );
  (whisperAsrEngine.transcribe as jest.Mock).mockResolvedValue({
    text: '真实回答',
    language: 'zh',
  });
});

it('reads long recordings in bounded chunks and preserves all recognized parts', async () => {
  const progress = jest.fn();
  const text = await transcribeJobRecording(
    file,
    progress,
    new AbortController().signal,
  );
  expect(text).toBe('真实回答\n真实回答');
  expect(RNFS.read).toHaveBeenCalledWith(file.path, 800000, 44, 'base64');
  expect(RNFS.read).toHaveBeenCalledWith(file.path, 160000, 800044, 'base64');
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    `${file.path}.txt`,
    '真实回答\n真实回答\n',
    'utf8',
  );
  expect(whisperAsrEngine.release).toHaveBeenCalled();
});

it('does not turn silence into a made-up transcript', async () => {
  (RNFS.read as jest.Mock).mockImplementation((_path, _length, offset) =>
    Promise.resolve(
      offset === 0 ? header : fromByteArray(new Uint8Array(32000)),
    ),
  );
  await expect(
    transcribeJobRecording(file, jest.fn(), new AbortController().signal),
  ).rejects.toThrow('没有识别到');
  expect(whisperAsrEngine.transcribe).not.toHaveBeenCalled();
  expect(RNFS.writeFile).not.toHaveBeenCalled();
});

it('stops before decoding when the app is in the background', async () => {
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'background',
  });
  await expect(
    transcribeJobRecording(file, jest.fn(), new AbortController().signal),
  ).rejects.toThrow('前台');
  expect(whisperAsrEngine.transcribe).not.toHaveBeenCalled();
});

it('does not analyze an unfinished recording', async () => {
  await expect(
    transcribeJobRecording(
      {...file, recording: true},
      jest.fn(),
      new AbortController().signal,
    ),
  ).rejects.toThrow('停止');
  expect(RNFS.stat).not.toHaveBeenCalled();
});

it('does not save a canceled partial decode as the completed transcript', async () => {
  const controller = new AbortController();
  (whisperAsrEngine.transcribe as jest.Mock).mockImplementation(async () => {
    controller.abort();
    return {text: 'partial'};
  });
  await expect(
    transcribeJobRecording(file, jest.fn(), controller.signal),
  ).rejects.toThrow('停止转写');
  expect(RNFS.writeFile).not.toHaveBeenCalled();
  expect(whisperAsrEngine.release).toHaveBeenCalled();
});
