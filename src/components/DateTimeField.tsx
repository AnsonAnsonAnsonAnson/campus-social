import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';

import { formatDay, formatTime } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

const TZ = 'Asia/Hong_Kong';

/** Date + time picker in Hong Kong time. Compact native picker on iOS, two-step dialog on Android. */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  const c = useColors();

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      timeZoneName: TZ,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          timeZoneName: TZ,
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(time);
          },
        });
      },
    });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
      <Text style={{ color: c.text, fontSize: 16 }}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="compact"
          minuteInterval={5}
          timeZoneName={TZ}
          minimumDate={minimumDate}
          accentColor={c.tint}
          onValueChange={(_, d) => onChange(d)}
        />
      ) : (
        <Pressable
          onPress={openAndroid}
          style={{ backgroundColor: c.fill, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: c.text, fontSize: 15 }}>
            {formatDay(value.toISOString())} · {formatTime(value.toISOString())}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
