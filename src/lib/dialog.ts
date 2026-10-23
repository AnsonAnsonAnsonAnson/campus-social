import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert that also works in the web preview, where React Native's Alert
 * does nothing. Same signature as Alert.alert.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
  } else if (actions.length === 1) {
    if (window.confirm(`${text}\n\n${actions[0].text}?`)) actions[0].onPress?.();
  } else {
    const menu = actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
    const pick = Number(window.prompt(`${text}\n\n${menu}\n\nType a number`, '1'));
    actions[pick - 1]?.onPress?.();
  }
}

/** Resolves true when the person confirms. */
export function confirmAsync(title: string, message: string, confirmText: string, destructive = false) {
  return new Promise<boolean>((resolve) =>
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
