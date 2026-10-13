"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coins,
  CreditCard,
  Gem,
  IndianRupee,
  Landmark,
  LogOut,
  Mail,
  MapPin,
  Menu,
  PencilLine,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { onAuthStateChanged, reload, sendEmailVerification, signOut, type User } from "firebase/auth";
import { ADVISER_EMAIL, CLIENT_APP_URL, firebaseServices, friendlyError } from "@/lib/firebase-client";
import { acceptInvitation, readClient, readClients, saveClient } from "@/lib/client-records";
import { AuthScreen } from "./firebase-auth-screen";
import { InvitationPanel, PrivateNotes, AdviserClientFile } from "./adviser-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FinancialMasterFile, FinancialFileSummary } from "./financial-master-file";
import { EmailActionScreen } from "./email-action-screen";
import { emailActionError, verifyEmailLink } from "@/lib/email-actions";
import { fileProgress, financialTotals, type FinancialFile, type FileSection } from "@/lib/financial-file";

type CategoryKey =
  | "equity"
  | "fixedIncome"
  | "metals"
  | "property"
  | "debt"
  | "insurance";

export type Portfolio = Record<CategoryKey, number> & { other?: number };

export type Profile = {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  city: string;
  occupation: string;
  maritalStatus: string;
  dependants: string;
  incomeRange: string;
  primaryGoal: string;
  horizon: string;
  riskComfort: string;
};

export type FamilyMember = {
  id: string;
  relationship: string;
  age: string;
  financiallyDependent: "Yes" | "No";
};

type QuickAssetKey = "cash" | "investments" | "property" | "metals" | "businessOther";
type LoanKey = "home" | "vehicle" | "creditCard" | "education" | "business" | "other";
type ProtectionKey = "life" | "health" | "accident" | "property" | "vehicle";

export type QuickProfile = {
  step: number;
  fullName: string;
  dateOfBirth: string;
  maritalStatus: string;
  workStatus: string;
  workType: string;
  incomeRange: string;
  familyMembers: FamilyMember[];
  familySkipped: boolean;
  assets: Record<QuickAssetKey, { selected: boolean; amount: number; detailChoice: "details" | "later" | ""; note: string }>;
  loans: Record<LoanKey, { selected: boolean; outstanding: number; monthlyEmi: number }>;
  noLoans: boolean;
  protection: Record<ProtectionKey, { status: "Yes" | "No" | "Not sure" | ""; coverAmount: number }>;
  householdIncome: number;
  incomeFrequency: "monthly" | "annual";
  monthlyExpenses: number;
  monthlyEmi: number;
  goals: string[];
  primaryGoal: string;
};

export type AppUser = {
  id: string;
  username: string;
  inviteId: string;
  revision: number;
  role: "client" | "adviser";
  onboardingComplete: boolean;
  quickProfile?: QuickProfile;
  financialFile?: FinancialFile;
  profile: Profile;
  portfolio: Portfolio;
  updatedAt: string;
};

const STORAGE_KEY = "review-my-asset-demo-v1";
const SESSION_KEY = "review-my-asset-session-v1";
const INTRO_SEEN_KEY = "review-my-asset-intro-seen-v1";
const sessionValue = (key: string) => { try { return window.sessionStorage.getItem(key); } catch { return null; } };
const saveSessionValue = (key: string, value: string) => { try { window.sessionStorage.setItem(key, value); } catch { /* Optional continuity only. */ } };

const emptyProfile: Profile = {
  fullName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  city: "",
  occupation: "",
  maritalStatus: "",
  dependants: "0",
  incomeRange: "",
  primaryGoal: "",
  horizon: "",
  riskComfort: "",
};

const emptyPortfolio: Portfolio = {
  equity: 0,
  fixedIncome: 0,
  metals: 0,
  property: 0,
  debt: 0,
  insurance: 0,
};

const categories: Array<{
  key: CategoryKey;
  label: string;
  shortLabel: string;
  color: string;
  hint: string;
  icon: typeof TrendingUp;
}> = [
  { key: "equity", label: "Equity", shortLabel: "Equity", color: "#328771", hint: "Shares, mutual funds, ETFs and PMS", icon: TrendingUp },
  { key: "fixedIncome", label: "Fixed income", shortLabel: "Fixed income", color: "#6659A7", hint: "FDs, bonds, PPF, EPF and NPS debt", icon: Landmark },
  { key: "metals", label: "Gold / silver", shortLabel: "Gold / silver", color: "#D5A63D", hint: "Physical, digital, funds and jewellery", icon: Gem },
  { key: "property", label: "Real estate / vehicles", shortLabel: "Property", color: "#C87845", hint: "Estimated current resale value", icon: CarFront },
  { key: "debt", label: "Debt", shortLabel: "Debt", color: "#D64545", hint: "Total outstanding loan balance", icon: CreditCard },
  { key: "insurance", label: "Insurance", shortLabel: "Insurance", color: "#2F6FED", hint: "Total life and health cover", icon: ShieldCheck },
];

const quickAssetOptions: Array<{ key: QuickAssetKey; label: string; emoji: string }> = [
  { key: "cash", label: "Cash & Bank Deposits", emoji: "🏦" },
  { key: "investments", label: "Investments", emoji: "📈" },
  { key: "property", label: "Property", emoji: "🏠" },
  { key: "metals", label: "Gold / Silver", emoji: "🥇" },
  { key: "businessOther", label: "Business / Other Assets", emoji: "🏢" },
];

const loanOptions: Array<{ key: LoanKey; label: string; emoji: string }> = [
  { key: "home", label: "Home Loan", emoji: "🏠" },
  { key: "vehicle", label: "Vehicle Loan", emoji: "🚗" },
  { key: "creditCard", label: "Credit Card Outstanding", emoji: "💳" },
  { key: "education", label: "Education Loan", emoji: "🎓" },
  { key: "business", label: "Business Loan", emoji: "💼" },
  { key: "other", label: "Other Loan", emoji: "📌" },
];

const protectionOptions: Array<{ key: ProtectionKey; label: string; emoji: string }> = [
  { key: "life", label: "Life Insurance", emoji: "❤️" },
  { key: "health", label: "Health Insurance", emoji: "🏥" },
  { key: "accident", label: "Personal Accident / Disability", emoji: "🦽" },
  { key: "property", label: "Home / Property Insurance", emoji: "🏠" },
  { key: "vehicle", label: "Vehicle Insurance", emoji: "🚗" },
];

const goalOptions = [
  { label: "Children’s Education", emoji: "🎓" },
  { label: "Children’s Marriage", emoji: "💍" },
  { label: "Buy / Upgrade Home", emoji: "🏠" },
  { label: "Travel", emoji: "🌴" },
  { label: "Major Purchase", emoji: "🚘" },
  { label: "Retirement", emoji: "🧘" },
  { label: "Business", emoji: "💼" },
  { label: "Family Security", emoji: "👨‍👩‍👧" },
  { label: "Financial Independence", emoji: "🏆" },
  { label: "Other", emoji: "❤️" },
];

const createEmptyQuickProfile = (): QuickProfile => ({
  step: 1,
  fullName: "",
  dateOfBirth: "",
  maritalStatus: "",
  workStatus: "",
  workType: "",
  incomeRange: "",
  familyMembers: [],
  familySkipped: false,
  assets: {
    cash: { selected: false, amount: 0, detailChoice: "", note: "" },
    investments: { selected: false, amount: 0, detailChoice: "", note: "" },
    property: { selected: false, amount: 0, detailChoice: "", note: "" },
    metals: { selected: false, amount: 0, detailChoice: "", note: "" },
    businessOther: { selected: false, amount: 0, detailChoice: "", note: "" },
  },
  loans: {
    home: { selected: false, outstanding: 0, monthlyEmi: 0 },
    vehicle: { selected: false, outstanding: 0, monthlyEmi: 0 },
    creditCard: { selected: false, outstanding: 0, monthlyEmi: 0 },
    education: { selected: false, outstanding: 0, monthlyEmi: 0 },
    business: { selected: false, outstanding: 0, monthlyEmi: 0 },
    other: { selected: false, outstanding: 0, monthlyEmi: 0 },
  },
  noLoans: false,
  protection: {
    life: { status: "", coverAmount: 0 },
    health: { status: "", coverAmount: 0 },
    accident: { status: "", coverAmount: 0 },
    property: { status: "", coverAmount: 0 },
    vehicle: { status: "", coverAmount: 0 },
  },
  householdIncome: 0,
  incomeFrequency: "annual",
  monthlyExpenses: 0,
  monthlyEmi: 0,
  goals: [],
  primaryGoal: "",
});

const normaliseQuickProfile = (saved?: QuickProfile): QuickProfile => {
  const empty = createEmptyQuickProfile();
  if (!saved) return empty;
  return {
    ...empty,
    ...saved,
    familyMembers: saved.familyMembers ?? [],
    assets: { ...empty.assets, ...(saved.assets ?? {}) },
    loans: { ...empty.loans, ...(saved.loans ?? {}) },
    protection: { ...empty.protection, ...(saved.protection ?? {}) },
    goals: saved.goals ?? [],
  };
};

const numberFromInput = (value: string) => Math.min(1_000_000_000_000, Math.max(0, Number(value.replace(/,/g, "")) || 0));

