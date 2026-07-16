// DEV-ONLY sample venue seeding, triggered from Profile → Developer (visible
// only in __DEV__ builds). Docs are created with ownerId = the signed-in user
// so Firestore's owner-create rule passes, published: true so they enter the
// deck, and placeId prefixed 'sample-' so removal can find them again.
//
// The five venues are deliberately varied to exercise every card feature:
// multi-image cycling, the video slide, overnight & weekend-only hours for
// the Open/Closed badge, a media-less venue (🍸 fallback + "Hours TBD"), and
// empty contact/description states in the details sheet.

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { DailyHours, OperatingHours, SocialLinks, Venue } from '../types';

const SAMPLE_PREFIX = 'sample-';

const img = (id: string) => `https://images.unsplash.com/${id}?w=800&q=70`;
// Google-hosted ExoPlayer test clip — reliable, hotlink-friendly.
const SAMPLE_VIDEO = 'https://storage.googleapis.com/exoplayer-test-media-0/BigBuckBunny_320x180.mp4';

const open = (openTime: string, closeTime: string): DailyHours => ({
  open: openTime,
  close: closeTime,
  closed: false,
});
const closed: DailyHours = { open: '', close: '', closed: true };
const tbd: DailyHours = { open: '', close: '', closed: false };

const week = (
  overrides: Partial<OperatingHours>,
  base: DailyHours
): OperatingHours => ({
  monday: base,
  tuesday: base,
  wednesday: base,
  thursday: base,
  friday: base,
  saturday: base,
  sunday: base,
  ...overrides,
});

const noSocials: SocialLinks = { facebook: '', instagram: '', tiktok: '' };

type SampleVenue = Omit<Venue, 'createdAt' | 'updatedAt'>;

