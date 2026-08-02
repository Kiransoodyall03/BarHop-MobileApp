import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../components/Avatar';
import ProUpsellModal from '../components/ProUpsellModal';
import { useAuth } from '../context/AuthContext';
import { useSquad } from '../context/SquadContext';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { SquadLimitError } from '../services/squadService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { MainTabsParamList } from '../navigation/MainTabs';

type Props = BottomTabScreenProps<MainTabsParamList, 'Squad'>;

const PIN_LENGTH = 6;

export default function SquadScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const { squad, squadId, mySquads, restoring, isHost, create, join, switchTo } = useSquad();
  const { upgradeCtaLabel } = useConsumerSubscription();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [joining, setJoining] = useState(false); // "Join with PIN" input revealed
  const [pinInput, setPinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Free-tier gate copy — set when a SquadLimitError aborts an operation.
  const [upsell, setUpsell] = useState<{ title: string; message: string } | null>(null);

  function showLimitUpsell(limitError: SquadLimitError) {
    setUpsell(
      limitError.code === 'squad-full'
        ? {
            title: 'Squad Full!',
            message: `${limitError.message} Upgrade for bigger nights out.`,
          }
        : {
            title: 'Max Squads Reached!',
            message: `${limitError.message} Leave one, or upgrade for more crews.`,
          }
    );
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await create();
    } catch (err) {
      if (err instanceof SquadLimitError) {
        showLimitUpsell(err);
        return;
      }
      console.warn('[SquadScreen] create failed:', err);
      setError('Could not start a squad. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (busy || pinInput.trim().length < PIN_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await join(pinInput);
      setPinInput('');
      setJoining(false);
    } catch (err) {
      if (err instanceof SquadLimitError) {
        showLimitUpsell(err);
        return;
      }
      setError(
        err instanceof Error && (err.message.includes('PIN') || err.message.includes('ended'))
          ? err.message
          : 'Could not join that squad. Check the PIN and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (restoring) {
    return (
      <View style={[styles.centered, { paddingBottom: tabBarHeight }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const otherSquads = mySquads.filter((s) => s.id !== squadId);

  // ── State 2: in a squad — the lobby ────────────────────────────────────────
  if (squad) {
    const memberIds = squad.members;
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: insets.top + 28,
          paddingBottom: tabBarHeight + 24,
          paddingHorizontal: 24,
        }}
      >
        <Text style={styles.lobbyLabel}>SQUAD PIN</Text>
        <Text style={styles.pin}>{squad.pin}</Text>
        <Text style={styles.lobbyHint}>Share this PIN with your crew to let them in.</Text>

        <View style={styles.memberCard}>
          <Text style={styles.memberHeading}>
            In the squad · {memberIds.length} {memberIds.length === 1 ? 'member' : 'members'}
          </Text>
          {memberIds.map((uid) => {
            const name = squad.memberNames?.[uid] ?? 'Mystery guest';
            const initials = name
              .split(' ')
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            return (
              <View key={uid} style={styles.memberRow}>
                <Avatar
                  photoURL={squad.memberPhotos?.[uid]}
                  initials={initials}
                  seed={uid}
                  size={40}
                />
                <Text style={styles.memberName} numberOfLines={1}>
                  {name}
                  {uid === user?.uid ? ' (you)' : ''}
                </Text>
                {uid === squad.hostId && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostBadgeText}>HOST</Text>
                  </View>
                )}
              </View>
            );
          })}
          {memberIds.length === 1 && (
            <Text style={styles.waitingText}>Waiting for friends to join…</Text>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.dim]}
          onPress={() => navigation.navigate('Discover')}
        >
          <Ionicons name="flame" size={20} color={colors.onPrimary} />
          <Text style={styles.primaryButtonText}>Start Swiping</Text>
        </Pressable>

        {/* The user's OTHER squads. Without this they're unreachable: joining a
            new squad silently replaces the active one, and the old PIN is the
            only way back. */}
        {otherSquads.length > 0 && (
          <View style={styles.otherSquads}>
            <Text style={styles.otherSquadsHeading}>Your other squads</Text>
            {otherSquads.map((other) => (
              <Pressable
                key={other.id}
                style={({ pressed }) => [styles.squadRow, pressed && styles.dim]}
                onPress={() => switchTo(other.id)}
              >
                <Text style={styles.squadRowEmoji}>🍻</Text>
                <View style={styles.squadRowBody}>
                  <Text style={styles.squadRowPin}>{other.pin}</Text>
                  <Text style={styles.squadRowMeta}>
                    {other.members.length}{' '}
                    {other.members.length === 1 ? 'member' : 'members'}
                  </Text>
                </View>
                <Text style={styles.squadRowAction}>Swipe with</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.soloRow, pressed && styles.dim]}
              onPress={() => switchTo(null)}
            >
              <Text style={styles.squadRowEmoji}>🕺</Text>
              <Text style={styles.soloRowText}>Swipe solo instead</Text>
            </Pressable>
          </View>
        )}

        <LeaveButton styles={styles} isHost={isHost} />
      </ScrollView>
    );
  }

  // ── State 1: no squad ──────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.noSquadContent,
        { paddingTop: insets.top + 48, paddingBottom: tabBarHeight + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heroEmoji}>🍻</Text>
      <Text style={styles.heroTitle}>{otherSquads.length > 0 ? 'Your squads' : 'Squad up'}</Text>
      <Text style={styles.heroSubtitle}>
        {otherSquads.length > 0
          ? "You're swiping solo right now. Pick a squad to swipe together, or start another."
          : "Better nights are decided together. Start a squad, share the PIN, and when everyone swipes right on the same spot — it's a match."}
      </Text>

      {/* Reachable even while solo — belonging to a squad and swiping with it
          are separate choices, and this screen is where you change the latter. */}
      {otherSquads.length > 0 && (
        <View style={styles.otherSquads}>
          {otherSquads.map((other) => (
            <Pressable
              key={other.id}
              style={({ pressed }) => [styles.squadRow, pressed && styles.dim]}
              onPress={() => switchTo(other.id)}
            >
              <Text style={styles.squadRowEmoji}>🍻</Text>
              <View style={styles.squadRowBody}>
                <Text style={styles.squadRowPin}>{other.pin}</Text>
                <Text style={styles.squadRowMeta}>
                  {other.members.length} {other.members.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
              <Text style={styles.squadRowAction}>Swipe with</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.dim]}
        onPress={handleCreate}
        disabled={busy}
      >
        {busy && !joining ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <Ionicons name="add-circle-outline" size={20} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>Start a Squad</Text>
          </>
        )}
      </Pressable>

      {joining ? (
        <View style={styles.joinBox}>
          <TextInput
            style={styles.pinInput}
            value={pinInput}
            onChangeText={(text) => setPinInput(text.toUpperCase())}
            placeholder="ENTER PIN"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={PIN_LENGTH}
            autoFocus
          />
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || busy || pinInput.length < PIN_LENGTH) && styles.dim,
            ]}
            onPress={handleJoin}
            disabled={busy || pinInput.length < PIN_LENGTH}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Join Squad</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.dim]}
          onPress={() => {
            setJoining(true);
            setError(null);
          }}
        >
          <Ionicons name="key-outline" size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Join with PIN</Text>
        </Pressable>
      )}

      <ProUpsellModal
        visible={!!upsell}
        title={upsell?.title}
        message={upsell?.message}
        ctaLabel={upgradeCtaLabel}
        source="squad"
        onClose={() => setUpsell(null)}
      />
    </ScrollView>
  );
}