const quickProfileToPortfolio = (quick: QuickProfile): Portfolio => ({
  equity: quick.assets.investments.selected ? quick.assets.investments.amount : 0,
  fixedIncome: quick.assets.cash.selected ? quick.assets.cash.amount : 0,
  metals: quick.assets.metals.selected ? quick.assets.metals.amount : 0,
  property: quick.assets.property.selected ? quick.assets.property.amount : 0,
  debt: Object.values(quick.loans).reduce((sum, loan) => sum + (loan.selected ? loan.outstanding : 0), 0),
  insurance: Object.values(quick.protection).reduce((sum, protection) => sum + (protection.status === "Yes" ? protection.coverAmount : 0), 0),
  other: quick.assets.businessOther.selected ? quick.assets.businessOther.amount : 0,
});

const quickProfileToProfile = (quick: QuickProfile, existing: Profile): Profile => ({
  ...existing,
  fullName: quick.fullName,
  dateOfBirth: quick.dateOfBirth,
  maritalStatus: quick.maritalStatus,
  occupation: [quick.workStatus, quick.workType].filter(Boolean).join(" · "),
  dependants: String(quick.familyMembers.filter((member) => member.financiallyDependent === "Yes").length),
  incomeRange: quick.incomeRange,
  primaryGoal: quick.primaryGoal,
});

const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

const formatCompactINR = (value: number) => {
  if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(value % 10000000 === 0 ? 0 : 2)} crore`;
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)} lakh`;
  return formatINR(value);
};

const formatDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Not provided" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Review My Asset">
      <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#328771] text-white shadow-[0_8px_22px_rgba(50,135,113,.25)]">
        <BarChart3 className="size-5" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold tracking-[-0.02em] text-[#18332c]">Review My Asset</p>
          <p className="mt-0.5 text-xs font-medium text-[#76847f]">Your financial picture</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label className="text-sm font-semibold text-[#29463e]">{label}</Label>{children}</div>;
}

function IntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onComplete, reducedMotion ? 650 : 4500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="rma-intro" role="dialog" aria-label="Review My Asset introduction">
      <button type="button" onClick={onComplete} className="rma-intro-skip">
        Skip intro
      </button>
      <div className="rma-intro-lockup" role="img" aria-label="Review My Asset">
        <div className="rma-intro-mark" aria-hidden="true">
          <svg viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect className="rma-intro-square" x="8" y="8" width="164" height="164" rx="3" fill="#328771" />
            <g className="rma-intro-bars">
              <rect className="rma-intro-bar rma-intro-bar-one" x="54" y="101" width="23" height="39" fill="white" />
              <rect className="rma-intro-bar rma-intro-bar-two" x="81" y="80" width="23" height="60" fill="white" />
              <rect className="rma-intro-bar rma-intro-bar-three" x="108" y="54" width="23" height="86" fill="white" />
            </g>
            <path className="rma-intro-ring" pathLength="1" d="M27.7 133A76 75 0 1 1 45.3 150.7" stroke="white" strokeWidth="5" strokeLinecap="round" />
            <path className="rma-intro-arrow" d="M45.3 169V150.7H63.6" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="rma-intro-name" aria-hidden="true">
          <span>Review</span>
          <span>My</span>
          <span>Asset</span>
        </div>
      </div>
    </div>
  );
}

