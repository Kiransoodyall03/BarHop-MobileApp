# BarHop Creator WebApp - Master Context

## Overview
The **BarHop Creator WebApp** is a B2B SaaS platform designed for venue owners (bars, clubs, restaurants, etc.) to create and manage their presence on the BarHop mobile app. The core mechanic relies on a "Tinder-style" venue card that users can swipe on. The platform allows venue owners to create these cards, track marketing analytics (impressions, swipe rates, match rates), and will eventually support VIP reservations, staff payouts, and detailed revenue analytics.

The stack utilizes:
*   **Frontend**: React.js (Bootstrapped with Create React App), React Router, Context API.
*   **Backend / DB**: Firebase (Authentication, Firestore, Cloud Functions).
*   **Media Storage**: Cloudinary (for high-quality image uploads).
*   **External APIs**: Foursquare Places API (Proxied via Firebase Cloud Functions).

---

## File & Directory Structure

### Configuration & Root
*   `package.json` / `package-lock.json`: Dependencies including React, Firebase, Cloudinary SDKs, and React Router.
*   `firebase.json` / `.firebaserc`: Firebase hosting, functions, and project configuration.
*   `src/index.js` & `src/App.js`: Application entry points. `App.js` manages the core routing (Public vs. Private Routes) and wraps the application in Auth and Error Context providers.
*   `src/types.ts`: Core domain models (TypeScript types/interfaces) that define the Firestore schema for `User`, `Venue`, `Reservation`, `StaffMember`, and `RevenueAnalytics`.

