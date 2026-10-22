import * as ImagePicker from 'expo-image-picker';

import { api } from './api';

/** Let the user pick a photo, then upload it. Returns the public URL, or null if cancelled. */
export async function pickAndUploadImage(aspect: [number, number]): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  return api.uploadImage(result.assets[0].uri);
}
