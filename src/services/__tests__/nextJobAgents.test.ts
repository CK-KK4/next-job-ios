import {
  configureJobAgent,
  jobPrice,
  selectedJobProvider,
} from '../nextJobAgents';
import {serverStore} from '../../store/ServerStore';
import {modelStore} from '../../store/ModelStore';
import {selectJobModel} from '../nextJobModel';

jest.mock('../../store/ServerStore', () => ({
  serverStore: {
    ready: Promise.resolve(),
    servers: [],
    nextJobModelId: 'local',
    addServer: jest.fn(() => 'new-server'),
    updateServer: jest.fn(),
    getApiKey: jest.fn(),
    setApiKey: jest.fn(),
    addUserSelectedModel: jest.fn(),
  },
}));
jest.mock('../../store/ModelStore', () => ({
  modelStore: {
    remoteModels: [],
    activeModel: null,
    releaseContext: jest.fn(),
  },
}));
jest.mock('../nextJobModel', () => ({selectJobModel: jest.fn()}));
beforeEach(() => {
  jest.clearAllMocks();
  serverStore.servers = [];
  serverStore.nextJobModelId = 'local';
});

it('rejects a paid provider without credentials before creating a server', async () => {
  await expect(
    configureJobAgent('deepseek', 'deepseek-flash', ''),
  ).rejects.toThrow('API Key');
  expect(serverStore.addServer).not.toHaveBeenCalled();
  expect(selectJobModel).not.toHaveBeenCalled();
});
it('registers the official Ark v3 endpoint and exact requested model', async () => {
  (serverStore.getApiKey as jest.Mock).mockResolvedValue('example-test-key');
  await configureJobAgent(
    'doubao',
    'doubao-seed-2-1-lite-260915',
    'example-test-key',
  );
  expect(serverStore.addServer).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'https://ark.cn-beijing.volces.com/api/v3',
      serverType: 'Doubao',
    }),
  );
  expect(serverStore.setApiKey).toHaveBeenCalledWith(
    'new-server',
    'example-test-key',
  );
  expect(
    (serverStore.addServer as jest.Mock).mock.calls[0][0],
  ).not.toHaveProperty('apiKey');
  expect(selectJobModel).toHaveBeenCalledWith(
    'new-server/doubao-seed-2-1-lite-260915',
  );
});
it('does not activate a provider when secure storage fails', async () => {
  (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
  await expect(
    configureJobAgent('deepseek', 'deepseek-flash', 'example-test-key'),
  ).rejects.toThrow('保存');
  expect(selectJobModel).not.toHaveBeenCalled();
});
it('never applies a preset price to an arbitrary endpoint', () => {
  expect(jobPrice('doubao', 'ep-custom')).toContain('控制台确认');
  expect(jobPrice('deepseek', 'other-model')).toContain('控制台确认');
  expect(jobPrice('local', '')).toContain('0 元');
});
it('selects local without a configured remote account', () => {
  expect(modelStore.remoteModels).toEqual([]);
  expect(selectedJobProvider()).toBe('local');
});
