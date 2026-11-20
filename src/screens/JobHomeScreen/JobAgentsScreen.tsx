import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {Button, Text, TextInput} from 'react-native-paper';
import {usePreventRemove} from '@react-navigation/native';
import type {StackScreenProps} from '@react-navigation/stack';
import {observer} from 'mobx-react-lite';
import {useTheme} from '../../hooks/useTheme';
import {serverStore} from '../../store/ServerStore';
import {selectJobModel} from '../../services/nextJobModel';
import {
  configureJobAgent,
  JOB_AGENTS,
  JOB_PLATFORM_CONFIG,
  JobProvider,
  jobPlatformServer,
  jobPrice,
  selectedJobProvider,
} from '../../services/nextJobAgents';
import {JobStackParams, useJobWorkspace} from './JobWorkspace';

export const JobAgentsScreen = observer(
  ({navigation}: StackScreenProps<JobStackParams, 'JobAgents'>) => {
    const theme = useTheme();
    const {setBusy} = useJobWorkspace();
    const [provider, setProvider] = useState<JobProvider>(
      selectedJobProvider(),
    );
    const [modelId, setModelId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [complete, setComplete] = useState(false);
    const [error, setError] = useState('');
    const operation = useRef(false);
    usePreventRemove(saving, () =>
      Alert.alert('正在切换 Agent', '请稍等，切换完成后可以返回。'),
    );
    useEffect(() => {
      if (complete && !saving) navigation.goBack();
    }, [complete, saving, navigation]);
    useEffect(() => {
      let live = true;
      setApiKey('');
      setHasKey(false);
      setError('');
      setLoading(true);
      (async () => {
        await serverStore.ready;
        if (!live || provider === 'local') return;
        const server = jobPlatformServer(provider);
        const models = server
          ? serverStore.getUserSelectedModelsForServer(server.id)
          : [];
        const current = models.find(
          item =>
            `${item.serverId}/${item.remoteModelId}` ===
            serverStore.nextJobModelId,
        );
        const keyExists = server
          ? !!(await serverStore.getApiKey(server.id))
          : false;
        if (live) {
          setModelId(
            current?.remoteModelId ??
              models[models.length - 1]?.remoteModelId ??
              JOB_PLATFORM_CONFIG[provider].defaultModel,
          );
          setHasKey(keyExists);
        }
      })()
        .catch(() => {
          if (live) setError('读取平台设置失败，请重新进入。');
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
      };
    }, [provider]);
    const useAgent = async () => {
      if (operation.current || loading) return;
      operation.current = true;
      setSaving(true);
      setBusy(true);
      setError('');
      try {
        if (provider === 'local') await selectJobModel('local');
        else await configureJobAgent(provider, modelId, apiKey);
        setApiKey('');
        setComplete(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        operation.current = false;
        setSaving(false);
        setBusy(false);
      }
    };
    const open = (url: string) =>
      Linking.openURL(url).catch(() => setError('无法打开链接，请稍后重试。'));
    return (
      <ScrollView
        testID="job-agents"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}>
        <Text variant="headlineSmall">选谁来帮你？</Text>
        <Text style={styles.note}>
          本地 AI 免费可用。云端平台需要你自己的 API Key，发送后由平台计费。
        </Text>
        {JOB_AGENTS.map(agent => (
          <Pressable
            key={agent.id}
            testID={`agent-option-${agent.id}`}
            accessibilityRole="radio"
            accessibilityState={{
              selected: provider === agent.id,
              disabled: saving,
            }}
            disabled={saving}
            onPress={() => setProvider(agent.id)}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor:
                  provider === agent.id
                    ? theme.colors.primary
                    : theme.colors.outlineVariant,
              },
            ]}>
            <View style={styles.row}>
              <Text variant="titleMedium">{agent.name}</Text>
              <Text
                style={[
                  styles.badge,
                  {
                    color:
                      agent.id === 'local'
                        ? theme.colors.primary
                        : theme.colors.error,
                  },
                ]}>
                {agent.fee}
              </Text>
            </View>
            <Text style={styles.note}>{agent.description}</Text>
            {selectedJobProvider() === agent.id && (
              <Text style={styles.note}>当前使用</Text>
            )}
          </Pressable>
        ))}
        <View style={styles.settings}>
          {provider !== 'local' && (
            <>
              <TextInput
                mode="outlined"
                label="模型 ID / 接入点 ID"
                testID="agent-model-id"
                value={modelId}
                onChangeText={setModelId}
                disabled={saving || loading}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                mode="outlined"
                label={hasKey ? 'API Key（已保存，留空沿用）' : 'API Key'}
                testID="agent-api-key"
                value={apiKey}
                onChangeText={setApiKey}
                disabled={saving || loading}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.note}>
                密钥保存在手机安全存储中。首次使用请在平台开通对应模型。
              </Text>
            </>
          )}
          <Text variant="titleSmall">
            {provider === 'local' ? '免费' : 'API 参考费用'}
          </Text>
          <Text testID="agent-price" style={styles.note}>
            {jobPrice(provider, modelId.trim())}
          </Text>
          {provider !== 'local' && (
            <>
              <Text style={styles.note}>
                核对日期：2026-11-19。tokens
                是平台计量文字用量的单位，并不等于字数。赠送额度和最终账单以平台为准。
              </Text>
              <View style={styles.links}>
                <Button
                  compact
                  onPress={() =>
                    open(JOB_PLATFORM_CONFIG[provider].pricingUrl)
                  }>
                  官方价格
                </Button>
                <Button
                  compact
                  onPress={() =>
                    open(JOB_PLATFORM_CONFIG[provider].consoleUrl)
                  }>
                  获取 API Key
                </Button>
              </View>
              <Text style={styles.note}>
                发送时，当前对话和附件识别文字会交给这个平台。保存设置不会发送测试对话，也不代表已验证账号可用。
              </Text>
            </>
          )}
          {!!error && (
            <Text
              accessibilityLiveRegion="polite"
              style={{color: theme.colors.error}}>
              {error}
            </Text>
          )}
          <Button
            mode="contained"
            testID="agent-save"
            loading={saving}
            disabled={saving || loading}
            onPress={() => {
              useAgent();
            }}>
            {provider === 'local' ? '使用免费 AI' : '保存并使用（按量收费）'}
          </Button>
        </View>
      </ScrollView>
    );
  },
);
const styles = StyleSheet.create({
  container: {padding: 18, paddingBottom: 40, gap: 14},
  note: {fontSize: 13, lineHeight: 22},
  card: {padding: 16, borderWidth: 1, borderRadius: 16, gap: 6},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badge: {fontSize: 12, fontWeight: '700'},
  settings: {gap: 12, marginTop: 6},
  links: {flexDirection: 'row', flexWrap: 'wrap'},
});