function LeaveButton({
  styles,
  isHost,
}: {
  styles: ReturnType<typeof createStyles>;
  isHost: boolean;
}) {
  const { leave } = useSquad();
  const label = isHost ? 'End Squad' : 'Leave Squad';

  function confirmLeave() {
    Alert.alert(
      `${label}?`,
      isHost
        ? 'Ending the squad kicks everyone out of the session.'
        : 'You can rejoin anytime with the PIN.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => leave() },
      ]
    );
  }

  return (
    <Pressable style={({ pressed }) => [styles.leaveButton, pressed && styles.dim]} onPress={confirmLeave}>
      <Text style={styles.leaveButtonText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    otherSquads: { width: '100%', marginTop: 22 },
    otherSquadsHeading: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    squadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    squadRowEmoji: { fontSize: 20 },
    squadRowBody: { flex: 1 },
    squadRowPin: { color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
    squadRowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    squadRowAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    soloRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 14,
      padding: 14,
    },
    soloRowText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },

    // State 1
    noSquadContent: { paddingHorizontal: 28, alignItems: 'stretch' },
    heroEmoji: { fontSize: 56, textAlign: 'center' },
    heroTitle: {
      color: colors.text,
      fontSize: 32,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 12,
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 36,
    },
    error: { color: colors.danger, fontSize: 14, textAlign: 'center', marginBottom: 14 },
    primaryButton: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
    secondaryButton: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.surface,
      borderColor: colors.primary,
      borderWidth: 1.5,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    secondaryButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.6 },
    joinBox: { marginTop: 14 },
    pinInput: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 16,
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: 10,
      textAlign: 'center',
    },

    // State 2 — lobby
    lobbyLabel: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 2,
      textAlign: 'center',
    },
    pin: {
      color: colors.text,
      fontSize: 56,
      fontWeight: '800',
      letterSpacing: 12,
      textAlign: 'center',
      marginTop: 6,
    },
    lobbyHint: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 28,
    },
    memberCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      marginBottom: 24,
    },
    memberHeading: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 14,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    memberName: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
    hostBadge: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    hostBadgeText: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    waitingText: { color: colors.textFaint, fontSize: 14, marginTop: 10, fontStyle: 'italic' },
    leaveButton: { alignItems: 'center', marginTop: 16, paddingVertical: 12 },
    leaveButtonText: { color: colors.nope, fontSize: 15, fontWeight: '700' },
  });
