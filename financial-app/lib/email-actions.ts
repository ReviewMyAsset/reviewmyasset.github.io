import { ActionCodeOperation, applyActionCode, checkActionCode, reload, type Auth } from "firebase/auth";

const hosts = new Set(["review-my-asset-uttam-2026.firebaseapp.com", "review-my-asset-uttam-2026.web.app", "review-my-asset-app.nadgoudauttam.chatgpt.site"]);
export type EmailAction = { mode: "verifyEmail" | "resetPassword" | "recoverEmail"; code: string; continuePath: string };
export function parseEmailAction(link: string): EmailAction {
  let url: URL;
  try { url = new URL(link.trim()); } catch { throw new Error("Copy the complete link from your email and try again."); }
  if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.username || url.password || url.port) throw new Error("Use the verification or recovery link sent by Review My Asset.");
  const mode = url.searchParams.get("mode");
  if (mode !== "verifyEmail" && mode !== "resetPassword" && mode !== "recoverEmail") throw new Error("This email link does not contain a supported action. Request a new email from the app.");
  const code = url.searchParams.get("oobCode") ?? "";
  if (!/^[A-Za-z0-9_-]{10,2048}$/.test(code)) throw new Error("This email link is missing its verification code. Copy the complete link or request a new email.");
  let continuePath = "/";
  try {
    const destination = new URL(url.searchParams.get("continueUrl") ?? "https://review-my-asset-uttam-2026.web.app/");
    if (destination.origin === "https://review-my-asset-uttam-2026.web.app" && destination.pathname === "/") {
      const invite = destination.searchParams.get("invite");
      if (invite && /^[a-f0-9]{64}$/.test(invite)) continuePath = `/?invite=${invite}`;
    }
  } catch { /* Invalid return URLs are ignored. */ }
  // The Firebase SDK uses this app's pinned configuration. A missing or edited
  // apiKey in an email URL cannot select a different project or bypass validation.
  return { mode, code, continuePath };
}
export async function verifyEmailLink(auth: Auth, link: string, expectedEmail?: string) {
  const action = parseEmailAction(link);
  if (action.mode !== "verifyEmail") throw new Error("This is not an email verification link. Request a new verification email.");
  const checked = await checkActionCode(auth, action.code);
  if (checked.operation !== ActionCodeOperation.VERIFY_EMAIL) throw new Error("This code cannot verify an email address.");
  const email = checked.data.email;
  if (expectedEmail && email?.toLowerCase() !== expectedEmail.toLowerCase()) throw new Error("This link belongs to a different email. Sign in using the email that received it.");
  await applyActionCode(auth, action.code);
  if (auth.currentUser && auth.currentUser.email?.toLowerCase() === email?.toLowerCase()) { await reload(auth.currentUser); await auth.currentUser.getIdToken(true); }
  return { email, continuePath: action.continuePath };
}
export function emailActionError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") return "This link has expired or has already been used. Return to the app to check your verification status or request a new email.";
  if (code === "auth/network-request-failed") return "Connection interrupted. Reconnect and try again.";
  if (code === "auth/user-disabled") return "This account is disabled. Contact your adviser.";
  return error instanceof Error && !code ? error.message : "The email action could not be completed. Please request a new link and try again.";
}