### Pages (`src/pages/`)
*   `Landing.js`: The public-facing marketing page.
*   `Register.js` / `Login.js`: Authentication screens for venue owners to sign up or log in.
*   `Dashboard.js`: The central hub for authenticated users. It displays the active venue's status, analytics summaries (impressions, swipe rates), and provides links to edit or preview their venue card.
*   `CreateVenue.js`: A multi-step form where owners input their venue's details (name, category, hours, social links) and upload images.
*   `Preview.js`: Displays a live preview of the venue card exactly as it will appear in the consumer app.
*   `Settings.js`: The Settings & Compliance Hub (`/settings`, deep-linkable via `?tab=`). Four vertical tabs: General (account + Paystack verification), Business Profile (the regulatory-anchor form), Billing & Subscriptions (`Billing.js`), and Legal & Compliance — ECTA Section 43 platform disclosures (from `data/platform.js`), POPIA/PAIA Information Officer display with PAIA-manual and data-subject-deletion actions, ARB alcohol-advertising card (15% warning-height rule) with a conditional FPB X18 warning for `adult entertainment` venues, and a FICA verification badge (`businessProfile.ficaVerified`, webhook-owned).
*   `Reservations.js`: The `/reservations` VIP guestlist page (Pro+). Tonight's reservations list + add-reservation form via `venueService` (`getTonightReservations`/`createReservation`). Locked tiers see a blurred static sample guestlist behind the `FeatureLocked` upsell overlay.
*   `PricingDashboard.js`: The `/plans` pricing page. For unsubscribed venues (`subscriptionTier` of `trial`/absent): 3-tier matrix (Starter R497 / Pro R1,497 / Enterprise R3,497 per month) with an Annual/Monthly billing toggle (defaults to Annual, "2 Months Free" badge) and Pro visually center-staged; selecting a plan calls the `initializePaystackSubscription` Cloud Function and redirects to Paystack checkout. For subscribed venues (`starter`/`pro`/`enterprise`): an Active Subscription view (green Active badge, unlocked-features recap, "Manage Billing" mailto until the Paystack customer portal ships) with an Upgrade flow that re-opens the matrix — current tier disabled as "Current Plan", lower tiers disabled as "Downgrade" (not self-serve; Paystack doesn't prorate), higher tiers as "Upgrade Now".

### Components (`src/components/`)
*   `DashboardLayout.js`: Wrapper component for authenticated routes, rendering the `Sidebar` and dynamic content.
*   `Sidebar.js`: Primary navigation menu for the dashboard.
*   `Navbar.js`: Top navigation component.
*   `VenueCard.js` / `VenueCardPreview.js`: UI components responsible for rendering the Tinder-style venue card with images, descriptions, and interactive elements.
*   `ErrorBoundary.js`: React boundary to catch runtime errors and display a fallback UI.
*   `PricingMatrix.js`: The reusable 3-tier checkout matrix (annual-default toggle, center-staged Pro, `initializePaystackSubscription` checkout) shared by PricingDashboard and Billing. Plan display data lives in `src/data/plans.js`.
*   `BusinessProfile.js`: Settings form for the regulatory anchor — Public Venue Information vs Corporate & Financial Identity (FICA) sections, strict SARS VAT (`^4\d{9}$`) and CIPC (`^\d{4}/\d{6}/\d{2}$`) validation, mandatory POPIA Information Officer fields; saves via `userService.updateBusinessProfile` and refreshes AuthContext. Reads legacy wizard field names as fallbacks.
*   `Billing.js`: Self-serve billing portal (Settings tab). Current-plan card with feature recap; live subscription details fetched via `getBillingOverview` (status badge incl. non-renewing/attention, next payment date + amount, card on file); "Update Payment Card" opens Paystack's hosted manage page (`getSubscriptionManageLink`); "Cancel Subscription" runs a confirmation modal → `cancelPaystackSubscription` (no renewal; access until period end); Billing History lists recent Paystack charges; plus a context-pre-filled support mailto escape hatch and the upgrade `PricingMatrix`.
*   `FeatureLocked.js`: Tier-gating upsell wrapper. Locked features stay visible: `overlay` variant blurs the children behind a padlock card with an "Upgrade Now" → `/plans` CTA; `compact` variant keeps children hoverable but captures clicks (used for the Premium Card Styling grid).

### Hooks (`src/hooks/`)
*   `useSubscription.js`: Central feature-gating logic. Exports `TIER_ORDER`/`TIER_LABELS`/`hasTierAccess` and the `useSubscription(subscriptionTier)` hook returning cumulative boolean flags (`canPublish`/`basicAnalytics`/`digitalGuestlist` at Starter; `customBorders`/`videoUploads`/`vipReservations`/`whatsappAutomation` at Pro; `staffPayouts`/`advancedAnalytics`/`posSync` at Enterprise). Client-side UX gating only — server-side enforcement (Firestore rules) is a pending follow-up.

### Contexts (`src/context/`)
*   `AuthContext.js`: Manages global user authentication state and session data.
*   `ErrorContext.js`: Manages global error notifications and toast alerts.

### Firebase Services (`src/firebase/`)
*   `config.js`: Firebase app initialization and provider setup.
*   `authService.js`: Wrappers for Firebase Auth (Email/Password, Google OAuth).
*   `userService.js`: Handles user profile management within Firestore (`createUserDocument`, `saveBusinessProfile`, `updateBusinessProfile`, `getUserDocument` — which surfaces `paystackCustomerCode`/`paystackSubaccountId` for billing UI).

### Data (`src/data/`)
*   `plans.js`: Display data for the 3-tier subscription matrix (plan codes/amounts stay server-side).
*   `platform.js`: `SUPPORT_EMAIL` + `PLATFORM_LEGAL` (ECTA Section 43 disclosure fields, PAIA manual URL). **All values are placeholders that must be replaced with BarHop's real registered details before launch.**
*   `venueService.js`: Core CRUD operations for `venues`. Also contains placeholder logic for B2B operations like VIP reservations and staff management. Includes Cloudinary integration (`uploadVenueImages`) for venue photos.
*   `analyticsService.js`: Fetches and aggregates daily marketing logs (swipes, impressions) from Firestore for dashboard visualizations.
*   `subscriptionService.js`: `initializeSubscription({ tier, interval, venueId })` — thin wrapper over the `initializePaystackSubscription` callable; the plan code and billing email are resolved server-side.

### Cloud Functions (`functions/`)
*   `index.js`: Contains backend serverless functions (Firebase Functions v2, Node 24, `PAYSTACK_SECRET_KEY` via Secret Manager):
    *   `createPaystackSubaccount` (callable): KYB/ownership verification — creates a Paystack Subaccount for payouts and marks the owner `VERIFIED` (validation is synchronous).
    *   `initializePaystackSubscription` (callable): starts a subscription checkout. Client sends `{ tier, interval, venueId }`; the server resolves the Paystack plan code from a tier×interval allowlist (Starter/Pro/Enterprise × monthly/annual), verifies venue ownership, and returns the `authorization_url`. Metadata carries `ownerId`, `venueId`, `tierLevel`, `interval`.
    *   `paystackWebhookHandler` (HTTP): HMAC-SHA512-verified webhook. `charge.success`/`subscription.create` set the owner's `subscriptionTier` and publish the metadata venue (`published: true`); metadata-less renewals mirror the tier to all owner venues without touching `published`; `subscription.disable` drops back to `trial`.

---

## Current Completed Features

1.  **Authentication & Security**:
    *   Email/Password and Google sign-in methods.
    *   Route protection via `PrivateRoute` and `PublicRoute` wrappers.
2.  **Venue Creation Pipeline**:
    *   Comprehensive multi-step form capturing core details, social links, and weekly hours.
    *   Image uploading via Cloudinary rather than Firebase Storage for optimized media delivery.
    *   Integration with Foursquare Places API (via a secure Firebase Cloud Function) to streamline onboarding/lookup.
3.  **Dashboard & Analytics**:
    *   Static Sidebar layout wrapped over dynamic routing.
    *   Integration with Firestore to retrieve and aggregate daily swipe analytics (Impressions, Right/Left Swipes, Match Rates).
    *   Empty states prompting users to create a venue if none exists.
4.  **Tinder-Style Venue Card Previews**:
    *   UI components accurately mirroring the mobile app experience so owners can preview how their business is represented.
5.  **State & Error Management**:
    *   Robust React Context providers for handling session state and globally bubbling up UI errors/toasts.

