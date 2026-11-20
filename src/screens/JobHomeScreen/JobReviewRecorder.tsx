import React, {useEffect, useRef, useState} from 'react';
import {Alert, AppState, Platform, StyleSheet, View} from 'react-native';
import {Button, Text, TextInput} from 'react-native-paper';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import NativeNextJob from '../../specs/NativeNextJob';
import {
  durationLabel,
  Recording,
  toggleJobReviewRecording,
  transcribeJobRecording,
} from '../../services/nextJobAudio';

type Props = {
  blocked: boolean;
  onAnalyze: (text: string) => Promise<void>;
  onBusy: (busy: boolean) => void;
};

export function JobReviewRecorder({onAnalyze, onBusy, blocked}: Props) {
  const [state, setState] = useState<Recording | null>(null);
  const [files, setFiles] = useState<Recording[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showAll, setShowAll] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const lastSaved = useRef('');

  const refresh = async () => {
    if (!NativeNextJob) {
      return;
    }
    const [current, list] = await Promise.all([
      NativeNextJob.recordingState(),
      NativeNextJob.listRecordings(),
    ]);
    if (mounted.current) {
      const currentState: Recording = JSON.parse(current);
      const reviewFiles = (JSON.parse(list) as Recording[]).filter(
        file => file.kind === 'review',
      );
      const saved = reviewFiles.find(
        file => file.path === currentState.path && !file.recording,
      );
      setState(currentState);
      if (
        !currentState.recording &&
        currentState.kind === 'review' &&
        saved &&
        currentState.durationMs > 0 &&
        lastSaved.current !== currentState.path
      ) {
        lastSaved.current = currentState.path;
        setSelected(saved);
        setParts([]);
        setPage(0);
      }
      setFiles(reviewFiles);
      setNow(Date.now());
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refresh().catch(() => {});
      }
    }, 1500);
    const listener = AppState.addEventListener('change', value => {
      if (value === 'active') {
        void refresh().catch(() => {});
      } else {
        abort.current?.abort();
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      listener.remove();
      abort.current?.abort();
    };
  }, []);

  async function perform(action: () => Promise<void>) {
    if (operation.current) {
      return;
    }
    operation.current = true;
    setBusy(true);
    onBusy(true);
    try {
      await action();
    } catch (error) {
      if (mounted.current) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      operation.current = false;
      if (mounted.current) {
        setBusy(false);
      }
      onBusy(false);
    }
  }

  const start = () => {
    void perform(async () => {
      setState(await toggleJobReviewRecording());
      setStatus('录音中，可以切到后台。录音结束后再转文字分析。');
      await refresh();
    });
  };
  const stop = () =>
    perform(async () => {
      const current: Recording = JSON.parse(
        await NativeNextJob!.recordingState(),
      );
      const stopped = current.recording
        ? await toggleJobReviewRecording()
        : current;
      setState(stopped);
      setSelected(stopped);
      setParts([]);
      setPage(0);
      setStatus(stopped.error || '已保存。点“转文字”后核对内容，再分析。');
      await refresh();
    });
  const select = (file: Recording) =>
    perform(async () => {
      setSelected(file);
      setPage(0);
      setParts([]);
      setStatus('');
      const path = `${file.path}.txt`;
      if (await RNFS.exists(path)) {
        const text = await RNFS.readFile(path, 'utf8');
        setParts(text.match(/[\s\S]{1,3000}/g) ?? []);
      }
    });
  const transcribe = () =>
    perform(async () => {
      if (blocked) {
        throw new Error('请等当前 AI 回答结束，再开始转文字。');
      }
      if (!selected) {
        return;
      }
      const controller = new AbortController();
      abort.current = controller;
      setStatus('正在准备本地语音识别…');
      const result = await transcribeJobRecording(
        selected,
        progress => {
          if (mounted.current) {
            setStatus(
              `正在转文字 ${Math.round(progress * 100)}%，请保持 App 在前台`,
            );
          }
        },
        controller.signal,
      );
      if (mounted.current) {
        setParts(result.match(/[\s\S]{1,3000}/g) ?? []);
        setPage(0);
        setStatus('请核对转写，可直接修改。长录音分段分析。');
      }
    });

  const recording = state?.recording && state.kind === 'review';
  return (
    <View style={styles.box} testID="job-review-recorder">
      <Text variant="titleMedium">录下面试，回来复盘</Text>
      <Text style={styles.hint}>
        {Platform.OS === 'ios'
          ? '麦克风录音可在锁屏或后台继续；转文字和分析时请保持 App 打开。无法录制电话或其他 App 的内部音频，来电可能中断录音。'
          : '麦克风录音可在后台继续；转文字和 AI 分析请保持 App 打开。电话或会议 App 的对方声音不保证能录到。'}
      </Text>
      <View style={styles.row}>
        {recording ? (
          <Button
            mode="contained"
            disabled={busy}
            onPress={() => void stop()}
            testID="review-stop">
            停止并保存 · {durationLabel(now - (state.startedAt ?? now))}
          </Button>
        ) : (
          <Button
            mode="contained"
            icon="microphone"
            disabled={busy || !!state?.recording}
            onPress={start}
            testID="review-start">
            开始录音
          </Button>
        )}
      </View>
      {!!status && (
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          {status}
        </Text>
      )}
      {!recording && !!state?.error && <Text>{state.error}</Text>}
      {(showAll ? files : files.slice(0, 3)).map(file => (
        <Button
          key={file.path}
          mode={file.path === selected?.path ? 'outlined' : 'text'}
          disabled={busy || file.recording}
          onPress={() => void select(file)}>
          {new Date(file.createdAt ?? 0).toLocaleString()} ·{' '}
          {durationLabel(file.durationMs)}
          {file.recording ? ' · 录音中' : ''}
        </Button>
      ))}
      {files.length > 3 && (
        <Button onPress={() => setShowAll(value => !value)}>
          {showAll ? '收起列表' : `查看全部 ${files.length} 条录音`}
        </Button>
      )}
      {selected && !recording && (
        <View>
          <View style={styles.row}>
            <Button
              mode="outlined"
              disabled={busy}
              onPress={() => void transcribe()}>
              转文字
            </Button>
            <Button
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await Share.open({
                    url: `file://${selected.path}`,
                    type: 'audio/wav',
                    failOnCancel: false,
                  });
                })
              }>
              导出录音
            </Button>
            <Button
              disabled={busy}
              onPress={() =>
                Alert.alert('删除这条录音？', '录音和转写文字会从本机删除。', [
                  {text: '取消', style: 'cancel'},
                  {
                    text: '删除',
                    style: 'destructive',
                    onPress: () => {
                      void perform(async () => {
                        await NativeNextJob!.deleteRecording(selected.path);
                        if (await RNFS.exists(`${selected.path}.txt`)) {
                          await RNFS.unlink(`${selected.path}.txt`);
                        }
                        setSelected(null);
                        setParts([]);
                        await refresh();
                      });
                    },
                  },
                ])
              }>
              删除
            </Button>
          </View>
          {busy && (
            <Button onPress={() => abort.current?.abort()}>停止转写</Button>
          )}
          {parts.length > 0 && (
            <>
              <TextInput
                mode="outlined"
                label={`转写内容 · 第 ${page + 1}/${parts.length} 段`}
                multiline
                value={parts[page]}
                onChangeText={value =>
                  setParts(values =>
                    values.map((part, index) =>
                      index === page ? value : part,
                    ),
                  )
                }
                style={styles.transcript}
                disabled={busy}
              />
              <View style={styles.row}>
                <Button
                  disabled={busy || page === 0}
                  onPress={() => setPage(value => value - 1)}>
                  上一段
                </Button>
                <Button
                  disabled={busy || page === parts.length - 1}
                  onPress={() => setPage(value => value + 1)}>
                  下一段
                </Button>
                <Button
                  mode="contained"
                  disabled={busy || !parts[page]?.trim()}
                  onPress={() =>
                    void perform(async () => {
                      await onAnalyze(
                        `请复盘下面这段真实面试转写。这是第 ${page + 1}/${parts.length} 段，只依据本段内容分析；转写可能有误，不确定的地方请指出。\n\n${parts[page]}`,
                      );
                    })
                  }>
                  分析这段
                </Button>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {gap: 10, marginBottom: 16},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  hint: {lineHeight: 22},
  transcript: {maxHeight: 260},
});
