"use client";
import { useEffect, useState, type FormEvent } from "react";
import { createInvitation, readInvitations, readNote, readFamily, readClient, revokeInvitation, restoreInvitation, saveNote, type Invitation } from "@/lib/client-records";
import type { AppUser, FamilyMember } from "./review-my-asset-app";
import { FinancialFileSummary } from "./financial-master-file";
import { friendlyError, CLIENT_APP_URL } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function InvitationPanel() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => { try { setInvitations(await readInvitations()); } catch (error) { setError(friendlyError(error)); } };
  useEffect(() => { if (open) void load(); }, [open]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const id = await createInvitation(email, name); setLink(`${CLIENT_APP_URL}/?invite=${id}`); setEmail(""); setName(""); await load(); }
    catch (error) { setError(friendlyError(error)); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { if (!window.confirm("Revoke this invitation and remove the client’s data access? Their saved records will be kept.")) return; setBusy(true); setError(""); try { await revokeInvitation(id); await load(); if (link.endsWith(id)) setLink(""); } catch (error) { setError(friendlyError(error)); } finally { setBusy(false); } };
  const restore = async (id: string) => { setBusy(true); setError(""); try { await restoreInvitation(id); await load(); setMessage("Client access restored."); } catch (error) { setError(friendlyError(error)); } finally { setBusy(false); } };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setMessage("Invitation link copied. Share it directly with the intended client."); } catch { setMessage("Select and copy the link shown below."); setLink(value); } };
  return <section className="mt-7 rounded-2xl border border-[#dfe9e5] bg-white p-5 text-left">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-[#29463e]">Client invitations</h2><p className="mt-1 text-sm text-[#70807a]">Only the invited, verified email can open a financial profile. Links open the client app.</p></div><Button variant="outline" onClick={() => setOpen(!open)}>{open ? "Close" : "Invite a client"}</Button></div>
    {open && <div className="mt-6"><form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="grid gap-2"><Label htmlFor="invite-name">Client name</Label><Input id="invite-name" value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></div><div className="grid gap-2"><Label htmlFor="invite-email">Client email</Label><Input id="invite-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></div><Button type="submit" disabled={busy} className="bg-[#328771]">{busy ? "Please wait…" : "Create invitation"}</Button></form>
      <p className="mt-3 text-xs text-[#70807a]">New invitations expire after six days. Revoke an invitation to remove that client’s app access.</p>
      {link && <div className="mt-4 grid gap-2"><Label htmlFor="invitation-link">Share this link with your client</Label><Input id="invitation-link" value={link} readOnly onFocus={event => event.target.select()} /><Button variant="outline" onClick={() => void copy(link)}>Copy invitation link</Button></div>}
      {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-[#328771]">{message}</p>}
      <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-bold text-[#29463e]">Existing invitations</h3><Button disabled={busy} variant="ghost" onClick={() => void load()}>Refresh</Button></div>
      <div className="mt-3 grid gap-3">{invitations.map(invite => <article key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f5f8f7] p-4"><div className="min-w-0"><p className="break-words text-sm font-bold text-[#29463e]">{invite.clientName}</p><p className="break-all text-xs text-[#70807a]">{invite.email}</p><p className="mt-1 text-xs text-[#70807a]">{invite.status === "pending" && invite.expiresAt.toMillis() < Date.now() ? "Expired" : invite.status} · {invite.acceptedUid ? "Accepted " + (invite.acceptedAt?.toDate().toLocaleDateString("en-IN") ?? "") : "Expires " + invite.expiresAt.toDate().toLocaleDateString("en-IN")}</p></div><div className="flex gap-2">{invite.status === "pending" && invite.expiresAt.toMillis() > Date.now() && <Button disabled={busy} variant="outline" size="sm" onClick={() => void copy(`${CLIENT_APP_URL}/?invite=${invite.id}`)}>Copy link</Button>}{invite.status === "revoked" && invite.acceptedUid && <Button disabled={busy} variant="outline" size="sm" onClick={() => void restore(invite.id)}>Restore access</Button>}{invite.status !== "revoked" && <Button disabled={busy} variant="outline" size="sm" onClick={() => void revoke(invite.id)}>Revoke access</Button>}</div></article>)}</div>
    </div>}
  </section>;
}

export function PrivateNotes({ clientId }: { clientId: string }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setLoadFailed(false); setError(""); void readNote(clientId).then(note => { if (active) setText(note); }).catch(error => { if (active) { setError(friendlyError(error)); setLoadFailed(true); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [clientId, retry]);
  const save = async () => { setBusy(true); setError(""); setMessage(""); try { await saveNote(clientId, text); setMessage("Note saved privately."); } catch (error) { setError(friendlyError(error)); } finally { setBusy(false); } };
  return <article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6"><h3 className="font-bold text-[#29463e]">Private adviser notes</h3><p className="mt-1 text-xs text-[#70807a]">Only you can read these notes. Clients cannot access them.</p><Label htmlFor="private-note" className="sr-only">Private note</Label><Textarea id="private-note" disabled={loading || busy || loadFailed} maxLength={5000} value={text} onChange={event => { setText(event.target.value); setMessage(""); }} rows={5} className="mt-4" placeholder={loading ? "Loading note…" : "Add context for your next conversation…"} />{error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}{loadFailed && <Button variant="outline" className="mt-3" onClick={() => setRetry(v => v + 1)}>Retry loading note</Button>}{message && <p role="status" className="mt-3 text-sm text-[#328771]">{message}</p>}<div className="mt-3 flex justify-end"><Button disabled={loading || busy || loadFailed} onClick={save} className="bg-[#328771]">{busy ? "Saving…" : "Save private note"}</Button></div></article>;
}

export function ClientFamily({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void readFamily(clientId).then(members => { if (active) setMembers(members); }).catch(error => { if (active) setError(friendlyError(error)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [clientId]);
  return <article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6"><h3 className="font-bold text-[#29463e]">Family context</h3>{loading ? <p className="mt-3 text-sm text-[#70807a]">Loading…</p> : error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : members.length === 0 ? <p className="mt-3 text-sm text-[#70807a]">No family members added yet.</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2">{members.map(member => <li key={member.id} className="rounded-xl bg-[#f5f8f7] p-4 text-sm text-[#29463e]"><strong>{member.relationship || "Relationship not added"}</strong><p className="mt-1 text-xs text-[#70807a]">Age: {member.age || "Not added"} · Financially dependent: {member.financiallyDependent}</p></li>)}</ul>}</article>;
}

export function AdviserClientFile({ clientId, updatedAt }: { clientId: string; updatedAt: string }) {
  const [client, setClient] = useState<AppUser | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void readClient(clientId).then(record => { if (active) { setClient(record); setError(""); } }).catch(error => { if (active) setError(friendlyError(error)); });
    return () => { active = false; };
  }, [clientId, updatedAt, retry]);
  return <div>{error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRetry(v => v + 1)}>Retry loading profile</Button></div>}{client ? <FinancialFileSummary user={client} /> : !error && <p role="status" className="p-5 text-sm text-[#70807a]">Loading the saved Master File…</p>}</div>;
}