const SAMPLE_VENUES: SampleVenue[] = [
  {
    placeId: `${SAMPLE_PREFIX}neon-jungle`,
    ownerId: '', // filled at seed time
    name: 'Neon Jungle',
    address: '77 Juta Street, Braamfontein, Johannesburg',
    latitude: -26.1929,
    longitude: 28.0305,
    musicGenres: ['techno', 'house', 'amapiano'],
    dressCode: 'smart-casual',
    coverCharge: 100,
    currentBusyness: 'at-capacity',
    description:
      'Three floors of bass, neon and beautiful chaos in the heart of Braam.\n\nResident DJs Thursday through Saturday, with a rooftop chill zone when your ears need a breather. Dress code: effort.',
    category: 'club',
    categories: ['club', 'live music', 'rooftop'],
    tagline: 'Where the wild nights are.',
    images: [
      img('photo-1566417713940-fe7c737a9ef2'),
      img('photo-1543007630-9710e4a00a20'),
      img('photo-1516450360452-9312f5e86fc7'),
    ],
    video: SAMPLE_VIDEO, // tests the final video slide
    hours: week(
      {
        thursday: open('20:00', '02:00'),
        friday: open('21:00', '04:00'), // overnight — tests past-midnight badge
        saturday: open('21:00', '04:00'),
      },
      closed
    ),
    offers: [],
    phone: '+27 11 555 0134',
    website: 'https://neonjungle.example.co.za',
    socialLinks: { facebook: 'neonjunglejhb', instagram: '@neonjunglejhb', tiktok: '@neonjunglejhb' },
    useCustomCard: false,
    published: true,
    subscriptionTier: 'trial',
    cardBorderStyle: 'neon-glow',
    verified: false,
  },
  {
    placeId: `${SAMPLE_PREFIX}velvet-room`,
    ownerId: '',
    name: 'The Velvet Room',
    address: '12 Kloof Street, Gardens, Cape Town',
    latitude: -33.9307,
    longitude: 18.4113,
    musicGenres: ['jazz', 'rnb'],
    dressCode: 'formal',
    coverCharge: 50,
    currentBusyness: 'lively',
    description:
      'An intimate cocktail lounge hidden behind an unmarked door. Low light, lower tempo, and a menu of house-infused spirits you will not find anywhere else.\n\nOur mixologists run a six-week rotating menu — ask for the off-menu Midnight Velvet if you know, you know. Booth reservations recommended after 21:00 on weekends.\n\nLive jazz every Wednesday.',
    category: 'cocktail bar',
    categories: ['cocktail bar', 'lounge'],
    tagline: 'Slow nights, strong pours.',
    images: [
      img('photo-1514933651103-005eec06c04b'),
      img('photo-1470337458703-46ad1756a187'),
      img('photo-1575444758702-4a6b9222336e'),
    ],
    video: null,
    hours: week(
      {
        tuesday: open('17:00', '01:00'),
        wednesday: open('17:00', '01:00'),
        thursday: open('17:00', '01:00'),
        friday: open('17:00', '02:00'),
        saturday: open('17:00', '02:00'),
      },
      closed
    ),
    offers: [],
    phone: '+27 21 555 0177',
    website: 'velvetroom.example.co.za', // no protocol — tests URL normalizing
    socialLinks: { ...noSocials, instagram: '@velvetroomct' },
    useCustomCard: false,
    published: true,
    subscriptionTier: 'trial',
    verified: false,
  },
  {
    placeId: `${SAMPLE_PREFIX}barrel-and-vine`,
    ownerId: '',
    name: 'Barrel & Vine',
    address: '4th Avenue, Parkhurst, Johannesburg',
    latitude: -26.142,
    longitude: 28.0176,
    musicGenres: ['jazz'],
    dressCode: 'casual',
    coverCharge: 0,
    currentBusyness: 'quiet',
    description:
      'Neighbourhood wine bar with 40+ South African wines by the glass, charcuterie boards, and a courtyard made for golden hour.',
    category: 'wine bar',
    categories: ['wine bar'],
    tagline: 'Uncorked & unhurried.',
    images: [img('photo-1510812431401-41d2bd2722f3'), img('photo-1414235077428-338989a2e8c0')],
    video: null,
    hours: week({ monday: closed }, open('12:00', '22:00')),
    offers: [],
    phone: '+27 11 555 0102',
    website: 'https://barrelandvine.example.co.za',
    socialLinks: { ...noSocials, facebook: 'barrelvineparkhurst' },
    useCustomCard: false,
    published: true,
    subscriptionTier: 'trial',
    verified: false,
  },
  {
    placeId: `${SAMPLE_PREFIX}rooftop-54`,
    ownerId: '',
    name: 'Rooftop 54',
    address: '54 Long Street, City Centre, Cape Town',
    latitude: -33.9224,
    longitude: 18.4194,
    musicGenres: ['house', 'hip-hop'],
    dressCode: 'smart-casual',
    coverCharge: 150,
    // no currentBusyness — tests the hidden Vibe Check state
    description:
      'Sundowners with a 270° view of Table Mountain and the city bowl. Weekend-only — we go big or we stay closed.',
    category: 'rooftop',
    categories: ['rooftop', 'bar'],
    tagline: 'Closer to the stars.',
    images: [
      img('photo-1559339352-11d035aa65de'),
      img('photo-1541532713592-79a0317b6b77'),
      img('photo-1533929736458-ca588d08c8be'),
    ],
    video: null,
    hours: week(
      {
        friday: open('16:00', '02:00'), // overnight
        saturday: open('14:00', '02:00'),
        sunday: open('14:00', '22:00'),
      },
      closed // Mon–Thu closed — tests the Closed badge on weekdays
    ),
    offers: [],
    phone: '+27 21 555 0154',
    website: 'https://rooftop54.example.co.za',
    socialLinks: { ...noSocials, instagram: '@rooftop54ct', tiktok: '@rooftop54' },
    useCustomCard: false,
    published: true,
    subscriptionTier: 'trial',
    verified: false,
  },
  {
    // Deliberately sparse: no images (🍸 fallback), hours TBD, no contact —
    // exercises every empty state on the card and in the details sheet.
    placeId: `${SAMPLE_PREFIX}the-dive`,
    ownerId: '',
    name: 'The Dive',
    address: 'Basement, 3 Anderson Street, Marshalltown, Johannesburg',
    latitude: -26.2085,
    longitude: 28.04,
    description: '',
    category: 'pub',
    categories: ['pub'],
    tagline: '',
    images: [],
    video: null,
    hours: week({}, tbd),
    offers: [],
    phone: '',
    website: '',
    socialLinks: noSocials,
    useCustomCard: false,
    published: true,
    subscriptionTier: 'trial',
    verified: false,
  },
];

/** Seeds the sample venues as the signed-in user. Returns how many were written. */
export async function seedSampleVenues(ownerId: string): Promise<number> {
  const batch = writeBatch(db);
  for (const sample of SAMPLE_VENUES) {
    batch.set(doc(collection(db, 'venues')), {
      ...sample,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return SAMPLE_VENUES.length;
}

/**
 * Deletes this user's sample venues (matched by the placeId prefix). Any
 * analytics docs written under them are orphaned — harmless dev residue.
 * Returns how many venues were removed.
 */
export async function removeSampleVenues(ownerId: string): Promise<number> {
  const snapshot = await getDocs(
    query(collection(db, 'venues'), where('ownerId', '==', ownerId))
  );
  const sampleDocs = snapshot.docs.filter((d) =>
    String(d.data().placeId ?? '').startsWith(SAMPLE_PREFIX)
  );
  if (sampleDocs.length === 0) return 0;

  const batch = writeBatch(db);
  sampleDocs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return sampleDocs.length;
}
