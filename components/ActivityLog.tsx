import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing } from '../constants/theme';

interface ActivityLog {
  id: string;
  time: string;
  message: string;
}

interface ActivityLogProps {
  activities: ActivityLog[];
}

const ActivityLogComponent: React.FC<ActivityLogProps> = ({ activities }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity Log</Text>
        <Text style={styles.time}>{new Date().toLocaleTimeString()}</Text>
      </View>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No activity recorded</Text>
          </View>
        ) : (
          activities.map((activity, idx) => (
            <View testID={`log-activity-${idx}`} style={styles.activityItem}>
              <View style={styles.timelineIndicator} />
              <View style={styles.content}>
                <Text style={styles.timestamp}>{activity.time}</Text>
                <Text style={styles.message}>{activity.message}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  time: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  scrollView: {
    maxHeight: 200,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 20,
  },
  activityItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  timelineIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.normal,
    marginTop: spacing.xs,
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  timestamp: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: 20,
    color: colors.textPrimary,
    lineHeight: 18,
  },
});

export default ActivityLogComponent;
