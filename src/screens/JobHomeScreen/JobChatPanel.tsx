import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  findNodeHandle,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  TextInput as NativeTextInput,
} from 'react-native';
import {Button, Text, TextInput} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useIsFocused} from '@react-navigation/native';
import {useChatSession} from '../../hooks/useChatSession';
import {chatSessionStore} from '../../store/ChatSessionStore';
import {modelStore} from '../../store/ModelStore';
import {uiStore} from '../../store/UIStore';
import {user, assistant, visibleStepContent} from '../../utils/chat';
import {MessageType} from '../../utils/types';
import {
  composeJobMessage,
  JobMaterial,
  pickJobDocument,
  pickJobScreenshot,
  readJobMaterial,
} from '../../utils/nextJobImport';
import NativeNextJob from '../../specs/NativeNextJob';
import {ensureJobModel} from '../../services/nextJobModel';
import {selectedJobProvider} from '../../services/nextJobAgents';
import {useTheme} from '../../hooks/useTheme';
import {JobReviewRecorder} from './JobReviewRecorder';
import {JobVideoInterview} from './JobVideoInterview';

export function jobMessageText(message: MessageType.Any): string {
  if (message.type === 'text') {
    return message.text;
  }
  if (message.type === 'assistant_turn') {
    return message.steps.map(visibleStepContent).filter(Boolean).join('\n\n');
  }
  return '';
}

type Props = {
  role: string;
  greeting: string;
  draft: string;
  materials: JobMaterial[];
  onMaterials: (items: JobMaterial[]) => void;
  onDraft: (value: string) => void;
  onBusy: (busy: boolean) => void;
};

