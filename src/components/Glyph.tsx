import Svg, { Path } from 'react-native-svg';

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Line icons from the Campus Social Redesign, drawn on a 24pt grid with round caps. */
const PATHS = {
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  calendarSync: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5L12 18l2.5-2.5',
  people: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M16 11a3 3 0 1 0 0-6M21.5 20c0-2.8-2-5.1-4.5-5.4',
  ticket: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  ticketCancel:
    'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM10 10l4 4M14 10l-4 4',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v7h14v-7',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  back: 'M15 6l-6 6 6 6',
  forward: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  checkCircle: 'M8 12.5l3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  closeCircle: 'M9 9l6 6M15 9l-6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  info: `${circle(12, 12, 9)}M12 11v5M12 8h.01`,
  alert: `${circle(12, 12, 9)}M12 7.5v5.5M12 16.5h.01`,
  warning: 'M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  globe: `${circle(12, 12, 9)}M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9`,
  ball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  workshop: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3M4 20h16',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  pencil: 'M4 20l4-1 10-10-3-3L5 16zM13.5 7.5l3 3',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  megaphone: 'M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  chat: 'M4 5h16v11H9l-5 4z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  school: 'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5',
  alarm: `${circle(12, 13, 7.5)}M12 9.5V13l2.5 1.5M5 4l-2 2M19 4l2 2`,
  cloudDone: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18zM9.5 13.5l2 2 3.5-4',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  filter: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  keypad: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  torch: 'M8 3h8l-1 6H9zM9 9l1 12h4l1-12M12 13v3',
  image: `M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z${circle(9, 10, 2)}M21 16l-5-5-9 9`,
  spotsDot: 'M12 12h.01M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
} as const;

export type GlyphName = keyof typeof PATHS;

/** Ionicons names used in the app → the design's own glyph. Anything not listed stays an Ionicon. */
export const IONICON_TO_GLYPH: Record<string, GlyphName> = {
  'calendar-outline': 'calendar',
  calendar: 'calendar',
  'calendar-clear-outline': 'calendar',
  'people-outline': 'people',
  people: 'people',
  'ticket-outline': 'ticket',
  ticket: 'ticket',
  'person-outline': 'person',
  person: 'person',
  'compass-outline': 'compass',
  search: 'search',
  'search-outline': 'search',
  'share-outline': 'share',
  'share-social-outline': 'share',
  'heart-outline': 'heart',
  'chevron-back': 'back',
  'arrow-back': 'back',
  'chevron-forward': 'forward',
  'chevron-down': 'down',
  checkmark: 'check',
  add: 'plus',
  close: 'close',
  'ellipsis-horizontal': 'more',
  'notifications-outline': 'bell',
  'location-outline': 'pin',
  'time-outline': 'clock',
  'hourglass-outline': 'clock',
  'checkmark-circle-outline': 'checkCircle',
  'checkmark-done-circle-outline': 'checkCircle',
  'close-circle-outline': 'closeCircle',
  'information-circle-outline': 'info',
  'alert-circle-outline': 'alert',
  'warning-outline': 'warning',
  'globe-outline': 'globe',
  'language-outline': 'globe',
  'basketball-outline': 'ball',
  'mail-outline': 'mail',
  'briefcase-outline': 'briefcase',
  'musical-notes-outline': 'music',
  'mic-outline': 'mic',
  'construct-outline': 'workshop',
  'sparkles-outline': 'sparkle',
  pencil: 'pencil',
  'pencil-outline': 'pencil',
  'create-outline': 'pencil',
  'qr-code-outline': 'qr',
  'scan-outline': 'scan',
  'megaphone-outline': 'megaphone',
  'copy-outline': 'copy',
  'download-outline': 'download',
  'cloud-upload-outline': 'upload',
  'link-outline': 'link',
  'chatbubble-outline': 'chat',
  'chatbubble-ellipses-outline': 'chat',
  'camera-outline': 'camera',
  'eye-outline': 'eye',
  'flag-outline': 'flag',
  'lock-closed-outline': 'lock',
  'school-outline': 'school',
  'alarm-outline': 'alarm',
  'cloud-done-outline': 'cloudDone',
  'refresh-outline': 'refresh',
  'options-outline': 'filter',
  'map-outline': 'map',
  'keypad-outline': 'keypad',
  'flashlight-outline': 'torch',
  'image-outline': 'image',
  'radio-button-on-outline': 'spotsDot',
};

export function Glyph({
  name,
  size = 20,
  color,
  strokeWidth,
  style,
}: {
  name: GlyphName;
  size?: number;
  color: string;
  /** Defaults to the design's weights: heavier for small glyphs, lighter for large ones. */
  strokeWidth?: number;
  style?: object;
}) {
  const width = strokeWidth ?? (size <= 16 ? 2.2 : size <= 22 ? 1.9 : size <= 30 ? 1.8 : 1.2);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} pointerEvents="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The filled heart (saved) from the design. */
export function FilledHeart({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path d={PATHS.heart} fill={color} stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

/** The verified badge: a filled rosette with a white tick. */
export function VerifiedBadge({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Path
        fill={color}
        d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"
      />
      <Path d="M8 12.2l2.7 2.6L16 9.5" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
