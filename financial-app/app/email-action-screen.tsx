"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ActionCodeOperation, applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { firebaseServices } from "@/lib/firebase-client";
import { emailActionError, parseEmailAction, verifyEmailLink, type EmailAction } from "@/lib/email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailActionScreen({ link, brand }: { link: string; brand: ReactNode }) {
  const [action, setAction] = useState<EmailAction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    let active = true;
    try {
      const parsed = parseEmailAction(link); setAction(parsed);
      if (parsed.mode === "resetPassword") {
        setBusy(true);
        void verifyPasswordResetCode(firebaseServices().auth, parsed.code).then(value => { if (active) setEmail(value); }).catch(error => { if (active) setError(emailActionError(error)); }).finally(() => { if (active) setBusy(false); });
      }
    } catch (error) { setError(emailActionError(error)); }
    return () => { active = false; };
  }, [link]);
  const complete = async (event?: FormEvent) => {
    event?.preventDefault(); if (!action || busy || success) return;
    setBusy(true); setError("");
    try {
      const { auth } = firebaseServices();
      if (action.mode === "verifyEmail") await verifyEmailLink(auth, link);
      else if (action.mode === "resetPassword") {
        if (password.length < 12) throw new Error("Choose a password with at least 12 characters.");
        if (password !== confirmation) throw new Error("The passwords do not match.");
        await confirmPasswordReset(auth, action.code, password); setPassword(""); setConfirmation("");
      } else {
        const checked = await checkActionCode(auth, action.code);
        if (checked.operation !== ActionCodeOperation.RECOVER_EMAIL) throw new Error("This link cannot restore an email address.");
        await applyActionCode(auth, action.code);
      }
      window.history.replaceState(null, "", action.continuePath);
      setSuccess(true);
    } catch (error) { setError(emailActionError(error)); }
    finally { setBusy(false); }
  };
  const heading = success ? action?.mode === "resetPassword" ? "Password updated" : action?.mode === "recoverEmail" ? "Email restored" : "Email verified" : action?.mode === "resetPassword" ? "Choose a new password" : action?.mode === "recoverEmail" ? "Restore your email" : "Verify your email";
  return <main className="grid min-h-dvh place-items-center bg-[#edf3f0] px-4 py-8"><section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-lg">{brand}<h1 className="mt-8 text-2xl font-bold text-[#18332c]">{heading}</h1><p className="mt-4 text-sm leading-6 text-[#6e7e79]">{success ? "The email action has completed. Return to Review My Asset to continue." : action?.mode === "resetPassword" ? "Set a new password for your Review My Asset account." : action?.mode === "recoverEmail" ? "Restore the email address associated with this account." : "Confirm the link from your inbox to verify your Review My Asset account."}</p>{error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {!success && action?.mode === "resetPassword" && email && <form onSubmit={complete} className="mt-6 grid gap-4"><p className="break-words text-sm font-semibold text-[#29463e]">{email}</p><div className="grid gap-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="confirm-new-password">Confirm new password</Label><Input id="confirm-new-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div><Button disabled={busy} type="submit" className="min-h-12 bg-[#328771]">{busy ? "Updating…" : "Update password"}</Button></form>}
    {!success && action && action.mode !== "resetPassword" && <Button disabled={busy} onClick={() => void complete()} className="mt-6 min-h-12 w-full bg-[#328771]">{busy ? "Checking…" : action.mode === "recoverEmail" ? "Restore email address" : "Verify email"}</Button>}
    {busy && <p role="status" className="mt-4 text-sm text-[#328771]">Checking securely with Firebase…</p>}
    <Button disabled={busy} variant={success ? "default" : "outline"} onClick={() => window.location.assign(action?.continuePath ?? "/")} className="mt-4 min-h-12 w-full">{success ? "Continue to Review My Asset" : "Return to the app"}</Button>
    </section></main>;
}
