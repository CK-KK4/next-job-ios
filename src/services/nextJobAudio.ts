import {AppState, PermissionsAndroid, Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {toByteArray} from 'base64-js';
import {PERMISSIONS, request, RESULTS} from 'react-native-permissions';
import NativeNextJob from '../specs/NativeNextJob';
import {asrStore} from '../store/ASRStore';
import {energyVad, int16PcmToFloat32, whisperAsrEngine} from './asr';
import {getJobPcmRange} from './nextJobWav';

export type Recording = {
  path: string;
  kind: 'review' | 'interview';
  recording: boolean;
  startedAt?: number;
  createdAt?: number;
  durationMs: number;
  error?: string;
};

export async function requestRecording() {
  if (!NativeNextJob) {
    throw new Error('录音组件未就绪，请重新打开 App。');
  }
  if (Platform.OS === 'ios') {
    if ((await request(PERMISSIONS.IOS.MICROPHONE)) !== RESULTS.GRANTED) {
      throw new Error('请在系统设置中允许“下一站”使用麦克风。');
    }
    return;
  }
  const permission = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('请在系统设置中允许“下一站”使用麦克风。');
  }
  if (Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  }
}

let installing: Promise<void> | undefined;
let reviewOperation: Promise<Recording> | undefined;

export function toggleJobReviewRecording(): Promise<Recording> {
  if (reviewOperation) {
    return reviewOperation;
  }
  reviewOperation = (async () => {
    if (!NativeNextJob) {
      throw new Error('录音组件未就绪，请重新打开 App。');
    }
    const current: Recording = JSON.parse(await NativeNextJob.recordingState());
    if (current.recording) {
      if (current.kind !== 'review') {
        throw new Error('请先结束当前面试回答，再开始复盘录音。');
      }
      return JSON.parse(await NativeNextJob.stopRecording()) as Recording;
    }
    await requestRecording();
    return JSON.parse(
      await NativeNextJob.startRecording('review'),
    ) as Recording;
  })().finally(() => {
    reviewOperation = undefined;
  });
  return reviewOperation;
}
export function ensureJobSpeech(): Promise<void> {
  if (!installing) {
    installing = (async () => {
      if (await whisperAsrEngine.isInstalled('base')) {
        await asrStore.init();
        return;
      }
      const temporary = `${RNFS.CachesDirectoryPath}/nextjob-whisper.bin`;
      try {
        if (Platform.OS === 'ios') {
          await RNFS.copyFile(
            `${RNFS.MainBundlePath}/nextjob/ggml-base-q8_0.bin`,
            temporary,
          );
        } else {
          await RNFS.copyFileAssets('nextjob/ggml-base-q8_0.bin', temporary);
        }
        await asrStore.installBundledBase(temporary);
      } finally {
        if (await RNFS.exists(temporary)) {
          await RNFS.unlink(temporary);
        }
      }
    })().finally(() => {
      installing = undefined;
    });
  }
  return installing;
}

/** Read bounded chunks: a two-hour recording never becomes one JS allocation. */
export async function transcribeJobRecording(
  recording: Recording,
  onProgress: (fraction: number, text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (recording.recording) {
    throw new Error('请先停止并保存录音。');
  }
  await ensureJobSpeech();
  const size = Number((await RNFS.stat(recording.path)).size);
  const pcm = await getJobPcmRange(recording.path, size);
  let transcript = '';
  const cancel = () => {
    void whisperAsrEngine.cancelTranscription();
  };
  signal.addEventListener('abort', cancel);
  try {
    for (let offset = pcm.start; offset < pcm.end; offset += 800000) {
      if (signal.aborted || AppState.currentState !== 'active') {
        throw new Error(
          '转写已暂停，请保持 App 在前台后重试。录音文件已保留。',
        );
      }
      const data = await RNFS.read(
        recording.path,
        Math.min(800000, pcm.end - offset),
        offset,
        'base64',
      );
      if (energyVad(int16PcmToFloat32(toByteArray(data))).passed) {
        const result = await whisperAsrEngine.transcribe(data, {
          tier: 'base',
          language: 'zh',
          prompt: transcript.slice(-200),
        });
        if (signal.aborted) {
          throw new Error('已停止转写，录音文件已保留。');
        }
        transcript += result.text ? `${result.text}\n` : '';
      }
      onProgress(
        Math.min(1, (offset + 800000 - pcm.start) / (pcm.end - pcm.start)),
        transcript,
      );
    }
    if (!transcript.trim()) {
      throw new Error('没有识别到清晰的人声，请检查麦克风后重试。');
    }
    await RNFS.writeFile(`${recording.path}.txt`, transcript, 'utf8');
    return transcript.trim();
  } finally {
    signal.removeEventListener('abort', cancel);
    await whisperAsrEngine.release();
  }
}

export const durationLabel = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};