function Onboarding({ user, onSave, onComplete, onLogout, onExplore, onClose }: { user: AppUser; onSave: (quick: QuickProfile, revision: number) => Promise<number>; onComplete: (quick: QuickProfile, revision: number) => Promise<number>; onLogout: () => void; onExplore: () => void; onClose: () => void }) {
  const [quick, setQuick] = useState<QuickProfile>(() => normaliseQuickProfile(user.quickProfile));
  const draftRevision = useRef(user.revision);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const step = Math.min(9, Math.max(1, quick.step));
  const quickStep = Math.min(7, Math.max(1, step - 1));
  const firstName = user.profile.fullName.split(" ")[0] || user.username;

  const updateQuick = (updates: Partial<QuickProfile>) => setQuick((current) => ({ ...current, ...updates }));
  const moveTo = async (nextStep: number, updates: Partial<QuickProfile> = {}) => {
    const next = { ...quick, ...updates, step: nextStep };
    if (saving) return;
    setSaving(true); setSaveError("");
    try { draftRevision.current = await onSave(next, draftRevision.current); setQuick(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (error) { setSaveError(friendlyError(error)); }
    finally { setSaving(false); }
  };
  const saveAndFinishLater = async () => {
    if (saving) return;
    setSaving(true); setSaveError("");
    try { draftRevision.current = await onSave(quick, draftRevision.current); onClose(); } catch (error) { setSaveError(friendlyError(error)); } finally { setSaving(false); }
  };
  const saveAndLogout = async () => {
    if (saving) return;
    setSaving(true); setSaveError("");
    try { draftRevision.current = await onSave(quick, draftRevision.current); onLogout(); }
    catch (error) { setSaveError(friendlyError(error)); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (JSON.stringify(quick) !== JSON.stringify(normaliseQuickProfile(user.quickProfile))) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [quick, user.quickProfile]);
  const finishProfile = async (completeMaster = false) => {
    if (saving) return;
    setSaving(true); setSaveError("");
    try { await onComplete(quick, draftRevision.current); if (completeMaster) onExplore(); else onClose(); } catch (error) { setSaveError(friendlyError(error)); } finally { setSaving(false); }
  };
  const setAsset = (key: QuickAssetKey, updates: Partial<QuickProfile["assets"][QuickAssetKey]>) => updateQuick({ assets: { ...quick.assets, [key]: { ...quick.assets[key], ...updates } } });
  const setLoan = (key: LoanKey, updates: Partial<QuickProfile["loans"][LoanKey]>) => updateQuick({ loans: { ...quick.loans, [key]: { ...quick.loans[key], ...updates } } });
  const setProtection = (key: ProtectionKey, updates: Partial<QuickProfile["protection"][ProtectionKey]>) => updateQuick({ protection: { ...quick.protection, [key]: { ...quick.protection[key], ...updates } } });
  const selectedAssets = quickAssetOptions.filter(({ key }) => quick.assets[key].selected);
  const selectedLoans = loanOptions.filter(({ key }) => quick.loans[key].selected);
  const answeredProtection = protectionOptions.filter(({ key }) => quick.protection[key].status);
  const familyEntriesComplete = quick.familyMembers.every((member) => member.relationship && member.age && Number(member.age) <= 120);
  const assetAmountsComplete = selectedAssets.every(({ key }) => quick.assets[key].amount > 0);
  const loanAnswerComplete = quick.noLoans || (selectedLoans.length > 0 && selectedLoans.every(({ key }) => quick.loans[key].outstanding > 0));
  const loanEmiTotal = Object.values(quick.loans).reduce((sum, loan) => sum + (loan.selected ? loan.monthlyEmi : 0), 0);
  const snapshotPortfolio = quickProfileToPortfolio(quick);
  const quickOther = quick.assets.businessOther.selected ? quick.assets.businessOther.amount : 0;
  const totalAssets = snapshotPortfolio.equity + snapshotPortfolio.fixedIncome + snapshotPortfolio.metals + snapshotPortfolio.property + quickOther;
  const protectionStatus = answeredProtection.length === 0 ? "Not added" : answeredProtection.length < protectionOptions.length ? "Partially added" : "Added";
  const aboutComplete = Boolean(quick.fullName.trim() && quick.dateOfBirth && quick.dateOfBirth <= new Date().toISOString().slice(0, 10) && quick.maritalStatus && quick.workStatus && (quick.workStatus !== "Working" || quick.workType) && quick.incomeRange);
  const profileCompleteness = Math.min(100, Math.round((
    6 +
    (aboutComplete ? 8 : 0) +
    ((quick.familySkipped || quick.familyMembers.length > 0) ? 4 : 0) +
    (selectedAssets.length > 0 ? 8 : 0) +
    ((quick.noLoans || selectedLoans.length > 0) ? 6 : 0) +
    (answeredProtection.length / protectionOptions.length) * 6 +
    (quick.householdIncome > 0 && quick.monthlyExpenses > 0 ? 6 : 0) +
    (quick.goals.length > 0 && quick.primaryGoal ? 6 : 0)
  ) * 2));

  const backButton = (target = step - 1) => (
    <Button type="button" variant="outline" onClick={() => moveTo(target)} className="h-12 rounded-xl border-[#d9e5e1] px-5 text-[#29463e]">
      <ArrowLeft className="size-4" /> Back
    </Button>
  );
  const finishLaterButton = () => (
    <Button type="button" variant="ghost" onClick={saveAndFinishLater} className="h-12 rounded-xl px-5 text-[#61736c] hover:bg-[#edf5f2] hover:text-[#29463e]">
      Save & Finish Later
    </Button>
  );
  const continueButton = (target: number, disabled = false, label = "Continue", updates: Partial<QuickProfile> = {}) => (
    <Button type="button" disabled={disabled} onClick={() => moveTo(target, updates)} className="h-12 rounded-xl bg-[#328771] px-6 font-bold hover:bg-[#286f5e]">
      {label} <ChevronRight className="size-4" />
    </Button>
  );
  const cardButton = (selected: boolean, onClick: () => void, emoji: string, label: string) => (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`relative min-h-28 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#328771]/15 ${selected ? "border-[#328771] bg-[#eaf4f0] shadow-[0_8px_20px_rgba(50,135,113,.09)]" : "border-[#dfe9e5] bg-white hover:border-[#a8c9bf] hover:bg-[#fbfdfc]"}`}>
      {selected && <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-[#328771] text-white"><Check className="size-3.5" /></span>}
      <span className="text-2xl" aria-hidden="true">{emoji}</span>
      <span className="mt-3 block pr-5 text-sm font-bold leading-5 text-[#29463e]">{label}</span>
    </button>
  );

  const shell = (content: React.ReactNode) => (
    <main className="min-h-dvh bg-[#edf3f0] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between"><Brand /><Button disabled={saving} variant="ghost" onClick={() => void saveAndLogout()} className="rounded-xl text-[#667670]"><LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span></Button></header>
        {saving && <p role="status" className="mt-5 text-sm text-[#328771]">Saving your progress…</p>}
        {saveError && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{saveError}</p>{saveError.includes("another device") && <Button variant="outline" className="mt-3" onClick={() => { if (window.confirm("Replace your draft with the latest saved version?")) { setQuick(normaliseQuickProfile(user.quickProfile)); draftRevision.current = user.revision; setSaveError(""); } }}>Load latest saved version</Button>}</div>}
        <fieldset disabled={saving} className="min-w-0">{content}</fieldset>
      </div>
    </main>
  );

  if (step === 1) return shell(
    <section className="mt-8 overflow-hidden rounded-[30px] border border-[#dfe9e5] bg-white shadow-[0_20px_60px_rgba(24,51,44,.09)] sm:mt-12">
      <div className="bg-[#173f34] px-6 py-8 text-white sm:px-10 sm:py-10">
        <p className="text-sm font-bold text-[#8bd0bc]">Welcome, {firstName}</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Let’s understand your complete financial picture.</h1>
      </div>
      <div className="grid gap-8 px-6 py-7 sm:px-10 sm:py-9 lg:grid-cols-[1fr_.85fr] lg:items-center">
        <div>
          <p className="text-base font-bold text-[#29463e]">Your Financial Profile can help you organise information about:</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {["Your family", "What you own", "What you owe", "Your insurance and protection", "Your income and expenses", "Your financial goals"].map((item) => <li key={item} className="flex items-center gap-3 text-[15px] text-[#536962]"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eaf4f0] text-[#328771]"><Check className="size-3.5" /></span>{item}</li>)}
          </ul>
          <p className="mt-7 rounded-2xl bg-[#fff8e9] px-4 py-3 text-sm leading-6 text-[#725b29]"><strong>You don’t have to complete everything today.</strong> You can save your progress and return at any time.</p>
        </div>
        <div className="grid gap-3 rounded-[24px] border border-[#e1eae7] bg-[#f8faf9] p-4 sm:p-5">
          <Button type="button" onClick={() => moveTo(2)} className="min-h-14 rounded-xl bg-[#328771] px-5 text-sm font-extrabold tracking-[0.02em] hover:bg-[#286f5e]">START WITH A QUICK PROFILE <ChevronRight className="size-4" /></Button>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-[#9aa59f]"><span className="h-px flex-1 bg-[#dfe7e4]" />or<span className="h-px flex-1 bg-[#dfe7e4]" /></div>
          <Button type="button" variant="outline" onClick={onExplore} className="min-h-14 whitespace-normal rounded-xl border-[#cfded9] bg-white px-5 text-sm font-extrabold tracking-[0.02em] text-[#29463e] hover:bg-[#edf5f2]">EXPLORE MY FINANCIAL PROFILE</Button>
        </div>
      </div>
    </section>,
  );

  let content: React.ReactNode;

  if (step === 2) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">Let’s start with you</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">We want to understand your current stage of life.</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Just the essentials for now.</p></div>
      <div className="grid gap-5 px-6 py-7 sm:grid-cols-2 sm:px-10 sm:py-9">
        <Field label="Full name"><Input maxLength={200} value={quick.fullName} onChange={(event) => updateQuick({ fullName: event.target.value })} placeholder="Your full name" className="h-12 rounded-xl border-[#dce7e3] px-4" /></Field>
        <Field label="Date of birth"><Input type="date" max={new Date().toISOString().slice(0, 10)} value={quick.dateOfBirth} onChange={(event) => updateQuick({ dateOfBirth: event.target.value })} className="h-12 rounded-xl border-[#dce7e3] px-4" /></Field>
        <Field label="Marital status"><Select value={quick.maritalStatus} onValueChange={(value) => updateQuick({ maritalStatus: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] px-4"><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent><SelectItem value="Single">Single</SelectItem><SelectItem value="Married">Married</SelectItem><SelectItem value="Separated / Divorced">Separated / Divorced</SelectItem><SelectItem value="Widowed">Widowed</SelectItem><SelectItem value="Prefer not to say">Prefer not to say</SelectItem></SelectContent></Select></Field>
        <Field label="Current work status"><Select value={quick.workStatus} onValueChange={(value) => updateQuick({ workStatus: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] px-4"><SelectValue placeholder="Working or retired" /></SelectTrigger><SelectContent><SelectItem value="Working">Working</SelectItem><SelectItem value="Retired">Retired</SelectItem><SelectItem value="Not currently working">Not currently working</SelectItem></SelectContent></Select></Field>
        <Field label="Employment background"><Select value={quick.workType} onValueChange={(value) => updateQuick({ workType: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] px-4"><SelectValue placeholder="Select one" /></SelectTrigger><SelectContent><SelectItem value="Employment">Employment</SelectItem><SelectItem value="Business">Business</SelectItem><SelectItem value="Professional">Professional</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></Field>
        <Field label="Approximate annual household income"><Select value={quick.incomeRange} onValueChange={(value) => updateQuick({ incomeRange: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] px-4"><SelectValue placeholder="Select a range" /></SelectTrigger><SelectContent><SelectItem value="Below ₹10 lakh">Below ₹10 lakh</SelectItem><SelectItem value="₹10–15 lakh">₹10–15 lakh</SelectItem><SelectItem value="₹15–25 lakh">₹15–25 lakh</SelectItem><SelectItem value="₹25–50 lakh">₹25–50 lakh</SelectItem><SelectItem value="₹50 lakh–1 crore">₹50 lakh–1 crore</SelectItem><SelectItem value="Above ₹1 crore">Above ₹1 crore</SelectItem></SelectContent></Select></Field>
        <div className="mt-2 grid gap-3 sm:col-span-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton(1)}{finishLaterButton()}{continueButton(3, !aboutComplete, "Save & Continue")}</div>
      </div>
    </>;
  } else if (step === 3) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">Your family</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">Who depends on you financially?</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Add only what you are comfortable sharing today.</p></div>
      <div className="px-6 py-7 sm:px-10 sm:py-9">
        <div className="grid gap-4">{quick.familyMembers.map((member, index) => <div key={member.id} className="rounded-2xl border border-[#dfe9e5] bg-[#fbfcfc] p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><p className="font-bold text-[#29463e]">Family member {index + 1}</p><Button type="button" variant="ghost" size="icon" onClick={() => updateQuick({ familyMembers: quick.familyMembers.filter((item) => item.id !== member.id) })} aria-label={`Remove family member ${index + 1}`} className="rounded-xl text-[#a26666] hover:bg-[#fff0f0]"><Trash2 className="size-4" /></Button></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Relationship"><Select value={member.relationship} onValueChange={(value) => updateQuick({ familyMembers: quick.familyMembers.map((item) => item.id === member.id ? { ...item, relationship: value } : item) })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] bg-white px-4"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="Spouse / Partner">Spouse / Partner</SelectItem><SelectItem value="Child">Child</SelectItem><SelectItem value="Parent">Parent</SelectItem><SelectItem value="Sibling">Sibling</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></Field><Field label="Age"><Input inputMode="numeric" value={member.age} onChange={(event) => updateQuick({ familyMembers: quick.familyMembers.map((item) => item.id === member.id ? { ...item, age: event.target.value.replace(/\D/g, "").slice(0, 3) } : item) })} placeholder="Age" className="h-12 rounded-xl border-[#dce7e3] bg-white px-4" /></Field><Field label="Financially dependent?"><div className="grid h-12 grid-cols-2 rounded-xl border border-[#dce7e3] bg-white p-1">{(["Yes", "No"] as const).map((value) => <button type="button" key={value} onClick={() => updateQuick({ familyMembers: quick.familyMembers.map((item) => item.id === member.id ? { ...item, financiallyDependent: value } : item) })} className={`rounded-lg text-sm font-bold ${member.financiallyDependent === value ? "bg-[#328771] text-white" : "text-[#687a73]"}`}>{value}</button>)}</div></Field></div></div>)}</div>
        <Button disabled={quick.familyMembers.length >= 10} type="button" variant="outline" onClick={() => updateQuick({ familyMembers: [...quick.familyMembers, { id: crypto.randomUUID(), relationship: "", age: "", financiallyDependent: "Yes" }], familySkipped: false })} className="mt-4 h-12 w-full rounded-xl border-dashed border-[#9fc5ba] bg-[#f6faf8] font-bold text-[#328771] hover:bg-[#eaf4f0]"><Plus className="size-4" /> Add Family Member</Button>
        <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">{backButton()}{finishLaterButton()}<Button type="button" variant="ghost" onClick={() => moveTo(4, { familySkipped: true })} className="h-12 rounded-xl px-5 text-[#61736c]">Skip for now</Button>{continueButton(4, !familyEntriesComplete, "Continue", { familySkipped: false })}</div>
      </div>
    </>;
  } else if (step === 4) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">What you own</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">Which of these do you own?</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Choose the relevant categories. Approximate figures are enough.</p></div>
      <div className="px-6 py-7 sm:px-10 sm:py-9">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{quickAssetOptions.map(({ key, label, emoji }) => <div key={key}>{cardButton(quick.assets[key].selected, () => setAsset(key, { selected: !quick.assets[key].selected }), emoji, label)}</div>)}</div>
        <div className="mt-6 grid gap-4">{selectedAssets.map(({ key, label }) => <div key={key} className="rounded-2xl border border-[#dfe9e5] bg-[#fbfcfc] p-4 sm:p-5"><div className="grid gap-4 sm:grid-cols-[1fr_240px] sm:items-start"><div><p className="font-bold text-[#29463e]">{label}</p><p className="mt-1 text-sm text-[#74857f]">Approximately how much do you have?</p></div><div><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82908b]" /><Input inputMode="numeric" value={quick.assets[key].amount || ""} onChange={(event) => setAsset(key, { amount: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#dce7e3] bg-white pl-9 text-right font-bold" /></div>{quick.assets[key].amount > 0 && <p className="mt-1.5 text-right text-xs font-semibold text-[#328771]">{formatINR(quick.assets[key].amount)}</p>}</div></div><div className="mt-4 border-t border-[#e6ecea] pt-4"><p className="text-sm font-semibold text-[#536962]">Would you like to add more details now?</p><div className="mt-3 flex flex-wrap gap-2">{([{ value: "details", label: "Add details" }, { value: "later", label: "Later" }] as const).map((choice) => <button type="button" key={choice.value} onClick={() => setAsset(key, { detailChoice: choice.value })} className={`rounded-full border px-4 py-2 text-sm font-bold ${quick.assets[key].detailChoice === choice.value ? "border-[#328771] bg-[#eaf4f0] text-[#286f5e]" : "border-[#d8e4e0] bg-white text-[#677972]"}`}>{choice.label}</button>)}</div>{quick.assets[key].detailChoice === "details" && <Textarea maxLength={1000} value={quick.assets[key].note} onChange={(event) => setAsset(key, { note: event.target.value })} placeholder="Optional note for your adviser. No scheme-level details needed yet." className="mt-3 min-h-20 rounded-xl border-[#dce7e3] bg-white px-4 py-3" />}</div></div>)}</div>
        <p className="mt-6 rounded-2xl bg-[#eaf4f0] px-4 py-3 text-sm font-bold text-[#286f5e]">You have added {selectedAssets.length} asset {selectedAssets.length === 1 ? "category" : "categories"}.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton()}{finishLaterButton()}{continueButton(5, !assetAmountsComplete)}</div>
      </div>
    </>;
  } else if (step === 5) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">What you owe</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">Do you currently have any loans or outstanding liabilities?</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Start with approximate balances. You can add full details later.</p></div>
      <div className="px-6 py-7 sm:px-10 sm:py-9">
        <button type="button" aria-pressed={quick.noLoans} onClick={() => updateQuick({ noLoans: !quick.noLoans, loans: !quick.noLoans ? createEmptyQuickProfile().loans : quick.loans })} className={`mb-5 flex w-full items-center gap-3 rounded-2xl border p-4 text-left font-bold ${quick.noLoans ? "border-[#328771] bg-[#eaf4f0] text-[#286f5e]" : "border-[#dfe9e5] bg-white text-[#405951]"}`}><span className={`grid size-6 place-items-center rounded-full border ${quick.noLoans ? "border-[#328771] bg-[#328771] text-white" : "border-[#b9c9c3]"}`}>{quick.noLoans && <Check className="size-3.5" />}</span>I don’t have any loans</button>
        {!quick.noLoans && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{loanOptions.map(({ key, label, emoji }) => <div key={key}>{cardButton(quick.loans[key].selected, () => setLoan(key, { selected: !quick.loans[key].selected }), emoji, label)}</div>)}</div><div className="mt-6 grid gap-4">{selectedLoans.map(({ key, label }) => <div key={key} className="rounded-2xl border border-[#f0d9d9] bg-[#fffafa] p-4 sm:p-5"><p className="font-bold text-[#713f3f]">{label}</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Approximate outstanding amount"><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9c7777]" /><Input inputMode="numeric" value={quick.loans[key].outstanding || ""} onChange={(event) => setLoan(key, { outstanding: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#ead4d4] bg-white pl-9 text-right font-bold" /></div>{quick.loans[key].outstanding > 0 && <p className="mt-1.5 text-right text-xs font-semibold text-[#b04444]">{formatINR(quick.loans[key].outstanding)}</p>}</Field><Field label="Monthly EMI (optional)"><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9c7777]" /><Input inputMode="numeric" value={quick.loans[key].monthlyEmi || ""} onChange={(event) => setLoan(key, { monthlyEmi: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#ead4d4] bg-white pl-9 text-right font-bold" /></div></Field></div></div>)}</div></>}
        <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton()}{finishLaterButton()}{continueButton(6, !loanAnswerComplete, "Continue", { monthlyEmi: loanEmiTotal })}</div>
      </div>
    </>;
  } else if (step === 6) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">Your protection</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">How are you and your family protected against financial risks?</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">A rough indication is enough for your Quick Profile.</p></div>
      <div className="grid gap-4 px-6 py-7 sm:px-10 sm:py-9">{protectionOptions.map(({ key, label, emoji }) => <div key={key} className="rounded-2xl border border-[#dfe6f3] bg-[#fbfcff] p-4 sm:p-5"><div className="flex items-center gap-3"><span className="text-2xl" aria-hidden="true">{emoji}</span><p className="font-bold text-[#29463e]">{label}</p></div><p className="mt-4 text-sm font-semibold text-[#536962]">Do you have this cover?</p><div className="mt-3 grid grid-cols-3 gap-2">{(["Yes", "No", "Not sure"] as const).map((status) => <button type="button" key={status} onClick={() => setProtection(key, { status, coverAmount: status === "Yes" ? quick.protection[key].coverAmount : 0 })} className={`min-h-10 rounded-xl border px-2 text-sm font-bold ${quick.protection[key].status === status ? "border-[#2f6fed] bg-[#edf3ff] text-[#2f5dbd]" : "border-[#d9e2ef] bg-white text-[#6e7d89]"}`}>{status}</button>)}</div>{quick.protection[key].status === "Yes" && <div className="mt-4 max-w-sm"><Label className="text-sm font-semibold text-[#536962]">Approximate cover amount</Label><div className="relative mt-2"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6f82a3]" /><Input inputMode="numeric" value={quick.protection[key].coverAmount || ""} onChange={(event) => setProtection(key, { coverAmount: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#d9e2ef] bg-white pl-9 text-right font-bold" /></div>{quick.protection[key].coverAmount > 0 && <p className="mt-1.5 text-right text-xs font-semibold text-[#2f6fed]">{formatINR(quick.protection[key].coverAmount)}</p>}</div>}</div>)}<div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton()}{finishLaterButton()}{continueButton(7)}</div></div>
    </>;
  } else if (step === 7) {
    const displayedEmi = quick.monthlyEmi;
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">Income & monthly commitments</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">Let’s build your initial cash-flow picture.</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Approximate household figures are fine.</p></div>
      <div className="grid gap-6 px-6 py-7 sm:px-10 sm:py-9">
        <div><Label className="text-sm font-semibold text-[#29463e]">Approximately how much does your household earn?</Label><div className="mt-2 grid gap-3 sm:grid-cols-[1fr_210px]"><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82908b]" /><Input inputMode="numeric" value={quick.householdIncome || ""} onChange={(event) => updateQuick({ householdIncome: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#dce7e3] pl-9 text-right font-bold" /></div><Select value={quick.incomeFrequency} onValueChange={(value: "monthly" | "annual") => updateQuick({ incomeFrequency: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] px-4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Per month</SelectItem><SelectItem value="annual">Per year</SelectItem></SelectContent></Select></div>{quick.householdIncome > 0 && <p className="mt-1.5 text-right text-xs font-semibold text-[#328771]">{formatINR(quick.householdIncome)} {quick.incomeFrequency === "monthly" ? "per month" : "per year"}</p>}</div>
        <Field label="Monthly living expenses, excluding EMIs and insurance premiums"><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82908b]" /><Input inputMode="numeric" value={quick.monthlyExpenses || ""} onChange={(event) => updateQuick({ monthlyExpenses: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#dce7e3] pl-9 text-right font-bold" /></div>{quick.monthlyExpenses > 0 && <p className="mt-1.5 text-right text-xs font-semibold text-[#328771]">{formatINR(quick.monthlyExpenses)} per month</p>}</Field>
        <Field label="How much of your monthly income goes towards EMIs?"><div className="relative"><IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#82908b]" /><Input inputMode="numeric" value={displayedEmi || ""} onChange={(event) => updateQuick({ monthlyEmi: numberFromInput(event.target.value) })} placeholder="0" className="h-12 rounded-xl border-[#dce7e3] pl-9 text-right font-bold" /></div>{loanEmiTotal > 0 && <p className="mt-1.5 text-sm text-[#72827c]">₹{new Intl.NumberFormat("en-IN").format(loanEmiTotal)} calculated from the loans you added.</p>}</Field>
        <div className="mt-1 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton()}{finishLaterButton()}{continueButton(8, false, "Continue", { monthlyEmi: displayedEmi })}</div>
      </div>
    </>;
  } else if (step === 8) {
    content = <>
      <div className="border-b border-[#e5ece9] px-6 py-7 sm:px-10 sm:py-9"><p className="text-sm font-bold text-[#328771]">Your goals</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">What would you like your money to help you achieve?</h1><p className="mt-3 text-[15px] leading-6 text-[#6e7e79]">Select all that matter. Detailed goal planning can come later.</p></div>
      <div className="px-6 py-7 sm:px-10 sm:py-9"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{goalOptions.map(({ label, emoji }) => <div key={label}>{cardButton(quick.goals.includes(label), () => { const goals = quick.goals.includes(label) ? quick.goals.filter((goal) => goal !== label) : [...quick.goals, label]; updateQuick({ goals, primaryGoal: goals.includes(quick.primaryGoal) ? quick.primaryGoal : "" }); }, emoji, label)}</div>)}</div>{quick.goals.length > 0 && <div className="mt-7 rounded-2xl border border-[#dfe9e5] bg-[#f8faf9] p-4 sm:p-5"><Field label="Which is most important to you right now?"><Select value={quick.primaryGoal} onValueChange={(value) => updateQuick({ primaryGoal: value })}><SelectTrigger className="h-12 w-full rounded-xl border-[#dce7e3] bg-white px-4"><SelectValue placeholder="Choose your top priority" /></SelectTrigger><SelectContent>{quick.goals.map((goal) => <SelectItem key={goal} value={goal}>{goal}</SelectItem>)}</SelectContent></Select></Field></div>}<div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{backButton()}{finishLaterButton()}{continueButton(9, !(quick.goals.length > 0 && quick.primaryGoal), "Create my snapshot")}</div></div>
    </>;
  } else {
    content = <div className="px-6 py-7 sm:px-10 sm:py-9"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-[#eaf4f0] text-[#328771]"><CheckCircle2 className="size-6" /></span><div><p className="text-sm font-bold text-[#328771]">Quick Profile complete</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[#18332c]">Your Financial Profile · First Snapshot</h1></div></div><div className="mt-7 grid gap-6 lg:grid-cols-[.95fr_1.05fr] lg:items-center"><div className="rounded-[24px] border border-[#dfe9e5] bg-[#f8faf9] p-3"><DonutChart portfolio={snapshotPortfolio} other={quickOther} /></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[#e1e9e6] bg-white p-4"><p className="text-xs font-semibold text-[#82908b]">Family</p><p className="mt-1 text-lg font-extrabold text-[#29463e]">{quick.familyMembers.length + 1} {quick.familyMembers.length === 0 ? "member" : "members"}</p></div><div className="rounded-2xl border border-[#e1e9e6] bg-white p-4"><p className="text-xs font-semibold text-[#82908b]">Approximate assets</p><p className="mt-1 text-lg font-extrabold text-[#29463e]">{formatCompactINR(totalAssets)}</p></div><div className="rounded-2xl border border-[#f0d9d9] bg-[#fffafa] p-4"><p className="text-xs font-semibold text-[#a26b6b]">Approximate liabilities</p><p className="mt-1 text-lg font-extrabold text-[#a93434]">{formatCompactINR(snapshotPortfolio.debt)}</p></div><div className="rounded-2xl border border-[#dce5f7] bg-[#f8faff] p-4"><p className="text-xs font-semibold text-[#7384a6]">Protection details</p><p className="mt-1 text-lg font-extrabold text-[#2f5dbd]">{protectionStatus}</p></div><div className="rounded-2xl border border-[#e1e9e6] bg-white p-4"><p className="text-xs font-semibold text-[#82908b]">Income</p><p className="mt-1 text-lg font-extrabold text-[#29463e]">{quick.householdIncome > 0 ? "Added" : "Not added"}</p></div><div className="rounded-2xl border border-[#e1e9e6] bg-white p-4"><p className="text-xs font-semibold text-[#82908b]">Goals identified</p><p className="mt-1 text-lg font-extrabold text-[#29463e]">{quick.goals.length}</p></div></div></div><div className="mt-7 rounded-[22px] bg-[#173f34] p-5 text-white sm:p-6"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-white/65">Quick Profile coverage</p><p className="mt-1 text-3xl font-semibold">{profileCompleteness}%</p></div><p className="max-w-sm text-right text-xs leading-5 text-white/60">Your Quick Profile is the beginning of your complete Financial Master File.</p></div><Progress value={profileCompleteness} className="mt-4 h-2.5 bg-white/15 [&_[data-slot=progress-indicator]]:bg-[#8bd0bc]" /></div><blockquote className="mt-7 border-l-4 border-[#d5a63d] pl-4 text-[15px] leading-7 text-[#536962]"><strong className="text-[#29463e]">This is your starting financial picture.</strong><br />The more information you add over time, the more complete your Financial Master File becomes.</blockquote><div className="mt-7 grid gap-3 sm:grid-cols-2"><Button type="button" onClick={() => void finishProfile(true)} className="min-h-12 rounded-xl bg-[#328771] font-bold hover:bg-[#286f5e]">COMPLETE MY MASTER FILE <ChevronRight className="size-4" /></Button><Button type="button" variant="outline" onClick={() => void finishProfile()} className="min-h-12 rounded-xl border-[#cfded9] font-bold text-[#29463e] hover:bg-[#edf5f2]">FINISH FOR NOW</Button></div></div>;
  }

  return shell(
    <section className="mt-8 overflow-hidden rounded-[30px] border border-[#dfe9e5] bg-white shadow-[0_20px_60px_rgba(24,51,44,.08)] sm:mt-12">
      <div className="border-b border-[#e5ece9] bg-[#fbfcfc] px-6 py-4 sm:px-10"><div className="flex items-center justify-between gap-4"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#328771]">Quick Profile · Step {quickStep} of 7</p><p className="text-xs font-semibold text-[#89958f]">Progress saves as you continue</p></div><Progress value={(quickStep / 7) * 100} className="mt-3 h-1.5 bg-[#dfe9e5]" /></div>
      {content}
    </section>,
  );
}

function AppHeader({ name, onLogout, preview, onBack }: { name: string; onLogout: () => void; preview?: boolean; onBack?: () => void }) {
  return (
    <>
      {preview && <div className="bg-[#173f34] px-4 py-2.5 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 text-sm"><span className="font-medium">Viewing the client experience</span><Button onClick={onBack} variant="ghost" size="sm" className="h-8 text-white hover:bg-white/10 hover:text-white"><ArrowLeft className="size-4" /> Return to adviser</Button></div></div>}
      <header className="border-b border-[#dfe9e5] bg-white/90 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><Brand /><div className="flex items-center gap-2 sm:gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-bold text-[#29463e]">{name}</p><p className="text-xs text-[#81908a]">My account</p></div><div className="grid size-10 place-items-center rounded-full bg-[#e7f2ee] font-bold text-[#328771]">{name.charAt(0)}</div>{!preview && <Button onClick={onLogout} variant="ghost" size="icon" aria-label="Sign out" className="rounded-xl text-[#72817c] hover:bg-[#eef5f2]"><LogOut className="size-4" /></Button>}</div></div></header>
    </>
  );
}

function DonutChart({ portfolio, compact = false, other = 0 }: { portfolio: Portfolio; compact?: boolean; other?: number }) {
  const chartData = [...categories.filter(category => !["debt", "insurance"].includes(category.key)).map(category => ({ name: category.label, value: portfolio[category.key], color: category.color })), { name: "Business / other assets", value: other, color: "#678d94" }];
  const hasData = chartData.some((item) => item.value > 0);
  const data = hasData ? chartData.filter((item) => item.value > 0) : [{ name: "No figures yet", value: 1, color: "#e3ebe8" }];
  return (
    <div className={`relative mx-auto ${compact ? "h-48 w-48" : "h-[270px] w-full max-w-[320px] sm:h-[300px]"}`}>
      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={compact ? 56 : 82} outerRadius={compact ? 84 : 118} paddingAngle={hasData ? 2 : 0} stroke="none" cornerRadius={4}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie>{hasData && <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={{ borderRadius: 12, borderColor: "#dfe9e5", boxShadow: "0 10px 30px rgba(24,51,44,.1)", fontSize: 13 }} />}</PieChart></ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#82908b]">Assets</p><p className={`${compact ? "text-xl" : "text-2xl"} mt-1 font-extrabold tracking-[-0.04em] text-[#18332c]`}>{hasData ? `${chartData.filter(a => a.value > 0).length} categories` : "Add figures"}</p></div></div>
    </div>
  );
}

function ClientDashboard({ user, onLogout, preview = false, onBack, onFile, onQuick }: { user: AppUser; onLogout: () => void; preview?: boolean; onBack?: () => void; onFile?: (section?: FileSection) => void; onQuick?: () => void }) {
  const totals = financialTotals(user);
  const { assets, netWorth } = totals;
  const progress = fileProgress(user);
  const firstName = user.profile.fullName.split(" ")[0] || user.username;
  return (
    <main className="min-h-dvh bg-[#f2f5f4]">
      <AppHeader name={user.profile.fullName || user.username} onLogout={onLogout} preview={preview} onBack={onBack} />
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#328771]">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#18332c] sm:text-4xl">Hello, {firstName}</h1><p className="mt-2 text-[15px] text-[#70807a]">Your saved financial picture, ready to update whenever life changes.</p></div>{!preview && <Button onClick={() => onFile?.("assets")} className="h-11 rounded-xl bg-[#328771] px-5 font-bold hover:bg-[#286f5e]"><PencilLine className="size-4" /> Update figures</Button>}</section>
        {!preview && <section className="mt-6 rounded-2xl border border-[#dfe9e5] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-[#29463e]">{progress.reviewed ? "Your Master File is complete" : "Build your Financial Master File"}</h2><p className="mt-2 text-sm text-[#70807a]">{progress.completed.length} of 7 sections confirmed · {progress.percent}% complete</p></div><div className="flex flex-wrap gap-2">{onQuick && <Button variant="outline" onClick={onQuick}>{user.onboardingComplete ? "Edit Quick Profile" : "Continue Quick Profile"}</Button>}<Button className="bg-[#328771]" onClick={() => onFile?.()}>{progress.reviewed ? "View / edit Master File" : "Continue full setup"}<ChevronRight className="size-4" /></Button></div></div><Progress className="mt-4" value={progress.percent} /></section>}
        <section className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <article className="rounded-[26px] border border-[#dfe9e5] bg-white p-5 shadow-[0_12px_35px_rgba(24,51,44,.055)] sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#29463e]">Financial snapshot</p><p className="mt-1 text-xs text-[#84918c]">Updated {formatDate(user.updatedAt)}</p></div><div className="rounded-full bg-[#e9f4f0] px-3 py-1.5 text-xs font-bold text-[#328771]">{progress.reviewed ? "Reviewed" : "Your saved estimates"}</div></div><div className="mt-3 grid items-center gap-2 md:grid-cols-[1fr_.95fr]"><DonutChart portfolio={user.portfolio} other={totals.other} /><div className="grid grid-cols-2 gap-x-5 gap-y-4">{categories.map((category) => <div key={category.key} className="min-w-0 border-b border-[#edf1f0] pb-3"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} /><span className="truncate text-xs font-semibold text-[#75847f]">{category.shortLabel}</span></div><p className="mt-1.5 truncate text-sm font-extrabold text-[#29463e]">{formatCompactINR(user.portfolio[category.key])}</p></div>)}</div></div></article>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <article className="relative overflow-hidden rounded-[26px] bg-[#173f34] p-6 text-white shadow-[0_16px_40px_rgba(23,63,52,.16)] sm:p-7"><div className="absolute -right-7 -top-10 size-36 rounded-full border-[24px] border-white/[.04]" /><div className="flex items-center justify-between"><p className="text-sm font-semibold text-white/65">Estimated net worth</p><WalletCards className="size-5 text-[#8bd0bc]" /></div><p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{formatCompactINR(netWorth)}</p><p className="mt-2 text-xs text-white/55">Assets minus outstanding debt</p></article>
            <div className="grid grid-cols-2 gap-4"><article className="rounded-[22px] border border-[#dfe9e5] bg-white p-5 shadow-[0_10px_28px_rgba(24,51,44,.05)]"><div className="grid size-9 place-items-center rounded-xl bg-[#eaf4f0] text-[#328771]"><Coins className="size-[18px]" /></div><p className="mt-5 text-xs font-semibold text-[#82908b]">Total assets</p><p className="mt-1.5 text-lg font-extrabold tracking-[-0.03em] text-[#29463e]">{formatCompactINR(assets)}</p></article><article className="rounded-[22px] border border-[#dfe9e5] bg-white p-5 shadow-[0_10px_28px_rgba(24,51,44,.05)]"><div className="grid size-9 place-items-center rounded-xl bg-[#edf3ff] text-[#2f6fed]"><ShieldCheck className="size-[18px]" /></div><p className="mt-5 text-xs font-semibold text-[#82908b]">Insurance cover</p><p className="mt-1.5 text-lg font-extrabold tracking-[-0.03em] text-[#29463e]">{formatCompactINR(user.portfolio.insurance)}</p></article></div>
            <article className="rounded-[22px] border border-[#f0d9d9] bg-[#fffafa] p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold text-[#a26b6b]">Outstanding debt</p><p className="mt-1.5 text-xl font-extrabold tracking-[-0.03em] text-[#a93434]">{formatCompactINR(user.portfolio.debt)}</p></div><div className="grid size-10 place-items-center rounded-xl bg-[#ffeded] text-[#d64545]"><CreditCard className="size-5" /></div></div></article>
          </div>
        </section>
        <section className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6 shadow-[0_10px_30px_rgba(24,51,44,.045)] sm:p-7"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#fff7e8] text-[#b7831e]"><Target className="size-5" /></div><div><h2 className="font-bold text-[#29463e]">Your primary goal</h2><p className="text-xs text-[#82908b]">The reason behind the numbers</p></div></div><p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#526861]">{user.profile.primaryGoal || "Add your financial goal in your Master File."}</p></article><article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6 shadow-[0_10px_30px_rgba(24,51,44,.045)] sm:p-7"><h2 className="font-bold text-[#29463e]">Planning context</h2><div className="mt-5 grid gap-4"><div className="flex items-center gap-3"><Clock3 className="size-4 text-[#328771]" /><div><p className="text-xs text-[#82908b]">Timeframe</p><p className="text-sm font-bold text-[#405951]">{user.profile.horizon || "Not provided"}</p></div></div><div className="flex items-center gap-3"><TrendingUp className="size-4 text-[#328771]" /><div><p className="text-xs text-[#82908b]">Risk comfort</p><p className="text-sm font-bold text-[#405951]">{user.profile.riskComfort || "Not provided"}</p></div></div></div></article></section>
        <section className="mt-5 grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-[#dfe9e5] bg-white p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-[#29463e]">Monthly cash flow</h2>{!preview && <Button variant="ghost" size="sm" onClick={() => onFile?.("cashflow")}>Edit</Button>}</div><div className="mt-4 grid grid-cols-2 gap-4 text-sm text-[#70807a]"><p>Income<br /><strong className="text-[#29463e]">{formatINR(totals.income)}</strong></p><p>Living expenses<br /><strong className="text-[#29463e]">{formatINR(totals.expenses)}</strong></p><p>Loan repayments<br /><strong className="text-[#29463e]">{formatINR(totals.emi)}</strong></p><p>Insurance premiums<br /><strong className="text-[#29463e]">{formatINR(totals.premiums)}</strong></p></div><p className="mt-5 border-t border-[#e5ece9] pt-4 text-sm text-[#70807a]">Estimated monthly surplus / shortfall <strong className={totals.surplus < 0 ? "text-red-700" : "text-[#328771]"}>{formatINR(totals.surplus)}</strong></p></article><article className="rounded-2xl border border-[#dfe9e5] bg-white p-6"><h2 className="font-bold text-[#29463e]">Business / other assets</h2><p className="mt-4 text-2xl font-bold text-[#29463e]">{formatCompactINR(totals.other)}</p><p className="mt-3 text-sm leading-6 text-[#70807a]">Included in total assets and net worth. Cash and bank balances are included with fixed income.</p></article></section>
        {preview && <FinancialFileSummary user={user} />}
        <p className="mx-auto mt-7 max-w-xl text-center text-xs leading-5 text-[#8a9692]">Insurance cover and debt are shown alongside your investments for context. They are not counted as assets in estimated net worth.</p>
      </div>
    </main>
  );
}

function ProfileDetails({ user }: { user: AppUser }) {
  const details = [
    { icon: Mail, label: "Email", value: user.profile.email }, { icon: Phone, label: "Phone", value: user.profile.phone },
    { icon: MapPin, label: "Location", value: user.profile.city }, { icon: Building2, label: "Occupation", value: user.profile.occupation },
    { icon: CalendarDays, label: "Date of birth", value: user.profile.dateOfBirth ? formatDate(user.profile.dateOfBirth) : "Not provided" },
    { icon: UsersRound, label: "Household", value: `${user.profile.maritalStatus || "Not provided"} · ${user.profile.dependants || "0"} dependants` },
    { icon: Coins, label: "Household income", value: user.profile.incomeRange || "Not provided" },
    { icon: TrendingUp, label: "Risk comfort", value: user.profile.riskComfort || "Not provided" },
  ];
  return <div className="grid gap-x-7 gap-y-5 sm:grid-cols-2">{details.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-start gap-3"><div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf5f2] text-[#328771]"><Icon className="size-4" /></div><div className="min-w-0"><p className="text-xs font-semibold text-[#87938f]">{label}</p><p className="mt-1 break-words text-sm font-bold text-[#405951]">{value}</p></div></div>)}</div>;
}

function AdviserDashboard({ users, onLogout, onPreview }: { users: AppUser[]; onLogout: () => void; onPreview: (id: string) => void }) {
  const clients = users.filter((user) => user.role === "client");
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const selected = clients.find((client) => client.id === selectedId) ?? clients[0];
  const filtered = clients.filter((client) => `${client.profile.fullName} ${client.username} ${client.profile.email}`.toLowerCase().includes(query.toLowerCase()));
  if (!selected) return <main className="min-h-dvh bg-[#f2f5f4]"><AppHeader name="Anubha Nadgouda" onLogout={onLogout} /><div className="mx-auto max-w-5xl px-6 py-20 text-center"><UsersRound className="mx-auto size-10 text-[#328771]" /><h1 className="mt-4 text-2xl font-bold text-[#18332c]">No clients yet</h1><p className="mt-2 text-[#70807a]">Invite your first client to get started.</p><InvitationPanel /></div></main>;
  const totalManaged = clients.reduce((sum, client) => sum + financialTotals(client).assets, 0);
  const selectedAssets = financialTotals(selected).assets;
  return (
    <main className="min-h-dvh bg-[#f2f5f4]">
      <AppHeader name="Anubha Nadgouda" onLogout={onLogout} />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#328771]">Adviser workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#18332c] sm:text-4xl">Welcome, Anubha</h1><p className="mt-2 text-[15px] text-[#70807a]">A clear view of every client, in one place.</p></div><div className="flex gap-3"><div className="rounded-2xl border border-[#dfe9e5] bg-white px-5 py-3"><p className="text-xs font-semibold text-[#82908b]">Clients</p><p className="mt-1 text-xl font-extrabold text-[#29463e]">{clients.length}</p></div><div className="hidden rounded-2xl bg-[#173f34] px-5 py-3 text-white sm:block"><p className="text-xs font-semibold text-white/55">Assets tracked</p><p className="mt-1 text-xl font-extrabold">{formatCompactINR(totalManaged)}</p></div></div></section>
        <InvitationPanel />
        <Button onClick={() => setMobileListOpen(true)} variant="outline" className="mt-7 h-12 w-full justify-between rounded-xl border-[#d9e5e1] bg-white px-4 lg:hidden"><span className="flex items-center gap-2"><Menu className="size-4 text-[#328771]" /> Choose a client</span><span className="text-[#6f817a]">{selected.profile.fullName}</span></Button>
        <section className="mt-7 grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="hidden h-fit overflow-hidden rounded-[24px] border border-[#dfe9e5] bg-white shadow-[0_10px_30px_rgba(24,51,44,.05)] lg:block"><div className="border-b border-[#e7eeeb] p-4"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b9793]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search clients" placeholder="Search clients" className="h-11 rounded-xl border-[#dce7e3] bg-[#f8faf9] pl-9" /></div></div><div className="max-h-[620px] overflow-y-auto p-2">{filtered.length === 0 && <p role="status" className="p-3 text-sm text-[#70807a]">No clients match your search.</p>}{filtered.map((client) => <button key={client.id} onClick={() => setSelectedId(client.id)} className={`flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition ${client.id === selected.id ? "bg-[#eaf4f0]" : "hover:bg-[#f5f8f7]"}`}><div className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${client.id === selected.id ? "bg-[#328771] text-white" : "bg-[#e8eeec] text-[#5e706a]"}`}>{client.profile.fullName.charAt(0)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#29463e]">{client.profile.fullName}</p><p className="mt-0.5 truncate text-xs text-[#82908b]">Updated {formatDate(client.updatedAt)}</p></div><ChevronRight className={`size-4 ${client.id === selected.id ? "text-[#328771]" : "text-[#acb5b1]"}`} /></button>)}</div></aside>
          <div className="grid gap-5">
            <article className="overflow-hidden rounded-[26px] border border-[#dfe9e5] bg-white shadow-[0_12px_35px_rgba(24,51,44,.05)]"><div className="flex flex-col justify-between gap-5 border-b border-[#e5ece9] p-6 sm:flex-row sm:items-center sm:p-8"><div className="flex items-center gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-xl font-extrabold text-[#328771]">{selected.profile.fullName.charAt(0)}</div><div><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#18332c]">{selected.profile.fullName}</h2><p className="mt-1 text-sm text-[#7d8b86]">@{selected.username} · {selected.onboardingComplete ? "Profile saved" : "Profile in progress"}</p></div></div><Button onClick={() => onPreview(selected.id)} className="h-11 rounded-xl bg-[#328771] px-5 font-bold hover:bg-[#286f5e]">View as client <ChevronRight className="size-4" /></Button></div><div className="p-6 sm:p-8"><h3 className="mb-6 text-sm font-bold uppercase tracking-[0.12em] text-[#82908b]">Client information</h3><ProfileDetails user={selected} /></div></article>
            <AdviserClientFile key={`file-${selected.id}`} clientId={selected.id} updatedAt={selected.updatedAt} />
            <PrivateNotes key={selected.id} clientId={selected.id} />
            <div className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
              <article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6 shadow-[0_10px_30px_rgba(24,51,44,.045)]"><div className="flex items-center justify-between"><div><h3 className="font-bold text-[#29463e]">Portfolio overview</h3><p className="mt-1 text-xs text-[#82908b]">Updated {formatDate(selected.updatedAt)}</p></div><p className="text-right"><span className="block text-xs text-[#82908b]">Net worth</span><span className="text-lg font-extrabold text-[#29463e]">{formatCompactINR(selectedAssets - selected.portfolio.debt)}</span></p></div><div className="mt-2 grid items-center sm:grid-cols-[190px_1fr]"><DonutChart portfolio={selected.portfolio} compact other={financialTotals(selected).other} /><div className="grid grid-cols-2 gap-3">{categories.map((category) => <div key={category.key}><div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: category.color }} /><p className="truncate text-xs text-[#7d8b86]">{category.shortLabel}</p></div><p className="mt-1 truncate text-sm font-bold text-[#405951]">{formatCompactINR(selected.portfolio[category.key])}</p></div>)}</div></div></article>
              <article className="rounded-[24px] border border-[#dfe9e5] bg-white p-6 shadow-[0_10px_30px_rgba(24,51,44,.045)]"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#fff7e8] text-[#b7831e]"><Target className="size-5" /></div><div><h3 className="font-bold text-[#29463e]">Goal and planning context</h3><p className="text-xs text-[#82908b]">What matters to this client</p></div></div><p className="mt-5 text-[15px] leading-7 text-[#526861]">{selected.profile.primaryGoal || "Not provided"}</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f3f7f5] p-4"><p className="text-xs text-[#82908b]">Timeframe</p><p className="mt-1 text-sm font-bold text-[#405951]">{selected.profile.horizon || "Not provided"}</p></div><div className="rounded-xl bg-[#f3f7f5] p-4"><p className="text-xs text-[#82908b]">Risk comfort</p><p className="mt-1 text-sm font-bold text-[#405951]">{selected.profile.riskComfort || "Not provided"}</p></div></div></article>
            </div>
          </div>
        </section>
      </div>
      <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}><SheetContent className="overflow-y-auto bg-white"><SheetHeader><SheetTitle>Choose a client</SheetTitle><SheetDescription>Search by name or email to open a saved profile.</SheetDescription></SheetHeader><div className="px-3 pb-6"><Input aria-label="Search clients" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" className="mb-3" />{filtered.length === 0 && <p role="status" className="p-3 text-sm text-[#70807a]">No clients match your search.</p>}{filtered.map(client => <button key={client.id} onClick={() => { setSelectedId(client.id); setMobileListOpen(false); }} className="flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:bg-[#f1f6f4]"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f2ee] font-bold text-[#328771]">{client.profile.fullName.charAt(0)}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-[#29463e]">{client.profile.fullName}</p><p className="mt-0.5 break-all text-xs text-[#82908b]">{client.profile.email}</p></div></button>)}</div></SheetContent></Sheet>

    </main>
  );
}

export default function ReviewMyAssetApp() {
  const [emailActionLink, setEmailActionLink] = useState("");
  const [identity, setIdentity] = useState<User | null>(null);
  const [verified, setVerified] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [previewClient, setPreviewClient] = useState<AppUser | null>(null);
  const [view, setView] = useState<"auto" | "home" | "quick" | "file">("auto");
  const [fileSection, setFileSection] = useState<FileSection | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [connectionWarning, setConnectionWarning] = useState("");
  const revision = useRef(0);
  const clientCache = useRef<AppUser | null>(null);
  const saving = useRef(false);
  const adviser = Boolean(identity && verified && identity.email?.toLowerCase() === ADVISER_EMAIL);
  useEffect(() => {
    const emailAction = window.location.pathname === "/auth/action" || new URLSearchParams(window.location.search).has("oobCode");
    if (emailAction) setEmailActionLink(window.location.href);
    try { window.localStorage.removeItem(STORAGE_KEY); window.localStorage.removeItem(SESSION_KEY); window.sessionStorage.removeItem(SESSION_KEY); } catch { /* Browser storage may be disabled. */ }
    const queryInvite = new URLSearchParams(window.location.search).get("invite");
    const pending = queryInvite ?? sessionValue("rma-pending-invitation") ?? "";
    if (/^[a-f0-9]{64}$/.test(pending)) { setInviteId(pending); saveSessionValue("rma-pending-invitation", pending); }
    return onAuthStateChanged(firebaseServices().auth, user => {
      clientCache.current = null; setIdentity(user); setVerified(Boolean(user?.emailVerified)); setUsers([]); setCurrentUser(null); setPreviewClient(null); setView("auto"); setError(""); setConnectionWarning("");
      setShowIntro(!emailAction && !user && sessionValue(INTRO_SEEN_KEY) !== "1"); setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!identity || !verified || emailActionLink) return;
    let active = true;
    let fetching = false;
    setLoading(true); setError("");
    const load = async (initial = false) => {
      if (fetching || saving.current || (!initial && document.hidden)) return;
      fetching = true;
      try {
        if (adviser) { const records = await readClients(); if (active) setUsers(records); }
        else {
          let record = await readClient(identity.uid, undefined, clientCache.current ?? undefined);
          if (!record && inviteId) {
            await acceptInvitation(identity, inviteId, { id: identity.uid, username: identity.email!.split("@")[0], role: "client", inviteId, revision: 0, onboardingComplete: false, quickProfile: createEmptyQuickProfile(), profile: { ...emptyProfile, email: identity.email! }, portfolio: { ...emptyPortfolio }, updatedAt: new Date().toISOString() });
            record = await readClient(identity.uid);
          }
          if (!record) throw new Error("An invitation from Anubha is required. Open your invitation link and sign in using the invited email.");
          if (active) { clientCache.current = record; setCurrentUser(record); revision.current = record.revision; }
        }
        if (active) {
          setError(""); setConnectionWarning("");
          if (inviteId) {
            saveSessionValue("rma-pending-invitation", "");
            const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete("invite");
            window.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
            setInviteId("");
          }
        }
      } catch (error) { if (active) { if (initial || (error as { code?: string }).code === "permission-denied") setError(friendlyError(error)); else setConnectionWarning("Connection interrupted. Your unsaved edits are still here. Please reconnect before saving."); if ((error as { code?: string }).code === "permission-denied") { setCurrentUser(null); setUsers([]); } } }
      finally { fetching = false; if (active) setLoading(false); }
    };
    void load(true);
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [identity, verified, adviser, inviteId, refresh, emailActionLink]);
  const logout = async () => { await signOut(firebaseServices().auth); setUsers([]); setCurrentUser(null); };
  const updateUser = async (updates: Partial<AppUser>, expectedRevision = revision.current) => {
    if (!identity || saving.current) throw new Error("A save is already in progress. Please wait.");
    saving.current = true;
    try { const saved = await saveClient(identity.uid, updates, expectedRevision); clientCache.current = saved; setCurrentUser(saved); revision.current = saved.revision; return saved.revision; }
    catch (error) {
      if (error instanceof Error && error.message.includes("another device")) {
        try { const latest = await readClient(identity.uid); if (latest) { clientCache.current = latest; setCurrentUser(latest); revision.current = latest.revision; } } catch { /* Keep the draft and original conflict message if the refresh fails. */ }
      }
      throw error;
    }
    finally { saving.current = false; }
  };
  const completeIntro = () => { saveSessionValue(INTRO_SEEN_KEY, "1"); setShowIntro(false); };
  const authScreen = <AuthScreen brand={<Brand />} inviteId={inviteId} />;
  if (!ready) return <main className="min-h-dvh bg-white" />;
  if (emailActionLink) return <EmailActionScreen link={emailActionLink} brand={<Brand />} />;
  if (showIntro) return <><div className="rma-login-underlay">{authScreen}</div><IntroScreen onComplete={completeIntro} /></>;
  if (!identity) return authScreen;
  if (!verified) return <VerificationScreen user={identity} inviteId={inviteId} onLogout={logout} onVerified={() => { setVerified(true); setRefresh(value => value + 1); }} />;
  if (loading && !currentUser && users.length === 0) return <main className="grid min-h-dvh place-items-center bg-[#edf3f0]"><p role="status" className="text-[#29463e]">Opening your securely saved profile…</p></main>;
  if (error) return <main className="min-h-dvh bg-[#edf3f0] px-4 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-7"><Brand /><h1 className="mt-8 text-2xl font-bold text-[#18332c]">Let’s check your access</h1><p role="alert" className="mt-4 text-sm leading-6 text-[#6e7e79]">{error}</p><div className="mt-6 grid gap-3"><Button onClick={() => setRefresh(value => value + 1)}>Try again</Button><Button variant="outline" onClick={() => void logout()}>Sign out</Button></div></section></main>;
  const withConnection = (content: React.ReactNode) => <>{connectionWarning && <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-xl bg-[#fff8e9] p-4 text-sm text-[#725b29] shadow-lg">{connectionWarning}</div>}{content}</>;
  const openFile = (section?: FileSection) => { setFileSection(section ?? null); setView("file"); };
  if (adviser) {
    if (previewClient) return withConnection(<ClientDashboard user={previewClient} preview onBack={() => setPreviewClient(null)} onLogout={() => void logout()} />);
    return withConnection(<AdviserDashboard users={users} onLogout={() => void logout()} onPreview={id => { void readClient(id).then(setPreviewClient).catch(error => setConnectionWarning(friendlyError(error))); }} />);
  }
  if (!currentUser) return <main className="min-h-dvh bg-[#edf3f0]" />;
  if (view === "file") return withConnection(<FinancialMasterFile user={currentUser} brand={<Brand />} initialSection={fileSection} onClose={() => setView("home")} onSave={updateUser} />);
  if (view === "quick" || (view === "auto" && !currentUser.onboardingComplete && !Object.keys(currentUser.financialFile ?? {}).length)) return withConnection(<Onboarding user={currentUser} onLogout={() => void logout()} onClose={() => setView("home")} onExplore={() => openFile()} onSave={async (quickProfile, expectedRevision) => updateUser({ quickProfile, profile: quickProfileToProfile(quickProfile, currentUser.profile), portfolio: quickProfileToPortfolio(quickProfile) }, expectedRevision)} onComplete={async (quickProfile, expectedRevision) => updateUser({ quickProfile, profile: quickProfileToProfile(quickProfile, currentUser.profile), portfolio: quickProfileToPortfolio(quickProfile), onboardingComplete: true }, expectedRevision)} />);
  const hasDetailedRecords = Object.keys(currentUser.financialFile ?? {}).length > 0;
  return withConnection(<ClientDashboard user={currentUser} onLogout={() => void logout()} onFile={openFile} onQuick={hasDetailedRecords ? undefined : () => setView("quick")} />);

}

function VerificationScreen({ user, inviteId, onLogout, onVerified }: { user: User; inviteId: string; onLogout: () => Promise<void>; onVerified: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showLinkEntry, setShowLinkEntry] = useState(false);
  const [emailLink, setEmailLink] = useState("");
  const verifyCopiedLink = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await verifyEmailLink(firebaseServices().auth, emailLink, user.email ?? undefined); setEmailLink(""); onVerified(); }
    catch (error) { setError(emailActionError(error)); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setError("");
    try { await reload(user); await user.getIdToken(true); if (user.emailVerified) onVerified(); else setMessage("Your email is not verified yet. Open the verification link in your inbox, then check again."); }
    catch (error) { setError(friendlyError(error)); } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError("");
    try { await sendEmailVerification(user, { url: CLIENT_APP_URL + (inviteId ? `/?invite=${inviteId}` : "/") }); setMessage("Verification email sent. Check your inbox and spam folder."); }
    catch (error) { setError(friendlyError(error)); } finally { setBusy(false); }
  };
  return <main className="min-h-dvh bg-[#edf3f0] px-4 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-7"><Brand /><h1 className="mt-8 text-2xl font-bold text-[#18332c]">Verify your email</h1><p className="mt-4 break-words text-sm leading-6 text-[#6e7e79]">Open the verification email sent to <strong>{user.email}</strong>. Then return here to continue.</p>{message && <p role="status" className="mt-4 text-sm text-[#328771]">{message}</p>}{error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}<div className="mt-7 grid gap-3"><Button disabled={busy} onClick={check} className="h-12 bg-[#328771]">I’ve verified my email</Button><Button disabled={busy} variant="outline" onClick={resend}>Resend verification email</Button><Button disabled={busy} variant="ghost" onClick={() => setShowLinkEntry(v => !v)}>Email link not opening?</Button><Button disabled={busy} variant="ghost" onClick={() => void onLogout()}>Sign out</Button></div>{showLinkEntry && <form onSubmit={verifyCopiedLink} className="mt-6 grid gap-3 border-t border-[#dfe9e5] pt-5"><Label htmlFor="email-verification-link">Paste the complete verification link from your email</Label><Textarea id="email-verification-link" value={emailLink} onChange={e => setEmailLink(e.target.value)} disabled={busy} required maxLength={6000} className="min-h-28 break-all" placeholder="Long-press the link in your email, copy it, and paste it here" /><p className="text-xs leading-5 text-[#6e7e79]">Firebase will check the original email code. Your sign-in email must match the recipient.</p><Button disabled={busy} type="submit" className="min-h-12 bg-[#328771]">Verify using email link</Button></form>}</section></main>;
}
