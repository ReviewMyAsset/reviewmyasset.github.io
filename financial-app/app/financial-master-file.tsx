"use client";

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { friendlyError } from "@/lib/firebase-client";
import { assetTypes, loanTypes, policyTypes, goalCategories, MAX_AMOUNT, MAX_RECORDS, sectionIds, fileProgress, financialTotals, initialEntries, newEntry, ownedValue, money, syncFileSection, validDate, validateEntries, parseAssetsCSV, assetCSVTemplate, type FileSection, type FileEntry, type AssetRecord, type LoanRecord, type PolicyRecord, type GoalRecord } from "@/lib/financial-file";
import type { AppUser, QuickProfile } from "./review-my-asset-app";

const modules: Record<FileSection, { title: string; subtitle: string; emoji: string }> = {
  about: { title: "About you", subtitle: "Contact details and planning preferences", emoji: "👤" },
  family: { title: "Your family", subtitle: "Dependants and household context", emoji: "👨‍👩‍👧" },
  assets: { title: "What you own", subtitle: "Individual assets and your ownership share", emoji: "🏦" },
  loans: { title: "What you owe", subtitle: "Loan balances, repayments and interest", emoji: "💳" },
  protection: { title: "Your protection", subtitle: "Cover, premiums, renewals and nominees", emoji: "🛡️" },
  cashflow: { title: "Income & expenses", subtitle: "Household income and monthly commitments", emoji: "₹" },
  goals: { title: "Your goals", subtitle: "Targets, timelines and priorities", emoji: "🎯" },
  review: { title: "Review your file", subtitle: "Check your figures and confirm your profile", emoji: "✓" },
};
const inputStyle = "min-h-12 min-w-0 w-full rounded-xl border border-[#dce7e3] bg-white px-3 text-sm text-[#29463e]";

function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid min-w-0 content-start gap-2 text-sm font-semibold text-[#29463e]"><span>{label}</span>{children}{hint && <span className="text-xs font-normal leading-5 text-[#788780]">{hint}</span>}</label>;
}
function TextField({ label, value, onChange, type = "text", max = 200, required = false, hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; max?: number; required?: boolean; hint?: string }) {
  return <FormField label={label} hint={hint}><Input className={inputStyle} type={type} value={value} maxLength={max} required={required} max={type === "date" && label === "Date of birth" ? new Date().toISOString().slice(0, 10) : undefined} onChange={e => onChange(e.target.value)} /></FormField>;
}
function AmountField({ label, value, onChange, max = MAX_AMOUNT, required = false, hint, step = "0.01", min = 0 }: { label: string; value: number; onChange: (v: number) => void; max?: number; min?: number; required?: boolean; hint?: string; step?: string }) {
  return <FormField label={label} hint={hint}><Input className={inputStyle} type="number" inputMode="decimal" min={min} max={max} step={step} value={value || ""} required={required} placeholder="0" onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormField>;
}
function Choice({ label, value, options, onChange, optional = false }: { label: string; value: string; options: Record<string, string> | string[]; onChange: (v: string) => void; optional?: boolean }) {
  const values = Array.isArray(options) ? options.map(v => [v, v]) : Object.entries(options);
  return <FormField label={label}><select className={inputStyle} value={value} onChange={e => onChange(e.target.value)}>{optional && <option value="">Choose one</option>}{value && !values.some(([k]) => k === value) && <option value={value}>{value}</option>}{values.map(([k, text]) => <option key={k} value={k}>{text}</option>)}</select></FormField>;
}

