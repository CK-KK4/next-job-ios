import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';

import {formatNextJobText, MAX_ATTACHMENT_BYTES} from './nextJobText';

export const pickNextJobText = async (): Promise<string | null> => {
  try {
    const [file] = await pick({
      type: [types.plainText],
      allowMultiSelection: false,
      mode: 'import',
    });
    if (!file) {
      return null;
    }
    const size = file.size ?? Number((await RNFS.stat(file.uri)).size);
    if (!Number.isFinite(size) || size > MAX_ATTACHMENT_BYTES) {
      throw new Error('请上传小于 256 KB 的文字文件。');
    }
    const text = await RNFS.readFile(file.uri, 'utf8');
    return formatNextJobText(file.name ?? '附件.txt', text);
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return null;
    }
    throw error;
  }
};
