import React, {useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import {Button, Switch, Text} from 'react-native-paper';
import {Camera, useCameraDevice} from 'react-native-vision-camera';
import {useIsFocused} from '@react-navigation/native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import NativeNextJob from '../../specs/NativeNextJob';
import {
  ensureJobSpeech,
  Recording,
  requestRecording,
  transcribeJobRecording,
} from '../../services/nextJobAudio';

type Props = {
  blocked: boolean;
  vision: boolean;
  onSend: (text: string, images?: string[]) => Promise<string>;
  onBusy: (busy: boolean) => void;
};

export function JobVideoInterview({vision, onSend, onBusy, blocked}: Props) {
  const device = useCameraDevice('front');
  const camera = useRef<Camera>(null);
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [seeFrame, setSeeFrame] = useState(false);
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const ownedRecording = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  const operation = useRef(false);

  useEffect(() => {
    active.current = true;
    const listener = AppState.addEventListener('change', value => {
      setForeground(value === 'active');
      if (value !== 'active') {
        NativeNextJob?.stopSpeaking();
        abort.current?.abort();
        if (ownedRecording.current) {
          ownedRecording.current = false;
          void NativeNextJob?.stopRecording().finally(() => {
            if (active.current) {
              setRecording(false);
              setStatus('视频练习已暂停，重新开始回答即可。');
              onBusy(false);
            }
          });
        }
      }
    });
    return () => {
      active.current = false;
      listener.remove();
      abort.current?.abort();
      NativeNextJob?.stopSpeaking();
      if (ownedRecording.current) {
        ownedRecording.current = false;
        void NativeNextJob?.stopRecording().catch(() => {});
      }
      onBusy(false);
    };
  }, [onBusy]);

  useEffect(() => {
    if (!focused) {
      setVisible(false);
      NativeNextJob?.stopSpeaking();
      abort.current?.abort();
      if (ownedRecording.current) {
        ownedRecording.current = false;
        void NativeNextJob?.stopRecording().finally(() => {
          setRecording(false);
          onBusy(false);
        });
      }
    }
  }, [focused, onBusy]);

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
      if (active.current) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      operation.current = false;
      if (active.current) {
        setBusy(false);
      }
      onBusy(ownedRecording.current);
    }
  }
  const ask = (text: string, images?: string[]) =>
    perform(async () => {
      setStatus('AI 正在思考…');
      const answer = await onSend(text, images);
      if (active.current && AppState.currentState === 'active' && answer) {
        setStatus('AI 正在朗读，你可以随时停止朗读。');
        await NativeNextJob!.speak(answer);
        if (active.current) {
          setStatus('轮到你了，点“开始回答”。');
        }
      }
    });
  const finish = () =>
    perform(async () => {
      const file: Recording = JSON.parse(await NativeNextJob!.stopRecording());
      ownedRecording.current = false;
      setRecording(false);
      if (file.error) {
        throw new Error(file.error);
      }
      setStatus('正在把你的回答转成文字…');
      const controller = new AbortController();
      abort.current = controller;
      const text = await transcribeJobRecording(
        file,
        () => {},
        controller.signal,
      );
      if (!active.current || controller.signal.aborted) {
        return;
      }
      setTranscript(text);
      let images: string[] | undefined;
      if (seeFrame && vision && camera.current && ready) {
        const photo = await camera.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });
        const folder = `${RNFS.DocumentDirectoryPath}/nextjob-frames`;
        await RNFS.mkdir(folder);
        const path = `${folder}/${Date.now()}.jpg`;
        await RNFS.moveFile(photo.path, path);
        images = [`file://${path}`];
      }
      setStatus('AI 正在思考…');
      const answer = await onSend(text, images);
      if (active.current && AppState.currentState === 'active' && answer) {
        setStatus('AI 正在朗读…');
        await NativeNextJob!.speak(answer);
        if (active.current) {
          setStatus('轮到你了，点“开始回答”。');
        }
      }
    });

  if (!visible) {
    return (
      <View style={styles.box}>
        <Button
          mode="contained"
          icon="video"
          disabled={busy || blocked}
          testID="interview-video"
          onPress={() =>
            void perform(async () => {
              if (!NativeNextJob) {
                throw new Error('面试组件未就绪，请重新打开 App。');
              }
              if (!device) {
                throw new Error(
                  '没有检测到前置摄像头，仍可在下方进行文字面试。',
                );
              }
              const permission = await Camera.requestCameraPermission();
              if (permission !== 'granted') {
                throw new Error('请在系统设置中允许相机权限。');
              }
              setVisible(true);
              setStatus('按回合练习：AI 提问，你说完后点“我说完了”。');
            })
          }>
          视频练习
        </Button>
        {!!status && <Text>{status}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.box} testID="video-interview-panel">
      {device && (
        <Camera
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={visible && focused && foreground}
          photo
          onInitialized={() => setReady(true)}
          onError={error => setStatus(`相机未就绪：${error.message}`)}
        />
      )}
      <Text>
        {vision
          ? '可把当前画面随回答交给 AI。按回合分析，不是连续视频直播。'
          : '当前模型只听声音；镜头画面供你练习仪态，AI 暂时看不到画面。'}
      </Text>
      {vision && (
        <View style={styles.row}>
          <Switch
            value={seeFrame}
            onValueChange={setSeeFrame}
            disabled={busy || recording}
          />
          <Text>每次回答附上当前画面</Text>
        </View>
      )}
      <Text accessibilityLiveRegion="polite">{status}</Text>
      {!!transcript && <Text selectable>刚才说的：{transcript}</Text>}
      <View style={styles.row}>
        <Button
          mode="outlined"
          disabled={busy || recording || blocked}
          onPress={() =>
            void ask('请开始模拟面试。先问我想应聘什么岗位，一次只问一个问题。')
          }>
          让 AI 提问
        </Button>
        {recording ? (
          <Button
            mode="contained"
            disabled={busy}
            onPress={() => void finish()}>
            我说完了
          </Button>
        ) : (
          <Button
            mode="contained"
            disabled={busy || blocked}
            onPress={() =>
              void perform(async () => {
                NativeNextJob!.stopSpeaking();
                await requestRecording();
                setStatus('首次准备本地语音识别…');
                await ensureJobSpeech();
                await NativeNextJob!.startRecording('interview');
                ownedRecording.current = true;
                setRecording(true);
                setStatus('正在听，请回答；说完后点击“我说完了”。');
              })
            }>
            开始回答
          </Button>
        )}
        <Button onPress={() => NativeNextJob?.stopSpeaking()}>停止朗读</Button>
        <Button
          disabled={busy}
          onPress={() =>
            void perform(async () => {
              if (ownedRecording.current) {
                await NativeNextJob!.stopRecording();
                ownedRecording.current = false;
                setRecording(false);
              }
              NativeNextJob?.stopSpeaking();
              setVisible(false);
              setReady(false);
              setStatus('');
            })
          }>
          关闭镜头
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {gap: 12, marginBottom: 16},
  camera: {height: 260, borderRadius: 16},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
});