export function FinancialMasterFile({ user, brand, onSave, onClose, initialSection = null }: { user: AppUser; brand: ReactNode; onSave: (updates: Partial<AppUser>, revision: number) => Promise<number>; onClose: () => void; initialSection?: FileSection | null }) {
  const [section, setSection] = useState<FileSection | null>(initialSection);
  const [profile, setProfile] = useState(() => structuredClone(user.profile));
  const [quick, setQuick] = useState<QuickProfile>(() => structuredClone(user.quickProfile!));
  const [entries, setEntries] = useState<FileEntry[]>(() => initialSection ? initialEntries(initialSection, user) : []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const revision = useRef(user.revision);
  const progress = fileProgress(user);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const open = (next: FileSection | null, skipGuard = false) => {
    if (saving || (!skipGuard && dirty && !window.confirm("Leave this section without saving your edits?"))) return;
    setSection(next); setProfile(structuredClone(user.profile)); setQuick(structuredClone(user.quickProfile!));
    setEntries(next ? initialEntries(next, user) : []); revision.current = user.revision;
    setDirty(false); setError(""); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const close = () => { if (!saving && (!dirty || window.confirm("Leave without saving your edits?"))) onClose(); };
  const updateQuick = (updates: Partial<QuickProfile>) => { setQuick(q => ({ ...q, ...updates })); setDirty(true); setNotice(""); };
  const updateProfile = (updates: Partial<AppUser["profile"]>) => { setProfile(p => ({ ...p, ...updates })); setDirty(true); setNotice(""); };
  const updateEntry = (id: string, updates: object) => { setEntries(current => current.map(a => a.id === id ? { ...a, ...updates } as FileEntry : a)); setDirty(true); setNotice(""); };
  const save = async (confirmed: boolean, advance = false) => {
    if (!section || saving) return;
    let validation = validateEntries(section, entries, confirmed);
    if (section === "about" && confirmed && (!quick.fullName.trim() || !validDate(quick.dateOfBirth) || !quick.maritalStatus || !profile.horizon || !profile.riskComfort)) validation = "Add your name, valid date of birth, marital status, planning timeframe, and risk comfort.";
    if (section === "about" && profile.phone && !/^[+\d ()-]{6,30}$/.test(profile.phone)) validation = "Enter a valid phone number, or leave it blank.";
    if (section === "family" && confirmed && quick.familyMembers.some(a => !a.relationship || !/^\d{1,3}$/.test(a.age) || Number(a.age) > 120)) validation = "Add a relationship and an age from 0 to 120 for every family member.";
    if (section === "cashflow" && [quick.householdIncome, quick.monthlyExpenses, quick.monthlyEmi].some(v => !Number.isFinite(v) || v < 0 || v > MAX_AMOUNT)) validation = "Enter valid, non-negative cash-flow figures.";
    if (section === "review" && progress.completed.length < 7) validation = "Confirm the seven sections before completing your Master File.";
    if (validation) { setError(validation); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const q = structuredClone(quick);
      if (section === "family") q.familySkipped = false;
      if (section === "cashflow" && user.financialFile?.loans) q.monthlyEmi = financialTotals(user).emi;
      const updates = syncFileSection(user, section, entries, q);
      if (section === "about") updates.profile = { ...updates.profile!, ...profile, fullName: q.fullName.trim(), dateOfBirth: q.dateOfBirth, maritalStatus: q.maritalStatus, incomeRange: q.incomeRange };
      // A review only touches the review marker. It must never write a stale copy of another section.
      if (section === "review") { delete updates.profile; delete updates.quickProfile; delete updates.portfolio; }
      updates.financialFile = { [section]: { entries, confirmed } };
      updates.onboardingComplete = true;
      revision.current = await onSave(updates, revision.current);
      setDirty(false); setNotice(confirmed ? "Section confirmed and saved." : "Draft saved. You can come back to confirm it.");
      if (advance) {
        const next = sectionIds[sectionIds.indexOf(section) + 1];
        setSection(next ?? null); setEntries(next ? initialEntries(next, { ...user, ...updates, financialFile: { ...user.financialFile, ...updates.financialFile } }) : []);
        setQuick(q); setProfile(updates.profile ?? profile); setNotice(section === "review" ? "Your Financial Master File is complete. You can update it at any time." : "Previous section saved.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) { setError(friendlyError(error)); }
    finally { setSaving(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void save(true, true); };
  const total = entries.reduce((s, e) => s + (section === "assets" ? ownedValue(e as AssetRecord) : section === "loans" ? (e as LoanRecord).outstanding : section === "protection" ? (e as PolicyRecord).coverAmount : (e as GoalRecord).targetAmount || 0), 0);
  const status = (id: FileSection) => id === "review" ? progress.reviewed ? "Complete" : "To review" : user.financialFile?.[id]?.confirmed ? "Confirmed" : user.financialFile?.[id] ? "Draft saved" : "To complete";
  const totals = financialTotals(user);
  const draftIncome = quick.householdIncome / (quick.incomeFrequency === "annual" ? 12 : 1);
  const draftEmi = user.financialFile?.loans ? totals.emi : quick.monthlyEmi;

  return <main className="min-h-dvh bg-[#f2f5f4] px-4 py-6 sm:px-6 sm:py-9"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-center justify-between gap-3">{brand}<Button variant="outline" disabled={saving} onClick={close} className="rounded-xl"><ArrowLeft className="size-4" /> Dashboard</Button></header>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[#328771]">Your Financial Master File</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#18332c]">{section ? modules[section].title : "Your whole picture, one section at a time."}</h1><p className="mt-3 text-sm leading-6 text-[#70807a]">{section ? modules[section].subtitle : "Start anywhere. Save drafts, confirm your answers, and return whenever something changes."}</p></div><div className="w-44"><p className="mb-2 text-xs font-semibold text-[#70807a]">{progress.percent}% complete · {progress.completed.length} of 7 sections</p><Progress value={progress.percent} /></div></div>
    {notice && <p role="status" className="mt-5 rounded-xl bg-[#e3f3eb] p-4 text-sm text-[#286f5e]">{notice}</p>}
    {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p>{error.includes("another device") && <Button variant="outline" onClick={() => open(section)} className="mt-3">Load latest saved version</Button>}</div>}
    {!section ? <>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">{sectionIds.map(id => <button key={id} onClick={() => open(id)} className="flex items-start gap-4 rounded-2xl border border-[#dfe9e5] bg-white p-5 text-left transition hover:border-[#91bcad] focus-visible:outline-2 focus-visible:outline-[#328771]"><span aria-hidden="true" className="text-2xl">{modules[id].emoji}</span><span className="flex-1"><span className="block font-bold text-[#29463e]">{modules[id].title}</span><span className="mt-1 block text-sm leading-5 text-[#788780]">{modules[id].subtitle}</span><span className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold ${status(id) === "Confirmed" || status(id) === "Complete" ? "text-[#328771]" : "text-[#98762a]"}`}>{status(id) === "Confirmed" || status(id) === "Complete" ? <CheckCircle2 className="size-3.5" /> : null}{status(id)}</span></span><ChevronRight className="mt-1 size-4 text-[#84958e]" /></button>)}</div>
      <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => open(progress.next)} className="min-h-12 rounded-xl bg-[#328771]">{progress.reviewed ? "Review my file" : "Continue setup"}<ChevronRight className="size-4" /></Button><Button type="button" variant="outline" onClick={() => downloadProfile(user)}><Download className="size-4" /> Download profile</Button></div>
      <FinancialFileSummary user={user} />
    </> : <>
      <nav aria-label="Master File sections" className="mt-6 flex gap-2 overflow-x-auto pb-2">{sectionIds.map(id => <button key={id} aria-current={id === section ? "step" : undefined} disabled={saving} onClick={() => open(id)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold ${id === section ? "border-[#328771] bg-[#328771] text-white" : "border-[#dfe9e5] bg-white text-[#61766d]"}`}>{modules[id].title}</button>)}</nav>
      <form onSubmit={submit} className="mt-4 rounded-3xl border border-[#dfe9e5] bg-white p-5 sm:p-8"><fieldset disabled={saving} className="min-w-0">
      {section === "about" && <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Full name" required value={quick.fullName} onChange={v => updateQuick({ fullName: v })} />
        <TextField label="Date of birth" required type="date" value={quick.dateOfBirth} onChange={v => updateQuick({ dateOfBirth: v })} />
        <FormField label="Account email"><Input className={inputStyle} readOnly value={user.profile.email} /><span className="text-xs font-normal text-[#788780]">Your verified sign-in email.</span></FormField>
        <TextField label="Phone (optional)" type="tel" max={30} value={profile.phone} onChange={v => updateProfile({ phone: v })} />
        <TextField label="City / location (optional)" value={profile.city} onChange={v => updateProfile({ city: v })} />
        <TextField label="Occupation (optional)" value={profile.occupation} onChange={v => updateProfile({ occupation: v })} />
        <Choice label="Marital status" optional value={quick.maritalStatus} options={["Single", "Married", "Separated / Divorced", "Widowed", "Prefer not to say"]} onChange={v => updateQuick({ maritalStatus: v })} />
        <Choice label="Work status" optional value={quick.workStatus} options={["Working", "Retired", "Not currently working"]} onChange={v => updateQuick({ workStatus: v })} />
        <Choice label="Employment background" optional value={quick.workType} options={["Employment", "Business", "Professional", "Other"]} onChange={v => updateQuick({ workType: v })} />
        <Choice label="Annual household income range" optional value={quick.incomeRange} options={["Below ₹10 lakh", "₹10–15 lakh", "₹15–25 lakh", "₹25–50 lakh", "₹50 lakh–1 crore", "Above ₹1 crore", "Prefer not to say"]} onChange={v => updateQuick({ incomeRange: v })} />
        <Choice label="Planning timeframe" optional value={profile.horizon} options={["Less than 3 years", "3–5 years", "5–10 years", "More than 10 years", "Not sure yet"]} onChange={v => updateProfile({ horizon: v })} />
        <Choice label="Comfort with investment fluctuations" optional value={profile.riskComfort} options={["Low: I prefer stability", "Moderate: I can accept some ups and downs", "High: I can accept large fluctuations", "Not sure yet"]} onChange={v => updateProfile({ riskComfort: v })} />
        <p className="text-xs leading-5 text-[#788780] sm:col-span-2">This records your preferences for a conversation with your adviser. It is not a formal risk assessment.</p>
      </div>}
      {section === "family" && <div className="grid gap-4"><p className="text-sm leading-6 text-[#70807a]">Add up to 10 family members. Confirm an empty section if you have no family details to add.</p>{quick.familyMembers.map((member, i) => <div key={member.id} className="rounded-2xl bg-[#f5f8f7] p-4"><div className="mb-4 flex items-center justify-between"><strong className="text-sm text-[#29463e]">Family member {i + 1}</strong><Button variant="ghost" size="icon" type="button" aria-label={`Remove family member ${i + 1}`} onClick={() => updateQuick({ familyMembers: quick.familyMembers.filter(a => a.id !== member.id) })}><Trash2 className="size-4 text-red-700" /></Button></div><div className="grid gap-4 sm:grid-cols-3"><Choice label="Relationship" optional value={member.relationship} options={["Spouse / Partner", "Child", "Parent", "Sibling", "Other"]} onChange={v => updateQuick({ familyMembers: quick.familyMembers.map(a => a.id === member.id ? { ...a, relationship: v } : a) })} /><TextField label="Age" max={3} value={member.age} onChange={v => updateQuick({ familyMembers: quick.familyMembers.map(a => a.id === member.id ? { ...a, age: v.replace(/\D/g, "").slice(0, 3) } : a) })} /><Choice label="Financially dependent" value={member.financiallyDependent} options={["Yes", "No"]} onChange={v => updateQuick({ familyMembers: quick.familyMembers.map(a => a.id === member.id ? { ...a, financiallyDependent: v as "Yes" | "No" } : a) })} /></div></div>)}<Button type="button" disabled={quick.familyMembers.length >= 10} variant="outline" onClick={() => updateQuick({ familyMembers: [...quick.familyMembers, { id: crypto.randomUUID(), relationship: "", age: "", financiallyDependent: "Yes" }] })}><Plus className="size-4" /> Add family member</Button></div>}
      {["assets", "loans", "protection", "goals"].includes(section) && <>
        {section === "assets" && <div className="mb-5 rounded-xl border border-[#dfe9e5] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[#29463e]">Import your asset list</p><p className="mt-1 text-xs leading-5 text-[#788780]">Use the CSV template. Import replaces this section’s draft; review it before saving.</p></div><Button type="button" variant="outline" onClick={() => downloadCSV(assetCSVTemplate, "review-my-asset-template.csv")}><Download className="size-4" /> Asset template</Button></div><label className="mt-4 grid gap-2 text-xs font-semibold text-[#536962]"><span>Choose a CSV file (up to 1 MB)</span><input type="file" accept=".csv,text/csv" className="w-full rounded-xl border border-[#dce7e3] bg-white p-3 text-xs" onChange={async event => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setError(""); try { if (file.size > 1024 * 1024) throw new Error("Use a CSV file smaller than 1 MB."); const imported = parseAssetsCSV(await file.text()); if (entries.length && !window.confirm("Replace the current draft with the imported assets?")) return; setEntries(imported); setDirty(true); setNotice(`${imported.length} assets imported into your draft. Review the values, then save.`); } catch (error) { setError(friendlyError(error)); } finally { input.value = ""; } }} /></label><p className="mt-3 break-words text-xs leading-5 text-[#788780]">Asset types: {Object.keys(assetTypes).join(", ")}.</p></div>}
        <p className="mb-5 rounded-xl bg-[#edf5f2] p-4 text-sm leading-6 text-[#536962]">{section === "assets" ? "Enter current market values, not purchase prices. Your share is used in net worth. Replace any prefilled estimate with your actual records to avoid counting it twice." : section === "loans" ? "Use the outstanding balance. Monthly repayments feed into your cash-flow summary. Confirm an empty section if you have no liabilities." : section === "protection" ? "Record cover and annual premiums. Cover is shown separately from net worth. Confirm an empty section if you have no policies to add." : "Set a target and a year for each goal. Money already saved is progress toward the goal, not an additional asset."}</p>
        {entries.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-[#cdded6] p-6 text-center text-sm text-[#788780]">No records added. Add a record or confirm that there are none for now.</p>}
        <div className="grid gap-5">{entries.map((entry, i) => <article key={entry.id} className="rounded-2xl border border-[#dfe9e5] bg-[#fbfcfc] p-4 sm:p-5"><div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-[#29463e]">{section === "assets" ? "Asset" : section === "loans" ? "Loan" : section === "protection" ? "Policy" : "Goal"} {i + 1}</h2><Button type="button" variant="ghost" size="icon" aria-label={`Remove record ${i + 1}`} onClick={() => { setEntries(entries.filter(a => a.id !== entry.id)); setDirty(true); }}><Trash2 className="size-4 text-red-700" /></Button></div><div className="grid gap-4 sm:grid-cols-2">
          {section === "assets" && (() => { const a = entry as AssetRecord; return <><Choice label="Asset type" value={a.type} options={assetTypes} onChange={v => updateEntry(a.id, { type: v })} /><TextField label="Asset / investment name" required max={100} value={a.name} onChange={v => updateEntry(a.id, { name: v })} /><TextField label="Institution / location (optional)" max={100} value={a.institution} onChange={v => updateEntry(a.id, { institution: v })} /><AmountField label="Current total value (₹)" value={a.value} onChange={v => updateEntry(a.id, { value: v })} /><AmountField label="Your ownership share (%)" value={a.ownershipShare} min={1} max={100} required onChange={v => updateEntry(a.id, { ownershipShare: v })} /><div className="flex items-center rounded-xl bg-[#eaf4f0] p-4 text-sm font-bold text-[#286f5e]">Your attributable value: {money(ownedValue(a))}</div></>; })()}
          {section === "loans" && (() => { const a = entry as LoanRecord; return <><Choice label="Loan type" value={a.type} options={loanTypes} onChange={v => updateEntry(a.id, { type: v })} /><TextField label="Lender (optional)" max={100} value={a.lender} onChange={v => updateEntry(a.id, { lender: v })} /><AmountField label="Outstanding balance (₹)" value={a.outstanding} onChange={v => updateEntry(a.id, { outstanding: v })} /><AmountField label="Monthly EMI / repayment (₹)" value={a.monthlyEmi} onChange={v => updateEntry(a.id, { monthlyEmi: v })} /><AmountField label="Annual interest rate (%)" max={100} value={a.interestRate} onChange={v => updateEntry(a.id, { interestRate: v })} /><TextField label="Expected end date (optional)" type="date" value={a.endDate} onChange={v => updateEntry(a.id, { endDate: v })} /></>; })()}
          {section === "protection" && (() => { const a = entry as PolicyRecord; return <><Choice label="Insurance type" value={a.type} options={policyTypes} onChange={v => updateEntry(a.id, { type: v })} /><TextField label="Insurer / policy name (optional)" max={100} value={a.insurer} onChange={v => updateEntry(a.id, { insurer: v })} /><AmountField label="Cover amount (₹)" value={a.coverAmount} onChange={v => updateEntry(a.id, { coverAmount: v })} /><AmountField label="Annual premium (₹)" value={a.annualPremium} onChange={v => updateEntry(a.id, { annualPremium: v })} /><TextField label="Renewal date (optional)" type="date" value={a.renewalDate} onChange={v => updateEntry(a.id, { renewalDate: v })} /><TextField label="Nominee / beneficiary (optional)" max={100} value={a.nominee} onChange={v => updateEntry(a.id, { nominee: v })} /></>; })()}
          {section === "goals" && (() => { const a = entry as GoalRecord; return <><Choice label="Goal category" value={a.category} options={goalCategories} onChange={v => updateEntry(a.id, { category: v })} /><TextField label="Goal name" required max={100} value={a.name} onChange={v => updateEntry(a.id, { name: v })} /><AmountField label="Target amount (₹)" value={a.targetAmount} onChange={v => updateEntry(a.id, { targetAmount: v })} /><AmountField label="Already saved toward this goal (₹)" value={a.savedAmount} onChange={v => updateEntry(a.id, { savedAmount: v })} /><AmountField label="Target year" min={new Date().getFullYear()} max={2100} step="1" value={a.targetYear} onChange={v => updateEntry(a.id, { targetYear: v })} /><Choice label="Priority" value={a.priority} options={["High", "Medium", "Low"]} onChange={v => updateEntry(a.id, { priority: v })} /></>; })()}
          <div className="sm:col-span-2"><FormField label="Notes (optional)"><Textarea maxLength={500} value={entry.notes} onChange={e => updateEntry(entry.id, { notes: e.target.value })} className="min-h-24 rounded-xl border-[#dce7e3] bg-white" placeholder="Context to help your adviser understand this record" /></FormField></div>
        </div></article>)}</div>
        <Button type="button" disabled={entries.length >= MAX_RECORDS} variant="outline" className="mt-4 min-h-12 w-full rounded-xl border-dashed" onClick={() => { setEntries([...entries, newEntry(section, crypto.randomUUID())]); setDirty(true); }}><Plus className="size-4" /> Add {section === "assets" ? "asset" : section === "loans" ? "loan" : section === "protection" ? "policy" : "goal"} ({entries.length}/{MAX_RECORDS})</Button>
        <p className="mt-4 text-right text-sm font-bold text-[#328771]">{section === "assets" ? "Your share of assets" : section === "loans" ? "Total outstanding" : section === "protection" ? "Total cover across policies" : "Total goal targets"}: {money(total)}</p>
      </>}
      {section === "cashflow" && <div className="grid gap-5 sm:grid-cols-2"><AmountField label="Household income (₹)" value={quick.householdIncome} onChange={v => updateQuick({ householdIncome: v })} /><Choice label="Income frequency" value={quick.incomeFrequency} options={{ monthly: "Per month", annual: "Per year" }} onChange={v => updateQuick({ incomeFrequency: v as "monthly" | "annual" })} /><AmountField label="Monthly living expenses (₹)" hint="Exclude EMIs and insurance premiums, which are shown separately." value={quick.monthlyExpenses} onChange={v => updateQuick({ monthlyExpenses: v })} />{user.financialFile?.loans ? <div className="rounded-xl bg-[#f1f6f4] p-4"><p className="text-sm font-semibold text-[#29463e]">Monthly loan repayments</p><p className="mt-2 font-bold text-[#328771]">{money(totals.emi)}</p><p className="mt-2 text-xs text-[#788780]">Calculated from your saved loan records. Edit What you owe to change this.</p></div> : <AmountField label="Monthly loan repayments (₹)" value={quick.monthlyEmi} onChange={v => updateQuick({ monthlyEmi: v })} />}<div className="rounded-2xl bg-[#173f34] p-5 text-white sm:col-span-2"><p className="text-sm text-white/70">Estimated monthly surplus / shortfall</p><p className="mt-2 text-3xl font-bold">{money(draftIncome - quick.monthlyExpenses - draftEmi - totals.premiums)}</p><p className="mt-3 text-xs leading-5 text-white/60">Income {money(draftIncome)} less living expenses, repayments {money(draftEmi)}, and monthly equivalent of recorded insurance premiums {money(totals.premiums)}.</p></div></div>}
      {section === "review" && <><p className="rounded-xl bg-[#edf5f2] p-4 text-sm leading-6 text-[#536962]">Review your records below. Completing your file confirms that you have checked the information. Your adviser can already see every saved section.</p><FinancialFileSummary user={user} onEdit={id => open(id)} /><p className="mt-5 text-sm text-[#70807a]">{progress.completed.length === 7 ? "All seven sections are confirmed. You are ready to complete your file." : "Confirm each section first. Empty sections can be confirmed when you have nothing to add."}</p></>}
      <div className="mt-8 flex flex-wrap gap-3 border-t border-[#e5ece9] pt-5"><Button type="button" variant="outline" onClick={() => open(null)}>Back to sections</Button>{section !== "review" && <Button type="button" variant="outline" onClick={() => void save(false)}>Save draft</Button>}<Button type="submit" disabled={saving || (section === "review" && progress.completed.length < 7)} className="min-h-12 rounded-xl bg-[#328771] sm:ml-auto">{saving ? "Saving…" : section === "review" ? "Complete my Master File" : "Confirm & continue"}<ChevronRight className="size-4" /></Button></div>
      </fieldset></form>
    </>}
  </div></main>;
}

function SummaryCard({ section, onEdit, children }: { section: FileSection; onEdit?: (s: FileSection) => void; children: ReactNode }) {
  return <article className="rounded-2xl border border-[#dfe9e5] bg-white p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-[#29463e]">{modules[section].title}</h3>{onEdit && <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(section)}>Edit</Button>}</div>{children}</article>;
}
function Detail({ label, value }: { label: string; value: string | number }) { return <div className="min-w-0"><dt className="text-xs text-[#82908b]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#405951]">{value === "" ? "Not provided" : value}</dd></div>; }
export function FinancialFileSummary({ user, onEdit }: { user: AppUser; onEdit?: (s: FileSection) => void }) {
  const q = user.quickProfile;
  const totals = financialTotals(user);
  const assets = initialEntries("assets", user) as AssetRecord[];
  const loans = initialEntries("loans", user) as LoanRecord[];
  const policies = initialEntries("protection", user) as PolicyRecord[];
  const goals = initialEntries("goals", user) as GoalRecord[];
  const progress = fileProgress(user);
  const empty = <p className="text-sm text-[#788780]">No records added.</p>;
  const recordStyle = "rounded-xl bg-[#f5f8f7] p-4";
  return <section className="mt-7 grid gap-4" aria-label="Financial profile summary">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#29463e]">Your saved profile</h2><p className="mt-1 text-xs text-[#788780]">{progress.reviewed ? "Master File complete" : "Master File in progress"} · {progress.percent}% complete</p></div><Button type="button" variant="outline" onClick={() => downloadProfile(user)}><Download className="size-4" /> Download profile</Button></div>
    <SummaryCard section="about" onEdit={onEdit}><dl className="grid gap-4 sm:grid-cols-3"><Detail label="Name" value={user.profile.fullName} /><Detail label="Email" value={user.profile.email} /><Detail label="Date of birth" value={user.profile.dateOfBirth} /><Detail label="Phone" value={user.profile.phone} /><Detail label="City" value={user.profile.city} /><Detail label="Occupation" value={user.profile.occupation} /><Detail label="Marital status" value={user.profile.maritalStatus} /><Detail label="Work status" value={q?.workStatus ?? ""} /><Detail label="Employment background" value={q?.workType ?? ""} /><Detail label="Household income range" value={user.profile.incomeRange} /><Detail label="Planning timeframe" value={user.profile.horizon} /><Detail label="Risk comfort" value={user.profile.riskComfort} /></dl></SummaryCard>
    <SummaryCard section="family" onEdit={onEdit}>{q?.familyMembers.length ? <ul className="grid gap-3 sm:grid-cols-2">{q.familyMembers.map(a => <li key={a.id} className={recordStyle}><strong className="text-sm text-[#29463e]">{a.relationship || "Relationship not provided"}</strong><p className="mt-2 text-xs text-[#788780]">Age {a.age || "not provided"} · Dependent: {a.financiallyDependent}</p></li>)}</ul> : <p className="text-sm text-[#788780]">{q?.familySkipped ? "Skipped during Quick Profile." : "No family members added."}</p>}</SummaryCard>
    <SummaryCard section="assets" onEdit={onEdit}>{assets.length ? <div className="grid gap-3">{assets.map(a => <div className={recordStyle} key={a.id}><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm text-[#29463e]">{a.name}</strong><span className="text-sm font-bold text-[#328771]">{money(ownedValue(a))}</span></div><p className="mt-2 text-xs leading-5 text-[#788780]">{assetTypes[a.type]} · {a.ownershipShare}% ownership · Total value {money(a.value)}{a.institution ? ` · ${a.institution}` : ""}</p>{a.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[#536962]">{a.notes}</p>}</div>)}</div> : empty}</SummaryCard>
    <SummaryCard section="loans" onEdit={onEdit}>{loans.length ? <div className="grid gap-3">{loans.map(a => <div className={recordStyle} key={a.id}><strong className="text-sm text-[#29463e]">{loanTypes[a.type]}{a.lender ? ` · ${a.lender}` : ""}</strong><dl className="mt-3 grid gap-3 sm:grid-cols-4"><Detail label="Outstanding" value={money(a.outstanding)} /><Detail label="Monthly repayment" value={money(a.monthlyEmi)} /><Detail label="Interest rate" value={`${a.interestRate}%`} /><Detail label="End date" value={a.endDate} /></dl>{a.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[#536962]">{a.notes}</p>}</div>)}</div> : empty}</SummaryCard>
    <SummaryCard section="protection" onEdit={onEdit}>{policies.length ? <div className="grid gap-3">{policies.map(a => <div className={recordStyle} key={a.id}><strong className="text-sm text-[#29463e]">{policyTypes[a.type]}{a.insurer ? ` · ${a.insurer}` : ""}</strong><dl className="mt-3 grid gap-3 sm:grid-cols-4"><Detail label="Cover" value={money(a.coverAmount)} /><Detail label="Annual premium" value={money(a.annualPremium)} /><Detail label="Renewal" value={a.renewalDate} /><Detail label="Nominee" value={a.nominee} /></dl>{a.renewalDate && a.renewalDate < new Date().toISOString().slice(0, 10) && <p className="mt-3 text-xs font-bold text-amber-800">Recorded renewal date has passed. Check whether this policy has renewed.</p>}{a.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[#536962]">{a.notes}</p>}</div>)}</div> : empty}{!user.financialFile?.protection?.confirmed && q && <p className="mt-3 text-xs leading-5 text-[#788780]">Quick Profile answers: {Object.entries(q.protection).map(([key, p]) => `${policyTypes[key as keyof typeof policyTypes]}: ${p.status || "Not answered"}`).join(" · ")}</p>}</SummaryCard>
    <SummaryCard section="cashflow" onEdit={onEdit}><dl className="grid gap-4 sm:grid-cols-3"><Detail label="Monthly household income" value={money(totals.income)} /><Detail label="Monthly living expenses" value={money(totals.expenses)} /><Detail label="Monthly loan repayments" value={money(totals.emi)} /><Detail label="Monthly equivalent of insurance premiums" value={money(totals.premiums)} /><Detail label="Estimated monthly surplus / shortfall" value={money(totals.surplus)} /></dl></SummaryCard>
    <SummaryCard section="goals" onEdit={onEdit}>{goals.length ? <div className="grid gap-3">{goals.map(a => <div className={recordStyle} key={a.id}><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm text-[#29463e]">{a.name}</strong><span className="text-xs font-bold text-[#98762a]">{a.priority} priority</span></div><p className="mt-2 text-xs text-[#788780]">{a.category} · Target year {a.targetYear}</p><p className="mt-3 text-sm text-[#536962]">{money(a.savedAmount)} saved of {money(a.targetAmount)} target</p><Progress className="mt-3" value={a.targetAmount > 0 ? Math.min(100, a.savedAmount / a.targetAmount * 100) : 0} />{a.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[#536962]">{a.notes}</p>}</div>)}</div> : empty}</SummaryCard>
  </section>;
}

function downloadProfile(user: AppUser) {
  const rows: (string | number)[][] = [["Section", "Record", "Field", "Value"]];
  const add = (section: string, record: string, data: object) => { for (const [key, value] of Object.entries(data)) if (key !== "id") rows.push([section, record, key, String(value)]); };
  add("About you", user.profile.fullName, user.profile);
  user.quickProfile?.familyMembers.forEach((a, i) => add("Family", `Member ${i + 1}`, a));
  for (const section of ["assets", "loans", "protection", "goals"] as const) initialEntries(section, user).forEach((a, i) => add(modules[section].title, `Record ${i + 1}`, a));
  add("Monthly cash flow (INR)", "Summary", financialTotals(user));
  const safe = (value: string | number) => { const text = String(value); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`; };
  downloadCSV(rows.map(row => row.map(safe).join(",")).join("\r\n"), `review-my-asset-profile-${new Date().toISOString().slice(0, 10)}.csv`);
}
function downloadCSV(contents: string, filename: string) {
  const blob = new Blob(["\uFEFF" + contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
