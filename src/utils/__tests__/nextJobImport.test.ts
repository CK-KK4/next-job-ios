import {Platform} from 'react-native';
import {pick} from '@react-native-documents/picker';
import {launchImageLibrary} from 'react-native-image-picker';
import NativeNextJob from '../../specs/NativeNextJob';
import {pickJobDocument, pickJobScreenshot} from '../nextJobImport';

jest.mock('../../specs/NativeNextJob', () => ({
  __esModule: true,
  default: {readDocument: jest.fn(), recognizeImage: jest.fn()},
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: {
    plainText: 'public.plain-text',
    pdf: 'com.adobe.pdf',
    docx: 'org.openxmlformats.wordprocessingml.document',
  },
  errorCodes: {OPERATION_CANCELED: 'OPERATION_CANCELED'},
  isErrorWithCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error,
}));
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}));

const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
});
afterAll(() => {
  Platform.OS = originalOS;
});

it('imports a DOCX on iPhone through native extraction instead of the old text-only fallback', async () => {
  (pick as jest.Mock).mockResolvedValue([
    {uri: 'file:///resume.docx', name: '简历.docx'},
  ]);
  (NativeNextJob!.readDocument as jest.Mock).mockResolvedValue('真实简历正文');
  expect(await pickJobDocument()).toEqual([
    expect.objectContaining({
      name: '简历.docx',
      text: '真实简历正文',
      image: false,
    }),
  ]);
  expect(NativeNextJob!.readDocument).toHaveBeenCalledWith(
    'file:///resume.docx',
    '简历.docx',
  );
});
it('extracts screenshot text on iPhone', async () => {
  (launchImageLibrary as jest.Mock).mockResolvedValue({
    assets: [{uri: 'file:///screen.png', fileName: '截图.png'}],
  });
  (NativeNextJob!.recognizeImage as jest.Mock).mockResolvedValue('岗位要求');
  expect(await pickJobScreenshot()).toEqual([
    expect.objectContaining({text: '岗位要求', image: true}),
  ]);
});
it('treats canceled file selection as no attachment', async () => {
  (pick as jest.Mock).mockRejectedValue({code: 'OPERATION_CANCELED'});
  expect(await pickJobDocument()).toBeNull();
  expect(NativeNextJob!.readDocument).not.toHaveBeenCalled();
});
