import { Platform, Share } from 'react-native';

/**
 * Hands a CSV to the person. On the web it downloads as a file; on a phone it
 * opens the share sheet with the text, which Mail, Notes and WhatsApp accept
 * and Excel opens once saved as .csv.
 */
export async function shareCsv(filename: string, csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const r = await Share.share({ title: filename, message: csv });
  return r.action === Share.sharedAction;
}
