import { doc, getDocFromServer, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";
import { execute, field } from "firebase/firestore/pipelines";
import type { User } from "firebase/auth";
import type { AppUser, FamilyMember } from "@/app/review-my-asset-app";
import { firebaseServices } from "./firebase-client";
import { sectionIds, type FinancialFile } from "./financial-file";

export type Invitation = { id: string; email: string; clientName: string; status: "pending" | "accepted" | "revoked"; acceptedUid: string; expiresAt: Timestamp; createdAt: Timestamp; createdBy: string; acceptedAt: Timestamp | null };
export function recordToUser(id: string, data: Record<string, unknown>): AppUser {
  return { ...data, id, role: "client", updatedAt: (data.savedAt as Timestamp).toDate().toISOString() } as AppUser;
}
export async function readClient(uid: string, db: Firestore = firebaseServices().db, cached?: AppUser) {
  const snap = await getDocFromServer(doc(db, "clients", uid));
  if (!snap.exists()) return null;
  if (cached?.id === uid && cached.revision === snap.data().revision && cached.updatedAt === (snap.data().savedAt as Timestamp).toDate().toISOString()) return cached;
  const record = recordToUser(snap.id, snap.data());
  const [family, financialFile] = await Promise.all([readFamily(uid, db), readFinancialFile(uid, db)]);
  if (record.quickProfile) record.quickProfile.familyMembers = family;
  record.financialFile = financialFile;
  return record;
}
export async function readFinancialFile(uid: string, db: Firestore = firebaseServices().db): Promise<FinancialFile> {
  const snapshots = await Promise.all(sectionIds.map(section => getDocFromServer(doc(db, "clients", uid, "sections", section))));
  const file = Object.fromEntries(snapshots.filter(s => s.exists()).map(s => [s.id, { ...s.data(), updatedAt: (s.data().savedAt as Timestamp).toDate().toISOString() }])) as FinancialFile;
  await Promise.all((["assets", "loans", "protection", "goals"] as const).map(async section => {
    const head = file[section];
    if (!head || head.entries.length < 4) return;
    const chunks = await Promise.all([2, 3].map(part => getDocFromServer(doc(db, "clients", uid, "sections", `${section}-${part}`))));
    for (const chunk of chunks) {
      if (!chunk.exists() || chunk.data().revision !== head.revision || chunk.data().confirmed !== head.confirmed) throw new Error("Your saved section is still updating. Please try again.");
      head.entries.push(...chunk.data().entries);
    }
  }));
  return file;
}
export async function readFamily(uid: string, db: Firestore = firebaseServices().db): Promise<FamilyMember[]> {
  const snap = await getDocFromServer(doc(db, "clientFamilies", uid));
  return snap.exists() ? snap.data().members : [];
}
export async function readClients() {
  const { db } = firebaseServices();
  const snapshot = await execute(db.pipeline().collection("clients").sort(field("savedAt").descending()));
  return snapshot.results.map(result => recordToUser(result.id!, result.data()));
}
export async function readInvitations(): Promise<Invitation[]> {
  const { db } = firebaseServices();
  const snapshot = await execute(db.pipeline().collection("invitations").sort(field("createdAt").descending()));
  return snapshot.results.map(result => ({ ...result.data(), id: result.id! } as Invitation));
}
export async function createInvitation(email: string, clientName: string) {
  const { db, auth } = firebaseServices();
  if (!auth.currentUser) throw new Error("Please sign in again.");
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  await setDoc(doc(db, "invitations", id), {
    email: email.trim().toLowerCase(), clientName: clientName.trim(), status: "pending", acceptedUid: "",
    createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 6 * 86400000), acceptedAt: null,
  });
  return id;
}
export async function revokeInvitation(id: string) {
  await updateDoc(doc(firebaseServices().db, "invitations", id), { status: "revoked" });
}
export async function restoreInvitation(id: string) {
  await updateDoc(doc(firebaseServices().db, "invitations", id), { status: "accepted" });
}
export async function acceptInvitation(user: User, inviteId: string, initial: AppUser) {
  const { db } = firebaseServices();
  await runTransaction(db, async transaction => {
    const invitationRef = doc(db, "invitations", inviteId);
    const clientRef = doc(db, "clients", user.uid);
    const invitation = await transaction.get(invitationRef);
    const client = await transaction.get(clientRef);
    if (client.exists()) return;
    const invite = invitation.data();
    if (!invite || invite.email !== user.email?.toLowerCase() || invite.status !== "pending" || invite.expiresAt.toMillis() <= Date.now()) throw new Error("This invitation is expired, revoked, or for a different email. Ask Anubha for a new invitation.");
    const { id: _id, role: _role, updatedAt: _updatedAt, ...details } = initial;
    transaction.set(clientRef, { ...details, quickProfile: { ...initial.quickProfile, fullName: invite.clientName }, uid: user.uid, email: user.email!.toLowerCase(), inviteId, profile: { ...initial.profile, fullName: invite.clientName, email: user.email! }, createdAt: serverTimestamp(), savedAt: serverTimestamp(), revision: 0 });
    transaction.update(invitationRef, { status: "accepted", acceptedUid: user.uid, acceptedAt: serverTimestamp() });
  });
}
export async function saveClient(uid: string, updates: Partial<AppUser>, expectedRevision: number, db: Firestore = firebaseServices().db) {
  const ref = doc(db, "clients", uid);
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Your profile could not be found. Please sign in again.");
    if (snap.data().revision !== expectedRevision) throw new Error("Your profile changed on another device. Reload to review the latest saved version before continuing.");
    const allowed = Object.fromEntries(Object.entries(updates).filter(([key]) => ["profile", "portfolio", "quickProfile", "onboardingComplete"].includes(key)));
    if (updates.quickProfile) {
      allowed.quickProfile = { ...updates.quickProfile, familyMembers: [] };
      // Only write the family document when those answers changed.
      const familyRef = doc(db, "clientFamilies", uid);
      const family = await transaction.get(familyRef);
      if (JSON.stringify(family.data()?.members ?? []) !== JSON.stringify(updates.quickProfile.familyMembers)) transaction.set(familyRef, { members: updates.quickProfile.familyMembers, savedAt: serverTimestamp(), revision: expectedRevision + 1 });
    }
    if (updates.financialFile) {
      for (const section of sectionIds) {
        const data = updates.financialFile[section];
        if (data) {
          if (data.entries.length > 12) throw new Error("Each section supports up to 12 records.");
          const detailed = ["assets", "loans", "protection", "goals"].includes(section);
          for (let part = 0; part < (detailed ? 3 : 1); part++) transaction.set(doc(db, "clients", uid, "sections", section + (part ? `-${part + 1}` : "")), { entries: data.entries.slice(part * 4, (part + 1) * 4), confirmed: data.confirmed, savedAt: serverTimestamp(), revision: expectedRevision + 1 });
        }
      }
    }
    transaction.update(ref, { ...allowed, savedAt: serverTimestamp(), revision: expectedRevision + 1 });
  });
  return (await readClient(uid, db))!;
}
export async function readNote(uid: string) {
  const snap = await getDocFromServer(doc(firebaseServices().db, "adviserNotes", uid));
  return snap.exists() ? snap.data().text as string : "";
}
export async function saveNote(uid: string, text: string) {
  await setDoc(doc(firebaseServices().db, "adviserNotes", uid), { text, updatedAt: serverTimestamp(), adviserUid: firebaseServices().auth.currentUser!.uid });
}
