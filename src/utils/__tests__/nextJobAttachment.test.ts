import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';

import {pickNextJobText} from '../nextJobAttachment';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  readFile: jest.fn(),
  stat: jest.fn(),
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: {plainText: 'public.plain-text'},
  errorCodes: {OPERATION_CANCELED: 'OPERATION_CANCELED'},
  isErrorWithCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error,
}));

const mockPick = pick as jest.Mock;
const mockRead = RNFS.readFile as jest.Mock;
const mockStat = RNFS.stat as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue([
    {name: '简历.txt', uri: 'file:///tmp/resume.txt', size: 32},
  ]);
  mockRead.mockResolvedValue('我做过真实的项目。');
});

it('reads the selected file and returns its real text as an unsent draft', async () => {
  expect(await pickNextJobText()).toContain('我做过真实的项目。');
  expect(mockRead).toHaveBeenCalledWith('file:///tmp/resume.txt', 'utf8');
});

it('checks file size before reading into memory', async () => {
  mockPick.mockResolvedValue([
    {name: '大文件.txt', uri: 'file:///tmp/large.txt', size: 300000},
  ]);
  await expect(pickNextJobText()).rejects.toThrow('256 KB');
  expect(mockRead).not.toHaveBeenCalled();
});

it('uses the local file size when picker metadata is missing', async () => {
  mockPick.mockResolvedValue([
    {name: '简历.txt', uri: 'file:///tmp/resume.txt', size: null},
  ]);
  mockStat.mockResolvedValue({size: '300000'});
  await expect(pickNextJobText()).rejects.toThrow('256 KB');
  expect(mockRead).not.toHaveBeenCalled();
});

it('returns quietly when the picker is canceled', async () => {
  mockPick.mockRejectedValue({code: 'OPERATION_CANCELED'});
  await expect(pickNextJobText()).resolves.toBeNull();
  expect(mockRead).not.toHaveBeenCalled();
});

it('surfaces a file-read failure instead of generating sample analysis', async () => {
  mockRead.mockRejectedValue(new Error('文件暂时无法读取'));
  await expect(pickNextJobText()).rejects.toThrow('文件暂时无法读取');
});
