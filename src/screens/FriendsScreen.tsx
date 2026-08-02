import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../components/Avatar';
import AddFriendModal from '../components/AddFriendModal';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../context/FriendsContext';
import { updateProfile } from '../services/profileService';
import { clearSharedLikes } from '../services/friendService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { friendUidOf, type FriendshipWithId } from '../types';
import type { FriendsStackParamList } from '../navigation/MainTabs';

type Props = NativeStackScreenProps<FriendsStackParamList, 'FriendsList'>;

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function FriendsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, profile } = useAuth();
  const {
    friends,
    pendingIncoming,
    pendingOutgoing,
    loading,
    matchesWith,
    accept,
    remove,
    pendingInviteCode,
    clearPendingInvite,
  } = useFriends();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [addVisible, setAddVisible] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sharingOn = profile?.socialDiscoveryEnabled === true;

  // An invite link opens the add sheet pre-filled rather than adding silently —
  // accepting a friend should always be a deliberate tap.
  useEffect(() => {
    if (pendingInviteCode) setAddVisible(true);
  }, [pendingInviteCode]);

  async function handleAccept(pairId: string) {
    setBusyId(pairId);
    try {
      await accept(pairId);
    } catch (error) {
      console.warn('[FriendsScreen] accept failed:', error);
      Alert.alert('Could not accept', 'Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  }

  function handleRemove(friendship: FriendshipWithId, name: string) {
    Alert.alert(`Remove ${name}?`, 'You’ll both stop seeing each other’s matches.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(friendship.id);
          } catch (error) {
            console.warn('[FriendsScreen] remove failed:', error);
          }
        },
      },
    ]);
  }

  async function handleToggleSharing() {
    if (!user) return;
    const next = !sharingOn;
    try {
      await updateProfile(user.uid, { socialDiscoveryEnabled: next });
      // Turning it off retracts what was already shared, rather than just
      // stopping new writes — otherwise past likes stay visible forever.
      if (!next) await clearSharedLikes(user.uid);
    } catch (error) {
      console.warn('[FriendsScreen] sharing toggle failed:', error);
      Alert.alert('Could not update', 'Check your connection and try again.');
    }
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: tabBarHeight + 24,
        }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Friends</Text>
          <Pressable style={styles.addButton} onPress={() => setAddVisible(true)}>
            <Ionicons name="person-add" size={16} color={colors.onPrimary} />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {/* Opt-in gate. Matching is off until the user explicitly turns it on —
            sharing what you swiped is a choice, not a default. */}
        <Pressable style={styles.shareCard} onPress={handleToggleSharing}>
          <Ionicons
            name={sharingOn ? 'shield-checkmark' : 'shield-outline'}
            size={22}
            color={sharingOn ? colors.like : colors.textMuted}
          />
          <View style={styles.shareBody}>
            <Text style={styles.shareTitle}>Match with friends</Text>
            <Text style={styles.shareSubtitle}>
              {sharingOn
                ? 'Your solo likes are shared with friends so you can match.'
                : 'Turn on to compare your solo likes with friends.'}
            </Text>
          </View>
          <View style={[styles.toggle, sharingOn && styles.toggleOn]}>
            <View style={[styles.knob, sharingOn && styles.knobOn]} />
          </View>
        </Pressable>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {pendingIncoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Requests</Text>
                {pendingIncoming.map((friendship) => {
                  const otherUid = friendUidOf(friendship, user?.uid ?? '');
                  const name = friendship.profiles?.[otherUid]?.displayName ?? 'BarHop user';
                  return (
                    <View key={friendship.id} style={styles.row}>
                      <Avatar
                        photoURL={friendship.profiles?.[otherUid]?.photoURL}
                        initials={initialsFor(name)}
                        seed={otherUid}
                        size={44}
                      />
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      {busyId === friendship.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Pressable
                            style={styles.acceptButton}
                            onPress={() => handleAccept(friendship.id)}
                          >
                            <Text style={styles.acceptText}>Accept</Text>
                          </Pressable>
                          <Pressable onPress={() => remove(friendship.id)} hitSlop={8}>
                            <Ionicons name="close" size={20} color={colors.textFaint} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {friends.length > 0 ? `${friends.length} friends` : 'Your friends'}
              </Text>

              {friends.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No friends yet</Text>
                  <Text style={styles.emptyText}>
                    Share your code and you’ll start matching on the places you both
                    swipe right on.
                  </Text>
                </View>
              ) : (
                friends.map((friendship) => {
                  const otherUid = friendUidOf(friendship, user?.uid ?? '');
                  const name = friendship.profiles?.[otherUid]?.displayName ?? 'BarHop user';
                  const matchCount = matchesWith(otherUid).length;
                  return (
                    <Pressable
                      key={friendship.id}
                      style={styles.row}
                      onPress={() =>
                        navigation.navigate('FriendMatches', {
                          friendUid: otherUid,
                          friendName: name,
                        })
                      }
                      onLongPress={() => handleRemove(friendship, name)}
                    >
                      <Avatar
                        photoURL={friendship.profiles?.[otherUid]?.photoURL}
                        initials={initialsFor(name)}
                        seed={otherUid}
                        size={44}
                      />
                      <View style={styles.rowBody}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.matchCount}>
                          {!sharingOn
                            ? 'Matching off'
                            : matchCount > 0
                              ? `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                              : 'No matches yet'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                    </Pressable>
                  );
                })
              )}
            </View>

            {pendingOutgoing.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Sent</Text>
                {pendingOutgoing.map((friendship) => {
                  const otherUid = friendUidOf(friendship, user?.uid ?? '');
                  return (
                    <View key={friendship.id} style={styles.row}>
                      <Avatar initials="?" seed={otherUid} size={44} />
                      <Text style={styles.pendingName} numberOfLines={1}>
                        Waiting to be accepted
                      </Text>
                      <Pressable onPress={() => remove(friendship.id)} hitSlop={8}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AddFriendModal
        visible={addVisible}
        initialCode={pendingInviteCode}
        onClose={() => {
          setAddVisible(false);
          clearPendingInvite();
        }}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    title: { color: colors.text, fontSize: 28, fontWeight: '800' },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },

    shareCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      marginHorizontal: 20,
      padding: 16,
    },
    shareBody: { flex: 1 },
    shareTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    shareSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    toggle: {
      width: 44,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 2,
      justifyContent: 'center',
    },
    toggleOn: { backgroundColor: colors.chipActiveBg, borderColor: colors.like },
    knob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.textFaint,
    },
    knobOn: { backgroundColor: colors.like, alignSelf: 'flex-end' },

    section: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      marginHorizontal: 20,
      marginTop: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sectionLabel: {
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    rowBody: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
    pendingName: { color: colors.textMuted, fontSize: 14, flex: 1 },
    matchCount: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    acceptButton: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    acceptText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
    cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

    empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 6,
    },
  });
