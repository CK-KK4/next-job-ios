import React, {useEffect, useState} from 'react';
import {AppState, ScrollView, Pressable, StyleSheet, View} from 'react-native';
import {Button, Icon, Text} from 'react-native-paper';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {observer} from 'mobx-react-lite';
import {useTheme} from '../../hooks/useTheme';
import {NEXT_JOB_PALS} from '../../store/nextJobPals';
import {ROUTES} from '../../utils/navigationConstants';
import {ensureJobModel} from '../../services/nextJobModel';
import {jobAgentLabel, selectedJobProvider} from '../../services/nextJobAgents';
import {JobRecordButton} from './JobRecordButton';
import type {JobStackParams} from './JobWorkspace';
const ICONS: Record<string, string> = {
  job: 'briefcase-search-outline',
  resume: 'file-document-edit-outline',
  interview: 'video-outline',
  test: 'clipboard-check-outline',
  review: 'microphone-outline',
};
const SUMMARIES: Record<string, string> = {
  job: '看看合不合适投。',
  resume: '上传简历，按岗位改。',
  interview: '开镜头，一问一答。',
  test: '拆题目，检查答案。',
  review: '录下面试，找到改进点。',
};
const JobHomeScreen = observer(() => {
  const theme = useTheme();
  const navigation = useNavigation<StackNavigationProp<JobStackParams>>();
  const focused = useIsFocused();
  const [status, setStatus] = useState('AI 正在准备…');
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!focused) return;
    let live = true;
    const prepare = () => {
      if (AppState.currentState !== 'active') return;
      setError(false);
      ensureJobModel(text => {
        if (live) setStatus(text);
      })
        .then(() => {
          if (live)
            setStatus(
              selectedJobProvider() === 'local'
                ? 'AI 已自动加载，可以直接聊。'
                : '已选择平台，发送时使用你的 API 账号。',
            );
        })
        .catch(reason => {
          if (live) {
            setStatus(reason.message || String(reason));
            setError(true);
          }
        });
    };
    prepare();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') prepare();
    });
    return () => {
      live = false;
      listener.remove();
    };
  }, [focused]);
  return (
    <ScrollView testID="job-home" contentContainerStyle={styles.container}>
      <Text variant="headlineMedium">今天先做哪一步？</Text>
      <Text style={styles.intro}>点开就开始，返回这里再选下一步。</Text>
      <View style={styles.grid}>
        {NEXT_JOB_PALS.map(template => {
          const role = template.parameters.nextJobRole;
          return (
            <View
              key={role}
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}>
              <Pressable
                testID={`job-card-${role}`}
                accessibilityRole="button"
                accessibilityLabel={`进入${template.name}`}
                style={styles.cardButton}
                onPress={() => navigation.navigate('JobTask', {role})}>
                <Icon
                  source={ICONS[role]}
                  size={28}
                  color={template.color?.[0]}
                />
                <Text variant="titleMedium">{template.name}　›</Text>
                <Text style={styles.description}>{SUMMARIES[role]}</Text>
              </Pressable>
              {role === 'review' && (
                <JobRecordButton
                  onOpen={() =>
                    navigation.navigate('JobTask', {role: 'review'})
                  }
                />
              )}
            </View>
          );
        })}
      </View>
      <View
        style={[styles.footer, {borderColor: theme.colors.outlineVariant}]}
        testID="job-model-footer">
        <Text variant="labelLarge">{jobAgentLabel()}</Text>
        <Text style={styles.description}>{status}</Text>
        {error && (
          <Button onPress={() => navigation.navigate('JobAgents')}>
            选择或设置 Agent
          </Button>
        )}
        <Button
          compact
          onPress={() => navigation.getParent()?.navigate(ROUTES.MODELS)}>
          模型设置（可选）
        </Button>
      </View>
    </ScrollView>
  );
});
const styles = StyleSheet.create({
  container: {padding: 18, paddingBottom: 28},
  intro: {fontSize: 14, lineHeight: 22, marginTop: 8, marginBottom: 18},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  card: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  cardButton: {gap: 8},
  description: {fontSize: 13, lineHeight: 21},
  footer: {borderTopWidth: 1, marginTop: 22, paddingTop: 16, gap: 6},
});
export default JobHomeScreen;
