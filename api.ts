rules_version = '2';
// Link Firestore security rules.
// All app access goes through the backend using the Firebase Admin SDK, which
// BYPASSES these rules. These rules exist to lock out everyone else: with the
// Admin SDK on the server, no client should ever touch Firestore directly.
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all direct client access. The trusted backend (Admin SDK) is the
    // only writer/reader. This replaces the open "test mode" default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
