# Privacy Review – Cloud Sync & Accounts

Date: 2025-02-14

## Overview

The GermanVerbMaster web client now supports optional authenticated sessions
using Firebase Authentication (email/password, Google, Microsoft) and stores
learner-specific data in Cloud Firestore.

## Data Inventory

| Category | Data | Retention | Notes |
| --- | --- | --- | --- |
| Identity | Firebase UID, email, display name, profile photo | Stored in `users/{uid}` | Created on first sign-in. |
| Access control | Role (`standard` or `admin`) | Stored in `userRoles/{uid}` | Defaults to `standard`. Manual admin elevation documented below. |
| Practice history | Practice settings, progress summaries, recent answers | Stored in `users/{uid}/preferences`, `progress`, `history` | Updated on each change with merge + last-write-wins semantics. |
| Preferences | Theme selection, language toggle | Stored alongside practice settings | Synced across devices for the authenticated learner. |

All Firestore writes include client timestamps and are idempotent so data can be
replayed after offline usage.

## GDPR & User Rights

* **Access / Portability** – Learners can download their synced data from the
  Firestore console or via future API endpoints (tracked in backlog).
* **Rectification** – Users may edit their display name and practice
  preferences inside the product; changes propagate immediately to Firestore.
* **Erasure** – A maintainer can delete all documents under `users/{uid}` and
  `userRoles/{uid}` using the Firebase Console or scripted admin tooling. A
  follow-up automation task will expose a self-service delete endpoint.
* **Consent** – Accounts are optional; the app continues to operate with local
  storage when the learner opts out of signing in.

## Security Controls

* Firebase Auth enforces OAuth2 flows for Google and Microsoft sign-in.
* Role-based access is implemented in the client; admin-only views are hidden
  from non-admins and guarded by Firestore role documents.
* Sensitive Firestore paths (`userRoles`, `users`) require authentication. Rule
  updates will be applied in the Firebase project prior to deployment.

## Outstanding Tasks

1. Add automated deletion endpoint for GDPR requests (tracked in backlog).
2. Harden Firestore security rules to enforce role checks server-side.
3. Document support playbook for manual deletion in the internal runbook.

This review satisfies the preliminary privacy requirement for the new cloud
sync functionality.
