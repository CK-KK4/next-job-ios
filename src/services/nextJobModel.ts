import {AppState, Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {when} from 'mobx';
import {modelStore} from '../store/ModelStore';
import {serverStore} from '../store/ServerStore';
import {ModelOrigin, ModelType} from '../utils/types';

const filename = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
const checksum =
  '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db';
const bytes = 491400032;
let preparing: Promise<void> | undefined;

/** Uses ModelStore as the only model registry and context owner. */
export function ensureJobModel(
  onStatus: (text: string) => void = () => {},
): Promise<void> {
  if (preparing) {
    return preparing;
  }
  preparing = (async () => {
    onStatus('AI 正在准备，稍等就能聊…');
    await Promise.all([modelStore.ready, serverStore.ready]);
    if (modelStore.isContextLoading) {
      await when(() => !modelStore.isContextLoading, {timeout: 120000});
    }
    if (serverStore.nextJobModelId !== 'local') {
      const remote = modelStore.remoteModels.find(
        item => item.id === serverStore.nextJobModelId,
      );
      if (!remote?.serverId) {
        throw new Error('平台配置已失效，请在顶部 Agent 入口重新设置。');
      }
      if (!(await serverStore.getApiKey(remote.serverId))) {
        throw new Error('请先在顶部 Agent 入口填写这个平台的 API Key。');
      }
      if (!modelStore.engine || modelStore.activeModel?.id !== remote.id) {
        await modelStore.selectModel(remote);
      }
      return;
    }
    if (
      modelStore.engine &&
      modelStore.activeModel?.origin !== ModelOrigin.REMOTE
    ) {
      return;
    }
    const candidates = [modelStore.lastUsedModel, ...modelStore.models];
    let model;
    for (const candidate of candidates) {
      if (
        !candidate?.isDownloaded ||
        candidate.origin === ModelOrigin.REMOTE ||
        candidate.modelType === ModelType.PROJECTION ||
        candidate.modelType === ModelType.DRAFT
      ) {
        continue;
      }
      const path = await modelStore.getModelFullPath(candidate);
      if (path && (await RNFS.exists(path))) {
        model = candidate;
        break;
      }
    }
    if (!model) {
      onStatus('首次使用，正在准备内置中文 AI，无需下载…');
      const directory = `${RNFS.DocumentDirectoryPath}/models/local/nextjob`;
      const path = `${directory}/${filename}`;
      await RNFS.mkdir(directory);
      if (
        !(await RNFS.exists(path)) ||
        Number((await RNFS.stat(path)).size) !== bytes
      ) {
        const space = await RNFS.getFSInfo();
        if (space.freeSpace < bytes + 100 * 1024 * 1024) {
          throw new Error('手机空间不足，请空出至少 600 MB 后重试。');
        }
        const temporary = `${path}.part`;
        try {
          if (Platform.OS === 'ios') {
            await RNFS.copyFile(
              `${RNFS.MainBundlePath}/nextjob/${filename}`,
              temporary,
            );
          } else {
            await RNFS.copyFileAssets(`nextjob/${filename}`, temporary);
          }
          if ((await RNFS.hash(temporary, 'sha256')) !== checksum) {
            throw new Error('内置模型校验失败，请重新安装完整版 App。');
          }
          if (await RNFS.exists(path)) {
            await RNFS.unlink(path);
          }
          await RNFS.moveFile(temporary, path);
        } finally {
          if (await RNFS.exists(temporary)) {
            await RNFS.unlink(temporary);
          }
        }
      }
      model = modelStore.models.find(item => item.fullPath === path);
      if (!model) {
        await modelStore.addLocalModel(path);
        model = modelStore.models.find(item => item.fullPath === path);
      }
    }
    if (!model) {
      throw new Error('AI 准备失败，请重试。');
    }
    if (AppState.currentState !== 'active') {
      throw new Error('回到 App 后会继续自动加载 AI。');
    }
    onStatus('正在自动加载 AI…');
    await modelStore.selectModel(model);
    if (!modelStore.engine) {
      throw new Error('AI 尚未就绪，请稍后重试。');
    }
  })().finally(() => {
    preparing = undefined;
  });
  return preparing;
}

/** A deliberate platform switch shares the existing model lifecycle/owner. */
export async function selectJobModel(
  modelId: string,
  onStatus: (text: string) => void = () => {},
): Promise<void> {
  if (preparing) {
    await preparing.catch(() => {});
  }
  if (modelStore.isGenerationBusy) {
    throw new Error('请等当前回答结束，或先点停止。');
  }
  serverStore.setNextJobModel(modelId);
  await ensureJobModel(onStatus);
}
