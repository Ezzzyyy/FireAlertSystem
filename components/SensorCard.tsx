import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, borderRadius, spacing } from '../constants/theme';

interface SensorCardProps {
  title: string;
  value: number | string;
  unit: string;
  icon: 'smoke' | 'temperature' | 'fire';
  status: 'normal' | 'warning' | 'critical';
  module?: string;
}

const SensorCard: React.FC<SensorCardProps> = ({ title, value, unit, icon, status, module }) => {
  const statusColor =
    status === 'critical' ? colors.danger : status === 'warning' ? colors.warning : colors.normal;

  return (
    <View style={[styles.card, { borderColor: statusColor }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.indicator, { backgroundColor: statusColor }]} />
      </View>

      {icon === 'smoke' && (
        <Text style={styles.value}>
          {value}
          <Text style={styles.unit}>{unit}</Text>
        </Text>
      )}

      {icon === 'fire' && (
        <Text style={styles.value}>
          {value}
          <Text style={styles.unit}>{unit}</Text>
        </Text>
      )}

      {icon === 'temperature' && (
        <View style={styles.temperatureDisplay}>
          <Text style={styles.temperatureValue}>{value}</Text>
          <View style={styles.temperatureBars}>
            {[0, 1, 2, 3].map((i) => (
              <View
                testID={`temp-bar-${i}`}
                style={[
                  styles.tempBar,
                  {
                    height: 20 + i * 10,
                    backgroundColor: statusColor,
                    opacity: 0.5 + i * 0.125,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.module}>{module}</Text>
        <Text style={[styles.status, { color: statusColor }]}>
          {status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  value: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  unit: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  temperatureDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginVertical: spacing.md,
  },
  temperatureValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  temperatureBars: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-end',
    height: 60,
  },
  tempBar: {
    width: 6,
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  module: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  status: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default SensorCard;
