import type {TurboModule, CodegenTypes} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  readonly onMaterial: CodegenTypes.EventEmitter<{
    target: number;
    phase: string;
    payload: string;
  }>;
  bindComposer(tag: number): Promise<void>;
  bindDropZone(tag: number, composerTag: number): Promise<void>;
  unbindComposer(tag: number): void;
  pasteClipboard(tag: number): Promise<void>;
  startRecording(kind: string): Promise<string>;
  stopRecording(): Promise<string>;
  recordingState(): Promise<string>;
  listRecordings(): Promise<string>;
  deleteRecording(path: string): Promise<void>;
  recognizeImage(uri: string): Promise<string>;
  readDocument(uri: string, name: string): Promise<string>;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
}

export default Platform.OS === 'android' || Platform.OS === 'ios'
  ? TurboModuleRegistry.getEnforcing<Spec>('NextJobModule')
  : null;
