# Security Spec for SkillsFix Enrollment

## 1. Data Invariants
- An enrollment record must belong to the authenticated user (`userId == request.auth.uid`).
- Once an enrollment is marked as `complete`, certain fields should be rigid (immutable).
- Document IDs should be alphanumeric.
- All strings must have size limits.

## 2. The "Dirty Dozen" Payloads (Unauthorized Attempts)
1. **Identity Spoofing**: Attempt to create an enrollment with a `userId` that doesn't match the auth token.
2. **Access Breach**: Attempt to read someone else's enrollment record.
3. **Shadow Update**: Attempt to inject an `isAdmin: true` field into the enrollment document.
4. **ID Poisoning**: Attempt to use a 2KB binary string as a document ID.
5. **Timestamp Spoofing**: Attempt to set `createdAt` to a date in the past from the client.
6. **State Shortcut**: Attempt to set `current_step` to `COMPLETED` without providing mandatory data.
7. **Size Attack**: Attempt to send a 500KB string in the `full_name` field.
8. **Unauthorized List**: Attempt to query all enrollments without a filter on `userId`.
9. **Mutation Gaps**: Attempt to update `email` after it has been verified.
10. **Type Injection**: Attempt to send an array for the `full_name` field.
11. **Relational Wipe**: Attempt to delete an enrollment record without being the owner.
12. **Blanket Read**: Attempt to 'get' a document without being signed in.

## 3. Test Runner
(Tests would be implemented in `firestore.rules.test.ts`)