export const JobChatPanel = observer(
  ({role, greeting, draft, materials, onMaterials, onDraft, onBusy}: Props) => {
    const theme = useTheme();
    const focused = useIsFocused();
    const currentMessageInfo = useRef<{
      createdAt: number;
      id: string;
      sessionId: string;
    } | null>(null);
    const {handleSendPress, handleStopPress} = useChatSession(
      currentMessageInfo,
      user,
      assistant,
    );
    const [busy, setBusy] = useState(false);
    const [childBusy, setChildBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [receiving, setReceiving] = useState(false);
    const [received, setReceived] = useState<string[]>([]);
    const [showMaterial, setShowMaterial] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const input = useRef<React.ComponentRef<typeof NativeTextInput>>(null);
    const dropZone = useRef<React.ComponentRef<typeof View>>(null);
    const boundDropZone = useRef<number | null>(null);
    const inputTag = useRef<number | null>(null);
    const sending = useRef(false);
    const operation = useRef(false);
    const live = useRef(true);
    const chat = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const locked =
      busy || childBusy || receiving || modelStore.isGenerationBusy;
    const childLock = useCallback((value: boolean) => setChildBusy(value), []);
    useEffect(() => {
      onBusy(locked);
    }, [locked, onBusy]);
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    useEffect(() => {
      const listener = NativeNextJob?.onMaterial(event => {
        if (event.target !== inputTag.current) {
          return;
        }
        if (event.phase === 'hover') {
          setDragActive(event.payload === 'enter');
          return;
        }
        setDragActive(false);
        if (event.phase === 'start') {
          setReceiving(true);
          setStatus('正在接收附件…');
        } else {
          setReceiving(false);
          if (event.phase === 'ready') {
            setReceived(values => [...values, event.payload]);
          } else {
            setStatus(event.payload);
          }
        }
      });
      return () => {
        listener?.remove();
        if (inputTag.current !== null) {
          NativeNextJob?.unbindComposer(inputTag.current);
        }
      };
    }, []);
    const bindDropZone = () => {
      const tag = findNodeHandle(dropZone.current);
      if (
        tag != null &&
        inputTag.current != null &&
        boundDropZone.current !== tag
      ) {
        boundDropZone.current = tag;
        void NativeNextJob?.bindDropZone(tag, inputTag.current).catch(() => {
          boundDropZone.current = null;
          setStatus('图片投放区正在准备，可以点一下输入框后再拖入。');
        });
      }
    };
    const bindInput = () => {
      const tag = findNodeHandle(input.current);
      if (tag != null && tag !== inputTag.current) {
        inputTag.current = tag;
        void NativeNextJob?.bindComposer(tag)
          .then(bindDropZone)
          .catch(() => {
            setStatus('图片输入正在准备，点一下输入框后再试。');
            inputTag.current = null;
          });
      } else {
        bindDropZone();
      }
    };

    async function send(text: string, images?: string[]): Promise<string> {
      if (!text.trim()) {
        return '';
      }
      if (text.length > 6000) {
        throw new Error('本次最多发送 6000 字，请拆成几段再发。');
      }
      if (sending.current || modelStore.isGenerationBusy) {
        throw new Error('AI 正在回答，请等它结束或点“停止”。');
      }
      sending.current = true;
      setBusy(true);
      setStatus('AI 正在思考…');
      const before = new Set(
        chatSessionStore.currentSessionMessages.map(message => message.id),
      );
      try {
        await ensureJobModel(setStatus);
        setStatus('AI 正在思考…');
        await handleSendPress({type: 'text', text, imageUris: images});
        const reply = chatSessionStore.currentSessionMessages.find(
          message =>
            !before.has(message.id) &&
            message.author.id === assistant.id &&
            !message.metadata?.system,
        );
        const answer = reply ? jobMessageText(reply) : '';
        if (live.current) {
          setStatus(answer ? '' : '没有生成完整回答，请检查模型后重试。');
        }
        return answer;
      } finally {
        sending.current = false;
        if (live.current) {
          setBusy(false);
        }
      }
    }
    const importMaterial = async (
      action: () => Promise<JobMaterial[] | null>,
    ) => {
      if (operation.current || locked) {
        return;
      }
      operation.current = true;
      setBusy(true);
      setStatus('正在识别截图或读取文件…');
      modelStore.disableAutoRelease('next-job-inline-import');
      try {
        const items = await action();
        if (live.current && items) {
          onMaterials([...materials, ...items]);
          setShowMaterial(items[0]?.id ?? null);
          setStatus('识别结果已展开，核对后可直接发送给 AI。');
        } else if (live.current) {
          setStatus('');
        }
      } catch (error) {
        if (live.current) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      } finally {
        operation.current = false;
        modelStore.enableAutoRelease('next-job-inline-import');
        if (live.current) {
          setBusy(false);
        }
      }
    };
    useEffect(() => {
      if (locked || received.length === 0 || operation.current) {
        return;
      }
      const payload = received[0];
      setReceived(values => values.slice(1));
      void importMaterial(async () => {
        const entries = JSON.parse(payload) as {
          uri?: string;
          name?: string;
          image?: boolean;
          text?: string;
        }[];
        const texts = entries.map(item => item.text ?? '').filter(Boolean);
        if (texts.length) {
          onDraft([draft, ...texts].filter(Boolean).join('\n'));
        }
        const items: JobMaterial[] = [];
        for (const entry of entries) {
          if (entry.uri) {
            items.push(
              await readJobMaterial(
                entry.uri,
                entry.name ?? '附件',
                !!entry.image,
              ),
            );
          }
        }
        return items.length ? items : null;
      });
      // Each native event is dequeued once; stateful callbacks use this render's draft.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked, received]);
    const submit = async () => {
      try {
        const answer = await send(composeJobMessage(draft, materials));
        if (live.current && answer) {
          onDraft('');
          onMaterials([]);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    };
    const messages = chatSessionStore.currentSessionMessages
      .slice(0, 60)
      .reverse();
    return (
      <View style={styles.panel} testID={`job-panel-${role}`}>
        <View style={styles.actions}>
          <Button
            mode="contained-tonal"
            icon="content-paste"
            disabled={locked}
            testID={`paste-${role}`}
            onPress={() => {
              bindInput();
              if (inputTag.current !== null) {
                void NativeNextJob?.pasteClipboard(inputTag.current).catch(
                  error => setStatus(error.message || String(error)),
                );
              }
            }}>
            粘贴
          </Button>
          <Button
            mode="contained-tonal"
            icon="image-outline"
            disabled={locked}
            onPress={() => void importMaterial(pickJobScreenshot)}
            testID={`upload-image-${role}`}>
            传截图
          </Button>
          <Button
            mode={role === 'resume' ? 'contained' : 'outlined'}
            icon="file-document-outline"
            disabled={locked}
            onPress={() => void importMaterial(pickJobDocument)}
            testID={`upload-file-${role}`}>
            {role === 'resume' ? '上传简历' : '传文件'}
          </Button>
        </View>
        <Text style={styles.hint}>
          {Platform.OS === 'ios'
            ? '复制截图后点“粘贴”，自动识别文字；也可以从相册或文件中选择。'
            : '把截图直接拖进下面的框，松手自动识别；也支持粘贴图片和拖入文件。'}
        </Text>
        {role === 'interview' && focused && (
          <JobVideoInterview
            blocked={busy || modelStore.isGenerationBusy}
            vision={modelStore.activeModelCaps.visionActive}
            onSend={send}
            onBusy={childLock}
          />
        )}
        {role === 'review' && (
          <JobReviewRecorder
            blocked={busy || modelStore.isGenerationBusy}
            onAnalyze={async text => {
              await send(text);
            }}
            onBusy={childLock}
          />
        )}
        <View
          ref={dropZone}
          collapsable={false}
          onLayout={bindDropZone}
          testID={`job-drop-zone-${role}`}
          style={[
            styles.chat,
            {
              backgroundColor: theme.colors.background,
              borderColor: dragActive
                ? theme.colors.primary
                : theme.colors.outlineVariant,
            },
          ]}>
          <Text variant="titleSmall">就在这里聊</Text>
          <ScrollView
            ref={chat}
            nestedScrollEnabled
            style={styles.messages}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              chat.current?.scrollToEnd({animated: false})
            }>
            {messages.length === 0 && (
              <Text style={styles.hint}>{greeting}</Text>
            )}
            {messages.map(message => {
              const text = jobMessageText(message);
              if (!text) {
                return null;
              }
              const mine = message.author.id === user.id;
              return (
                <View
                  key={message.id}
                  style={[
                    styles.bubble,
                    {
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      backgroundColor: mine
                        ? theme.colors.primaryContainer
                        : theme.colors.surface,
                    },
                  ]}>
                  <Text variant="labelSmall">{mine ? '你' : 'AI'}</Text>
                  <Text selectable style={styles.messageText}>
                    {text}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          {materials.map(item => (
            <View key={item.id} style={styles.attachment}>
              <View style={styles.attachmentRow}>
                {item.image && item.uri ? (
                  <Image
                    source={{uri: item.uri}}
                    style={styles.thumbnail}
                    accessibilityLabel="待发送截图"
                  />
                ) : (
                  <Text>文件</Text>
                )}
                <View style={styles.attachmentName}>
                  <Text numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.hint}>
                    {item.text.length} 字 · 已读取
                  </Text>
                </View>
                <Button
                  compact
                  disabled={locked}
                  onPress={() =>
                    setShowMaterial(showMaterial === item.id ? null : item.id)
                  }>
                  {showMaterial === item.id ? '收起' : '核对'}
                </Button>
                <Button
                  compact
                  disabled={locked}
                  accessibilityLabel={`移除${item.name}`}
                  onPress={() =>
                    onMaterials(materials.filter(value => value.id !== item.id))
                  }>
                  移除
                </Button>
              </View>
              {showMaterial === item.id && (
                <TextInput
                  mode="outlined"
                  multiline
                  label="核对附件文字，可直接修改"
                  value={item.text}
                  disabled={locked}
                  style={styles.materialText}
                  onChangeText={text =>
                    onMaterials(
                      materials.map(value =>
                        value.id === item.id ? {...value, text} : value,
                      ),
                    )
                  }
                />
              )}
            </View>
          ))}
          <NativeTextInput
            ref={input}
            onLayout={bindInput}
            onFocus={bindInput}
            accessibilityLabel="输入问题，或粘贴截图和文件"
            placeholder={
              Platform.OS === 'ios'
                ? '输入问题，或粘贴截图；简历也可以点上方上传…'
                : role === 'resume'
                  ? '把简历截图拖到框里，松手识别；也可以直接输入要求…'
                  : '把截图拖到这个框里，松手自动识别；也可以直接输入…'
            }
            placeholderTextColor={theme.colors.onSurfaceVariant}
            multiline
            value={draft}
            onChangeText={onDraft}
            editable={!locked}
            style={[
              styles.input,
              {
                color: theme.colors.onSurface,
                borderColor: theme.colors.outline,
              },
            ]}
            testID={`job-input-${role}`}
          />
          <View style={styles.actions}>
            <Button
              mode="contained"
              disabled={locked || (!draft.trim() && materials.length === 0)}
              onPress={() => void submit()}
              testID={`job-send-${role}`}>
              {selectedJobProvider() === 'local' ? '发送' : '发送 · 按量收费'}
            </Button>
            {modelStore.isGenerationBusy && (
              <Button onPress={() => void handleStopPress()}>停止</Button>
            )}
            <Button
              disabled={locked}
              onPress={() =>
                Alert.alert('开始新对话？', '当前对话仍保留在聊天记录中。', [
                  {text: '取消'},
                  {
                    text: '开始',
                    onPress: () => {
                      chatSessionStore.resetActiveSession();
                      onDraft('');
                      onMaterials([]);
                      setStatus('');
                    },
                  },
                ])
              }>
              新对话
            </Button>
          </View>
          {!!status && (
            <Text style={styles.hint} accessibilityLiveRegion="polite">
              {status}
            </Text>
          )}
          {uiStore.chatWarning && (
            <Text style={styles.hint}>{uiStore.chatWarning.message}</Text>
          )}
          {dragActive && (
            <View
              pointerEvents="none"
              style={[
                styles.dropOverlay,
                {backgroundColor: theme.colors.primaryContainer},
              ]}>
              <Text variant="titleLarge">松手，开始识别截图</Text>
              <Text>图片和文件都可以放进来</Text>
            </View>
          )}
        </View>
      </View>
    );
  },
);
const styles = StyleSheet.create({
  panel: {gap: 12, paddingTop: 4},
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  hint: {fontSize: 13, lineHeight: 21},
  chat: {borderWidth: 1, borderRadius: 16, padding: 12, gap: 10},
  messages: {height: 260},
  messageContent: {gap: 10, paddingVertical: 4},
  bubble: {padding: 12, borderRadius: 12, maxWidth: '94%', gap: 5},
  messageText: {fontSize: 15, lineHeight: 24},
  input: {
    maxHeight: 180,
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  attachment: {gap: 6},
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  attachmentName: {flex: 1, minWidth: 90},
  thumbnail: {width: 52, height: 52, borderRadius: 8},
  materialText: {maxHeight: 180},
  dropOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 16,
    opacity: 0.96,
  },
});
