# Review My Asset

Mobile financial profiles using React, TypeScript, Firebase Authentication, Firestore Enterprise native mode, and Firebase Hosting. The private Sites preview uses the same React component.

## Firebase project

- Project: `review-my-asset-uttam-2026`
- Database: `financial-profiles`, `asia-south1` (Mumbai)
- Client app: https://review-my-asset-uttam-2026.web.app
- Adviser: verified Firebase Auth email `anubhanadgouda@gmail.com`

The web SDK configuration is public and intentionally tracked. No passwords, Admin SDK credentials, or service-account keys belong in this repository.

## First use

Anubha chooses **Set up adviser account**, selects her password, and verifies her email. Adviser access is based on the verified Auth token, never a user-controlled role field.

Anubha creates an invitation for a client's email and shares the link directly. Invitations expire after six days. The recipient registers, verifies the invited email, and atomically accepts the invitation to create a financial profile. Revoking the invitation removes that client's app data access. The adviser can restore an accepted invitation without losing saved records. All invitation links target Firebase Hosting, including links copied in the private Sites preview. Private notes are stored separately and cannot be read by clients.

There is no client signup entry point without an invitation. Firebase Auth can still accept an identity created directly through its API, but Firestore denies financial access without an accepted, matching invitation. Enforcing account creation itself with an Auth blocking function is a separate enhancement.

Prototype passwords and financial data are not migrated. Old local demo storage is removed when the app opens. Firebase manages login credentials; financial data is kept in memory and saved to Firestore.

## Client journeys

The original intro animation and seven-step Quick Profile remain. Clients can start directly with **Explore My Financial Profile**, choose **Complete My Master File** after Quick Profile, or open **Continue full setup** from their dashboard. **Save & Finish Later** now saves and returns to the dashboard.

The Financial Master File has eight sections: about you, family, assets, liabilities, insurance, cash flow, goals, and final review. Every section supports drafts and confirmation. Saved status determines progress. Final review becomes outdated when any client information changes. Clients may confirm an empty record section when it does not apply. Up to 12 records per financial section and 10 family members are supported.

Assets include current values and ownership shares; cash and fixed income are grouped in the snapshot, property includes vehicles, and business/other assets have a separate total. Debt and insurance are excluded from the asset-allocation chart; debt is subtracted for net worth. Monthly cash flow converts annual income and annual premiums and accounts for saved loan repayments. Saved draft records contribute to estimates while confirmation records that the client has checked the section. Goal savings are not added again to net worth. Quick estimates prefill record editors and are replaced by saved detailed records; original Quick Profile category answers are retained as historical context.

Asset lists can be imported using the downloadable CSV template. Import replaces only the local draft, awaits review and explicit saving, and validates headers, categories, values and limits. Saved profiles can be downloaded as CSV without private adviser notes. File exports escape formula-like values. Account recovery remains available from the sign-in screen.

The adviser sees saved client details, family, record-level assets and liabilities, cover/premiums/nominees/renewals, monthly cash flow, goals and completion status. Client previews are read only. Search by name or email works on desktop and mobile.

## Email verification and recovery

Firebase email templates should use `https://review-my-asset-uttam-2026.web.app/auth/action` as `notification.sendEmail.callbackUri`. The custom handler supports verification, password reset, and email recovery using the pinned Firebase SDK configuration. It does not rely on the apiKey query parameter, which was empty in the reported email. The corresponding Firebase action code is always validated by the backend; opening a page or pressing the status button never sets emailVerified directly.

Existing email links can be pasted into **Email link not opening?** on the verification screen. Verification is accepted only when Firebase reports VERIFY_EMAIL and the code's email matches the signed-in recipient. External return URLs are ignored, valid invitation state is retained, and codes are never written to storage or logs. A successful action removes its code from the address bar.

Test with `npx -y firebase-tools@latest emulators:exec --only auth --project demo-review-my-asset "node --test tests/email-actions.test.mjs"`. Tests cover a genuine code with an empty apiKey, a different recipient, replay, forged codes, reset-code misuse, invitation return state, and URL scoping.

## Data and saving

- `clients/{uid}`: immutable identity and invitation reference, profile, portfolio, onboarding progress, server timestamp, and optimistic revision.
- `clientFamilies/{uid}`: bounded family list saved atomically with the parent revision; separated to fit Firestore rule expression limits.
- `invitations/{64hex}`: private, email-bound pending/accepted/revoked invitation.
- `clients/{uid}/sections/{section}`: confirmed/draft markers and private records, with three chunks of up to four entries for financial sections to stay within rule evaluation limits. All chunks share the parent revision and save time.
- `adviserNotes/{uid}`: adviser-only note text and server timestamp.

Updates check the saved revision before writing. Forms await confirmed saves before advancing or signing out. Failed saves retain the draft. Background connection failures show a warning without discarding edits.

Realtime updates are disabled on this Enterprise database. Lists use Enterprise Pipeline operations; document reads and transactions use Core operations. Profiles refresh on focus, after saves, and every 30 seconds while visible. Unchanged revisions reuse in-memory details after a fresh authorized parent read; this avoids repeatedly downloading the full file. Conflicts refresh the latest saved version while preserving the active form draft.

## Validation

Use the committed pnpm lockfile. Current Firebase emulators require Java 21 or newer.

```sh
pnpm install
pnpm run build:firebase
pnpm run build
npx -y firebase-tools@latest emulators:exec --only firestore,auth --project demo-review-my-asset "node --test tests/firebase-rules.test.mjs"
node --test tests/rendered-html.test.mjs tests/ui-components.test.mjs tests/financial-file.test.mjs
pnpm exec wrangler types --config dist/server/wrangler.json worker-configuration.d.ts
pnpm exec tsc --noEmit
```

Tests cover verification, invitations, expiry, revocation, client isolation, private notes, family privacy, schema constraints, privilege escalation, stale revisions, all onboarding sections, password recovery, data across sessions, and adviser Pipeline queries. Additional tests cover every Master File section, 12-record writes and chunk removal, actual application persistence methods, legacy estimates, ownership shares, cash-flow calculations, CSV parsing, progress/review state, and all editor/summary rendering. Emulator identities are fictional and emulator emails are never delivered.

## Deployment

```sh
pnpm run build:firebase
npx -y firebase-tools@latest deploy --only firestore,auth,hosting --project review-my-asset-uttam-2026
```

Use the Sites source workflow to publish the private preview. Firebase Hosting is the independent client entry point. Custom domains are deferred.

The rules are a tested prototype, not a guarantee against every possible attack. Review them and test the phone/browser journey before broader client rollout.
