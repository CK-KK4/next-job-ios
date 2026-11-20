import React, {useEffect, useRef, useState} from 'react';
import {Alert, AppState} from 'react-native';
import {Button} from 'react-native-paper';
import NativeNextJob from '../../specs/NativeNextJob';
import {
  durationLabel,
  Recording,
  toggleJobReviewRecording,
} from '../../services/nextJobAudio';

export function JobRecordButton({onOpen}: {onOpen: () => void}) {
  const [state, setState] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const working = useRef(false);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      if (!NativeNextJob || AppState.currentState !== 'active') {
        return;
      }
      const result: Recording = JSON.parse(
        await NativeNextJob.recordingState(),
      );
      if (live) {
        setState(result);
        setNow(Date.now());
      }
    };
    void refresh().catch(() => {});
    const timer = setInterval(() => void refresh().catch(() => {}), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const recording = state?.recording && state.kind === 'review';
  return (
    <Button
      mode="contained"
      icon={recording ? 'stop' : 'microphone'}
      buttonColor={recording ? '#B3261E' : undefined}
      loading={busy}
      disabled={busy || (!!state?.recording && state.kind !== 'review')}
      accessibilityLabel={recording ? '停止并保存复盘录音' : '开始复盘录音'}
      testID="review-quick-record"
      onPress={() => {
        if (working.current) {
          return;
        }
        working.current = true;
        setBusy(true);
        void toggleJobReviewRecording()
          .then(result => {
            setState(result);
            onOpen();
          })
          .catch(error =>
            Alert.alert('录音提示', error.message || String(error)),
          )
          .finally(() => {
            working.current = false;
            setBusy(false);
          });
      }}>
      {recording
        ? `停止 ${durationLabel(now - (state?.startedAt ?? now))}`
        : '录音'}
    </Button>
  );
}
