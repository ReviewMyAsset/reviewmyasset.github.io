"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { ADVISER_EMAIL, CLIENT_APP_URL, firebaseServices, friendlyError } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthScreen({ brand, inviteId }: { brand: ReactNode; inviteId: string }) {
  const [create, setCreate] = useState(Boolean(inviteId));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { auth } = firebaseServices();
      const cleanEmail = email.trim().toLowerCase();
      if (create) {
        if (!inviteId && cleanEmail !== ADVISER_EMAIL) throw new Error("Client accounts need an invitation from Anubha.");
        if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await sendEmailVerification(result.user, { url: CLIENT_APP_URL + (inviteId ? `/?invite=${inviteId}` : "/") });
      } else await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (error) { setError(friendlyError(error)); }
    finally { setBusy(false); setPassword(""); }
  };
  const resetPassword = async () => {
    setError(""); setMessage("");
    if (!email.trim()) { setError("Enter your email above first."); return; }
    setBusy(true);
    try { await sendPasswordResetEmail(firebaseServices().auth, email.trim().toLowerCase()); setMessage("If this email has an account, a password reset link will arrive shortly."); }
    catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") setMessage("If this email has an account, a password reset link will arrive shortly."); else setError(friendlyError(error)); }
    finally { setBusy(false); }
  };
  return <main className="min-h-dvh bg-[#edf3f0] px-4 py-6 sm:grid sm:place-items-center">
    <section className="mx-auto w-full max-w-md rounded-[30px] border border-white bg-white p-6 shadow-[0_30px_80px_rgba(24,51,44,.13)] sm:p-9">
      {brand}<p className="mt-10 text-sm font-bold uppercase tracking-widest text-[#328771]">Welcome</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#18332c]">{create ? inviteId ? "Accept your invitation" : "Set up adviser account" : "Sign in to your account"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6e7e79]">{create ? "Choose a password, then verify your email to continue." : "Your financial picture, securely saved across devices."}</p>
      <form onSubmit={submit} className="mt-7 grid gap-5">
        <div className="grid gap-2"><Label htmlFor="account-email">Email address</Label><Input id="account-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" className="h-12 rounded-xl" /></div>
        <div className="grid gap-2"><Label htmlFor="account-password">Password</Label><Input id="account-password" type="password" required minLength={create ? 12 : undefined} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} autoComplete={create ? "new-password" : "current-password"} className="h-12 rounded-xl" />{create && <p className="text-xs text-[#6e7e79]">At least 12 characters. A longer passphrase works well.</p>}</div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded-xl bg-[#eaf4f0] p-3 text-sm text-[#29463e]">{message}</p>}
        <Button disabled={busy} type="submit" className="h-12 rounded-xl bg-[#328771] font-bold hover:bg-[#286f5e]">{busy ? "Please wait…" : create ? "Create account" : "Sign in"}</Button>
      </form>
      <div className="mt-5 grid gap-2">{!create && <Button disabled={busy} variant="ghost" onClick={resetPassword}>Forgot password?</Button>}
      <Button disabled={busy} variant="ghost" onClick={() => { setCreate(!create); setError(""); setMessage(""); if (!inviteId && !create) setEmail(ADVISER_EMAIL); }}>{create ? "Already have an account? Sign in" : inviteId ? "Accept invitation" : "Set up adviser account"}</Button></div>
      <p className="mt-7 border-t pt-5 text-center text-xs leading-5 text-[#6e7e79]">Client access is by invitation from Anubha. Your email must be verified before financial information can be accessed.</p>
    </section>
  </main>;
}
