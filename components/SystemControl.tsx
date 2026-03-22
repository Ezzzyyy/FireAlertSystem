import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { colors, spacing, borderRadius } from '../constants/theme';

interface SystemControlProps {
  isArmed: boolean;
  powerMode: 'ultra-low' | 'normal' | 'high-performance';
  uptime: string;
  onToggleArm: () => void;
  onSimulateAlarm: () => void;
  onResetSystem: () => void;
}

const SystemControl: React.FC<SystemControlProps> = ({
  isArmed,
  powerMode,
  uptime,
  onToggleArm,
  onSimulateAlarm,
  onResetSystem,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>System Control</Text>
      </View>

      <View style={styles.controlRow}>
        <View style={styles.controlItem}>
          <Text style={styles.label}>System Armed</Text>
          <Text style={styles.sublabel}>Monitoring active</Text>
        </View>
        <Switch
          value={isArmed}
          onValueChange={onToggleArm}
          trackColor={{ false: colors.surface, true: colors.success }}
          thumbColor={isArmed ? colors.textPrimary : colors.textSecondary}
        />
      </View>

      <TouchableOpacity style={styles.simulateButton} onPress={onSimulateAlarm}>
        <Text style={styles.simulateButtonText}>🔥 Simulate Fire</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.resetButton} onPress={onResetSystem}>
        <Text style={styles.resetButtonText}>↻ Reset System</Text>
      </TouchableOpacity>

      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Power Mode:</Text>
          <Text style={styles.statValue}>{powerMode.charAt(0).toUpperCase() + powerMode.slice(1)}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Uptime:</Text>
          <Text style={styles.statValue}>{uptime}h</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  controlItem: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sublabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  simulateButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  simulateButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  resetButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  statsContainer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
});

export default SystemControl;
