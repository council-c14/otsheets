/* ============================================================================
   PASTE YOUR FIREBASE PROJECT CONFIG HERE.

   Where to get it:
   1. https://console.firebase.google.com -> create a project (free Spark
      plan is enough for this).
   2. Build > Authentication -> Get started -> enable "Email/Password".
   3. Build > Firestore Database -> Create database (production mode, any
      region close to Maldives, e.g. asia-south1).
   4. Project settings (gear icon) > General > "Your apps" > Add app > Web
      (</>) -> register an app (any nickname) -> it shows a firebaseConfig
      object. Copy those values into FIREBASE_CONFIG below.
   5. Firestore Database > Rules -> paste the contents of firestore.rules
      (in this repo) and Publish.
   6. Create the superadmin account: open this site, use "Create an
      account" with username "Admin" and password "Councilc14". Then in
      the Firebase console go to Firestore Database > Data, open the
      "users" collection, find the document whose "username" field is
      "Admin", and edit it: add a field role (string) = superadmin, and
      attendanceAccess (boolean) = true. Save. That one manual edit is the
      only time anyone is ever granted admin from outside the app.

   This config is NOT a secret -- Firebase's real security is the rules in
   firestore.rules, which run on Google's servers, not in this file. It is
   safe to commit. ========================================================= */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBZsK5vpGEnB7AWe4PI4zMcQA8aWimdeAo",
  authDomain: "otsheets.firebaseapp.com",
  projectId: "otsheets",
  storageBucket: "otsheets.firebasestorage.app",
  messagingSenderId: "1:321762462486:web:99dd81f8d73997e3485e37",
  appId: "1:321762462486:web:99dd81f8d73997e3485e37",
};

/** Firebase Auth needs an email-shaped identifier; usernames get this
    suffix appended under the hood so people never have to think about it. */
export const USERNAME_DOMAIN = "otsheets.local";
