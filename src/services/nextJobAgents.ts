import {serverStore} from '../store/ServerStore';
import {modelStore} from '../store/ModelStore';
import {selectJobModel} from './nextJobModel';

export type JobProvider = 'local' | 'deepseek' | 'doubao';
export const JOB_AGENTS = [
  {
    id: 'local',
    name: '本地 AI',
    fee: '免费',
    description: '无需账号，使用手机内置模型。',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    fee: 'API 按量收费',
    description: '使用你自己的 DeepSeek API 账号。',
  },
  {
    id: 'doubao',
    name: '豆包',
    fee: 'API 按量收费',
    description: '通过火山方舟调用豆包模型。',
  },
] as const;

export const JOB_PLATFORM_CONFIG = {
  deepseek: {
    url: 'https://api.deepseek.com',
    serverType: 'DeepSeek' as const,
    defaultModel: 'deepseek-flash',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    pricingUrl: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  },
  doubao: {
    url: 'https://ark.cn-beijing.volces.com/api/v3',
    serverType: 'Doubao' as const,
    defaultModel: 'doubao-seed-2-1-lite-260915',
    consoleUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    pricingUrl: 'https://www.volcengine.com/docs/82379/1544106',
  },
};

export function jobPlatformServer(provider: Exclude<JobProvider, 'local'>) {
  return serverStore.servers.find(item => item.nextJobProvider === provider);
}
export function selectedJobProvider(): JobProvider {
  const model = modelStore.remoteModels.find(
    item => item.id === serverStore.nextJobModelId,
  );
  return (
    serverStore.servers.find(item => item.id === model?.serverId)
      ?.nextJobProvider ?? 'local'
  );
}
export function jobAgentLabel(): string {
  if (
    serverStore.nextJobModelId !== 'local' &&
    selectedJobProvider() === 'local'
  )
    return '配置待检查';
  const agent = JOB_AGENTS.find(item => item.id === selectedJobProvider())!;
  return `${agent.name} · ${agent.id === 'local' ? '免费' : '收费'}`;
}
/** Scope reference prices to known model IDs; never guess a custom endpoint's price. */
export function jobPrice(provider: JobProvider, modelId: string): string {
  if (provider === 'local') return '模型调用 0 元，无需 API Key。';
  if (provider === 'deepseek' && modelId === 'deepseek-flash')
    return 'Flash：每百万 tokens，输入（未命中缓存）1–2 元，输入（缓存命中）0.02–0.04 元，输出 4–8 元。区间对应空闲 / 高峰时段。';
  if (provider === 'deepseek' && modelId === 'deepseek-v4-pro')
    return 'V4 Pro：每百万 tokens，输入（未命中缓存）4.5–9 元，输入（缓存命中）0.15–0.30 元，输出 13.5–27 元。区间对应空闲 / 高峰时段。';
  if (
    provider === 'doubao' &&
    ['doubao-seed-2-1-lite', 'doubao-seed-2-1-lite-260915'].includes(modelId)
  )
    return 'Seed 2.1 Lite 常规文本调用：每百万 tokens，输入 0.80 元，缓存命中输入 0.16 元，输出 2.70 元。音频等能力另计费。';
  return '这个模型 / 接入点的单价需在平台控制台确认，按实际调用模型收费。';
}
export async function configureJobAgent(
  provider: Exclude<JobProvider, 'local'>,
  modelId: string,
  apiKey: string,
): Promise<void> {
  await serverStore.ready;
  const model = modelId.trim();
  if (!/^[a-zA-Z0-9._:/-]{1,200}$/.test(model))
    throw new Error('请输入平台提供的模型 ID 或接入点 ID，不能有空格。');
  const config = JOB_PLATFORM_CONFIG[provider];
  const existing = jobPlatformServer(provider);
  const key = apiKey.trim();
  if (!key && (!existing || !(await serverStore.getApiKey(existing.id))))
    throw new Error('请填写该平台的 API Key。没有账号可以先使用本地免费 AI。');
  const serverId =
    existing?.id ??
    serverStore.addServer({
      name: JOB_AGENTS.find(item => item.id === provider)!.name,
      url: config.url,
      serverType: config.serverType,
      nextJobProvider: provider,
      requestTimeoutMs: 90000,
    });
  if (key) {
    await serverStore.setApiKey(serverId, key);
    if ((await serverStore.getApiKey(serverId)) !== key)
      throw new Error('密钥没有保存成功，请重试。');
  }
  serverStore.updateServer(serverId, {
    url: config.url,
    serverType: config.serverType,
  });
  serverStore.addUserSelectedModel(serverId, model);
  const fullId = `${serverId}/${model}`;
  if (modelStore.activeModel?.id === fullId) await modelStore.releaseContext();
  await selectJobModel(fullId);
}
