import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const ADVISER_EMAIL = "anubhanadgouda@gmail.com";
export const DATABASE_ID = "financial-profiles";
export const CLIENT_APP_URL = "https://review-my-asset-uttam-2026.web.app";
// Firebase web configuration is public. Authorization is enforced by Auth and rules.
export function firebaseServices() {
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: "AIzaSyDrztxMmxPdYNOQGqvkIZXl4-d7lJAtAgM",
    authDomain: "review-my-asset-uttam-2026.firebaseapp.com",
    projectId: "review-my-asset-uttam-2026",
    appId: "1:453214098858:web:473767a82cf1a9251447d3",
    messagingSenderId: "453214098858",
  });
  return { auth: getAuth(app), db: getFirestore(app, DATABASE_ID) };
}

export function friendlyError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") return "That email or password does not match.";
  if (code === "auth/email-already-in-use") return "An account already uses this email. Sign in or reset your password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a little and try again.";
  if (code === "auth/network-request-failed" || code === "unavailable") return "Connection interrupted. Please try again when you are online.";
  if (code === "permission-denied") return "Access could not be confirmed. Your invitation may be expired, revoked, or for a different email.";
  if (code === "auth/weak-password") return "Choose a stronger password with at least 12 characters.";
  return error instanceof Error && !code ? error.message : "This action could not be completed. Please try again.";
}
