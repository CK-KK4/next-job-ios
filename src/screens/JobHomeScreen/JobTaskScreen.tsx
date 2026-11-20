import React, {useCallback, useState} from 'react';
import {Alert, ScrollView, StyleSheet, View} from 'react-native';
import {ActivityIndicator, Button, Text} from 'react-native-paper';
import {useFocusEffect, usePreventRemove} from '@react-navigation/native';
import type {StackScreenProps} from '@react-navigation/stack';
import {observer} from 'mobx-react-lite';
import {palStore} from '../../store/PalStore';
import {chatSessionStore} from '../../store/ChatSessionStore';
import {modelStore} from '../../store/ModelStore';
import {NEXT_JOB_PALS} from '../../store/nextJobPals';
import {jobAgentLabel, selectedJobProvider} from '../../services/nextJobAgents';
import {JobChatPanel} from './JobChatPanel';
import {useJobWorkspace, JobStackParams} from './JobWorkspace';
export const JobTaskScreen = observer(
  ({route, navigation}: StackScreenProps<JobStackParams, 'JobTask'>) => {
    const {role} = route.params;
    const template = NEXT_JOB_PALS.find(
      item => item.parameters.nextJobRole === role,
    );
    const workspace = useJobWorkspace();
    const {setBusy} = workspace;
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    usePreventRemove(workspace.busy || modelStore.isGenerationBusy, () => {
      Alert.alert(
        '请先完成当前操作',
        '附件读取、AI 回答或面试回答结束后再返回。复盘录音可以在后台继续。',
      );
    });
    useFocusEffect(
      useCallback(() => {
        let live = true;
        setReady(false);
        setError('');
        setBusy(true);
        (async () => {
          await palStore.ready;
          if (!live) return;
          const pal = palStore.pals.find(
            item => item.parameters?.nextJobRole === role,
          );
          if (!pal) throw new Error('助手没有找到，请重新打开 App 后重试。');
          if (chatSessionStore.activePalId !== pal.id) {
            const session = chatSessionStore.sessions.find(
              item => item.activePalId === pal.id,
            );
            if (session) await chatSessionStore.setActiveSession(session.id);
            else {
              chatSessionStore.resetActiveSession();
              await chatSessionStore.setActivePal(pal.id);
            }
          }
          if (live) setReady(true);
        })()
          .catch(reason => {
            if (live) setError(reason.message || String(reason));
          })
          .finally(() => setBusy(false));
        return () => {
          live = false;
          setReady(false);
        };
      }, [role, setBusy]),
    );
    const onBusy = useCallback((value: boolean) => setBusy(value), [setBusy]);
    return (
      <ScrollView
        testID={`job-task-${role}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <Text variant="labelLarge">{jobAgentLabel()}</Text>
        <Text style={styles.note}>
          {selectedJobProvider() === 'local'
            ? '截图、文件和对话都在这里处理。'
            : '发送后，当前对话和附件文字会交给所选平台，按平台 API 用量收费。'}
        </Text>
        {!ready && !error && <ActivityIndicator />}
        {!!error && (
          <View>
            <Text>{error}</Text>
            <Button onPress={() => navigation.replace('JobTask', {role})}>
              重试
            </Button>
          </View>
        )}
        {ready && template && (
          <JobChatPanel
            role={role}
            greeting={template.greeting?.text ?? ''}
            draft={workspace.drafts[role] ?? ''}
            materials={workspace.attachments[role] ?? []}
            onDraft={text =>
              workspace.setDrafts(current => ({...current, [role]: text}))
            }
            onMaterials={items =>
              workspace.setAttachments(current => ({...current, [role]: items}))
            }
            onBusy={onBusy}
          />
        )}
      </ScrollView>
    );
  },
);
const styles = StyleSheet.create({
  content: {padding: 16, paddingBottom: 40, gap: 10},
  note: {fontSize: 13, lineHeight: 21},
});
