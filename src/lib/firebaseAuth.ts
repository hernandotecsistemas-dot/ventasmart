import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory access token cache (never stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleAuthListener(onSignedOut?: () => void) {
  return onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      cachedAccessToken = null;
      if (onSignedOut) onSignedOut();
    }
  });
}

export async function signInWithGooglePopup(): Promise<{
  firebaseUser: FirebaseUser;
  accessToken: string;
}> {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('No se pudo obtener el token de acceso de Google.');
  }
  cachedAccessToken = credential.accessToken;
  return {
    firebaseUser: result.user,
    accessToken: cachedAccessToken,
  };
}

export function getCachedGoogleToken(): string | null {
  return cachedAccessToken;
}

export async function googleSignOut(): Promise<void> {
  cachedAccessToken = null;
  try {
    await auth.signOut();
  } catch {
    // Ignore if already signed out
  }
}
