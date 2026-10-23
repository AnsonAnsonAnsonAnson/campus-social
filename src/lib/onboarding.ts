import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './api';

const key = (userId: string) => `onboarded.${userId}`;

/** True for someone who just signed in for the first time on this device and hasn't set up their profile. */
export async function needsOnboarding() {
  const [user, profile] = await Promise.all([api.getUser(), api.getProfile()]);
  if (!user || !profile || profile.college) return false;
  try {
    return !(await AsyncStorage.getItem(key(user.id)));
  } catch {
    return false;
  }
}

export async function markOnboarded() {
  const user = await api.getUser();
  if (user) await AsyncStorage.setItem(key(user.id), '1').catch(() => undefined);
}
