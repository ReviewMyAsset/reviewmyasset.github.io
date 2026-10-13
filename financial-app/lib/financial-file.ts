import type { AppUser, Portfolio, QuickProfile } from "../app/review-my-asset-app";

export const sectionIds = ["about", "family", "assets", "loans", "protection", "cashflow", "goals", "review"] as const;
export type FileSection = typeof sectionIds[number];
export const MAX_RECORDS = 12;
export const MAX_AMOUNT = 1_000_000_000_000;
export const assetTypes = { equity: "Equity / mutual funds", fixedIncome: "Fixed income", cash: "Cash / bank balance", metals: "Gold / silver", property: "Real estate", vehicle: "Vehicle", business: "Business", other: "Other asset" };
export const loanTypes = { home: "Home loan", vehicle: "Vehicle loan", creditCard: "Credit card", education: "Education loan", business: "Business loan", other: "Other liability" };
export const policyTypes = { life: "Life insurance", health: "Health insurance", accident: "Accident / disability", property: "Property insurance", vehicle: "Vehicle insurance" };
export const goalCategories = ["Children’s Education", "Children’s Marriage", "Buy / Upgrade Home", "Travel", "Major Purchase", "Retirement", "Business", "Family Security", "Financial Independence", "Other"];
export type AssetRecord = { id: string; type: keyof typeof assetTypes; name: string; institution: string; value: number; ownershipShare: number; notes: string };
export type LoanRecord = { id: string; type: keyof typeof loanTypes; lender: string; outstanding: number; monthlyEmi: number; interestRate: number; endDate: string; notes: string };
export type PolicyRecord = { id: string; type: keyof typeof policyTypes; insurer: string; coverAmount: number; annualPremium: number; renewalDate: string; nominee: string; notes: string };
export type GoalRecord = { id: string; category: string; name: string; targetAmount: number; savedAmount: number; targetYear: number; priority: "High" | "Medium" | "Low"; notes: string };
export type FileEntry = AssetRecord | LoanRecord | PolicyRecord | GoalRecord;
export type FileSectionData = { entries: FileEntry[]; confirmed: boolean; revision?: number; updatedAt?: string };
export type FinancialFile = Partial<Record<FileSection, FileSectionData>>;

export const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export const ownedValue = (asset: AssetRecord) => asset.value * asset.ownershipShare / 100;
export function assetPortfolio(entries: AssetRecord[]): Pick<Portfolio, "equity" | "fixedIncome" | "metals" | "property"> {
  const result = { equity: 0, fixedIncome: 0, metals: 0, property: 0 };
  for (const asset of entries) {
    const key = asset.type === "cash" ? "fixedIncome" : asset.type === "vehicle" ? "property" : asset.type;
    if (key in result) result[key as keyof typeof result] += ownedValue(asset);
  }
  return result;
}
export function otherAssets(user: AppUser) {
  if (typeof user.portfolio.other === "number") return user.portfolio.other;
  if (user.financialFile?.assets?.confirmed) return (user.financialFile.assets.entries as AssetRecord[]).filter(a => a.type === "business" || a.type === "other").reduce((sum, a) => sum + ownedValue(a), 0);
  // Earlier Quick Profiles included business estimates in equity. Avoid double counting them.
  const q = user.quickProfile;
  const business = q?.assets.businessOther.selected ? q.assets.businessOther.amount : 0;
  const investment = q?.assets.investments.selected ? q.assets.investments.amount : 0;
  return business && user.portfolio.equity === investment + business ? 0 : business;
}
export function financialTotals(user: AppUser) {
  const other = otherAssets(user);
  const assets = user.portfolio.equity + user.portfolio.fixedIncome + user.portfolio.metals + user.portfolio.property + other;
  const quick = user.quickProfile;
  const income = quick ? quick.householdIncome / (quick.incomeFrequency === "annual" ? 12 : 1) : 0;
  const emi = user.financialFile?.loans ? (user.financialFile.loans.entries as LoanRecord[]).reduce((sum, a) => sum + a.monthlyEmi, 0) : quick?.monthlyEmi ?? 0;
  const premiums = user.financialFile?.protection ? (user.financialFile.protection.entries as PolicyRecord[]).reduce((sum, a) => sum + a.annualPremium, 0) / 12 : 0;
  const expenses = quick?.monthlyExpenses ?? 0;
  return { assets, other, netWorth: assets - user.portfolio.debt, income, expenses, emi, premiums, surplus: income - expenses - emi - premiums };
}
export function fileProgress(user: AppUser) {
  const completed = sectionIds.slice(0, 7).filter(id => user.financialFile?.[id]?.confirmed);
  const reviewed = completed.length === 7 && user.financialFile?.review?.confirmed && user.financialFile.review.revision === user.revision;
  return { completed, reviewed: Boolean(reviewed), percent: Math.round((completed.length + (reviewed ? 1 : 0)) / 8 * 100), next: sectionIds.find(id => !completed.includes(id) && id !== "review") ?? "review" };
}
export function newEntry(section: FileSection, id: string): FileEntry {
  if (section === "assets") return { id, type: "equity", name: "", institution: "", value: 0, ownershipShare: 100, notes: "" };
  if (section === "loans") return { id, type: "home", lender: "", outstanding: 0, monthlyEmi: 0, interestRate: 0, endDate: "", notes: "" };
  if (section === "protection") return { id, type: "life", insurer: "", coverAmount: 0, annualPremium: 0, renewalDate: "", nominee: "", notes: "" };
  return { id, category: "Other", name: "", targetAmount: 0, savedAmount: 0, targetYear: new Date().getFullYear() + 5, priority: "Medium", notes: "" };
}
export function initialEntries(section: FileSection, user: AppUser): FileEntry[] {
  const saved = user.financialFile?.[section];
  if (saved) return structuredClone(saved.entries);
  const q = user.quickProfile;
  if (section === "assets") {
    const result: AssetRecord[] = [];
    const business = user.portfolio.other ?? (q?.assets.businessOther.selected ? q.assets.businessOther.amount : 0);
    const invested = q?.assets.investments.selected ? q.assets.investments.amount : 0;
    const legacyBusiness = business && user.portfolio.equity === invested + business;
    for (const type of ["equity", "fixedIncome", "metals", "property"] as const) {
      const value = user.portfolio[type] - (type === "equity" && legacyBusiness ? business : 0);
      if (value > 0) result.push({ ...newEntry(section, `estimate-${type}`) as AssetRecord, type, name: `${assetTypes[type]} estimate`, value });
    }
    if (business > 0) result.push({ ...newEntry(section, "estimate-business") as AssetRecord, type: "business", name: "Business / other estimate", value: business });
    return result;
  }
  if (section === "loans") {
    const loans = Object.entries(q?.loans ?? {}).filter(([, a]) => a.selected).map(([type, a]) => ({ ...newEntry(section, `estimate-${type}`) as LoanRecord, type: type as LoanRecord["type"], outstanding: a.outstanding, monthlyEmi: a.monthlyEmi }));
    if (loans.reduce((s, a) => s + a.outstanding, 0) === user.portfolio.debt) return loans;
    return user.portfolio.debt > 0 ? [{ ...newEntry(section, "estimate-debt") as LoanRecord, type: "other", outstanding: user.portfolio.debt, monthlyEmi: q?.monthlyEmi ?? 0 }] : [];
  }
  if (section === "protection") {
    const policies = Object.entries(q?.protection ?? {}).filter(([, a]) => a.status === "Yes").map(([type, a]) => ({ ...newEntry(section, `estimate-${type}`) as PolicyRecord, type: type as PolicyRecord["type"], coverAmount: a.coverAmount }));
    if (policies.reduce((s, a) => s + a.coverAmount, 0) === user.portfolio.insurance) return policies;
    return user.portfolio.insurance > 0 ? [{ ...newEntry(section, "estimate-cover") as PolicyRecord, coverAmount: user.portfolio.insurance }] : [];
  }
  if (section === "goals") return (q?.goals ?? []).map((category, i) => ({ ...newEntry(section, `estimate-goal-${i}`) as GoalRecord, category, name: category, priority: q?.primaryGoal === category ? "High" : "Medium" }));
  return [];
}
export function validDate(value: string, future = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && (future || value <= new Date().toISOString().slice(0, 10));
}
export function validateEntries(section: FileSection, entries: FileEntry[], confirmed = true) {
  if (entries.length > MAX_RECORDS) return `Add up to ${MAX_RECORDS} records in each section.`;
  if (new Set(entries.map(e => e.id)).size !== entries.length) return "Each record must have its own ID.";
  for (const [i, entry] of entries.entries()) {
    const prefix = `Record ${i + 1}: `;
    if (Object.values(entry).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0 || v > MAX_AMOUNT))) return prefix + "enter a valid, non-negative amount.";
    if (section === "assets") { const a = entry as AssetRecord; if ((confirmed && !a.name.trim()) || !(a.type in assetTypes) || a.ownershipShare < 1 || a.ownershipShare > 100) return prefix + "add a name, asset type, and ownership share from 1 to 100%."; }
    if (section === "loans") { const a = entry as LoanRecord; if (!(a.type in loanTypes) || a.interestRate > 100 || (a.endDate && !validDate(a.endDate, true))) return prefix + "check the loan type, interest rate, and end date."; }
    if (section === "protection") { const a = entry as PolicyRecord; if (!(a.type in policyTypes) || (a.renewalDate && !validDate(a.renewalDate, true))) return prefix + "check the insurance type and renewal date."; }
    if (section === "goals") { const a = entry as GoalRecord; if ((confirmed && !a.name.trim()) || !goalCategories.includes(a.category) || a.targetYear < new Date().getFullYear() || a.targetYear > 2100 || !Number.isInteger(a.targetYear)) return prefix + "add a goal name and a target year between this year and 2100."; }
  }
  return "";
}
export function syncFileSection(user: AppUser, section: FileSection, entries: FileEntry[], quick: QuickProfile): Partial<AppUser> {
  const portfolio = { ...user.portfolio };
  if (section === "assets") {
    Object.assign(portfolio, assetPortfolio(entries as AssetRecord[]));
    const other = (entries as AssetRecord[]).filter(a => a.type === "business" || a.type === "other").reduce((s, a) => s + ownedValue(a), 0);
    portfolio.other = other;
  }
  if (section === "loans") {
    portfolio.debt = (entries as LoanRecord[]).reduce((s, a) => s + a.outstanding, 0);
    quick.noLoans = entries.length === 0; quick.monthlyEmi = (entries as LoanRecord[]).reduce((s, a) => s + a.monthlyEmi, 0);
  }
  if (section === "protection") {
    portfolio.insurance = (entries as PolicyRecord[]).reduce((s, a) => s + a.coverAmount, 0);
  }
  const profile = { ...user.profile, fullName: quick.fullName, dateOfBirth: quick.dateOfBirth, maritalStatus: quick.maritalStatus, incomeRange: quick.incomeRange, dependants: String(quick.familyMembers.filter(a => a.financiallyDependent === "Yes").length) };
  if (section === "goals") {
    const goals = entries as GoalRecord[];
    quick.goals = [...new Set(goals.map(a => a.category))]; quick.primaryGoal = goals.find(a => a.priority === "High")?.category ?? goals[0]?.category ?? "";
    profile.primaryGoal = goals.find(a => a.priority === "High")?.name ?? goals[0]?.name ?? "";
  }
  return { portfolio, quickProfile: quick, profile };
}

export const assetCSVTemplate = 'type,name,institution,value,ownershipShare,notes\r\nequity,Example mutual fund,Example AMC,100000,100,Replace this example\r\nproperty,Example home,Mumbai,5000000,50,Total value with 50% ownership';
export function parseAssetsCSV(source: string): AssetRecord[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("A quoted CSV field is not closed. Check your file and try again.");
  row.push(cell); if (row.some(c => c.trim())) rows.push(row);
  const header = rows.shift()?.map(c => c.trim()) ?? [];
  const required = ["type", "name", "institution", "value", "ownershipShare", "notes"];
  if (header.length !== required.length || new Set(header).size !== required.length || required.some(c => !header.includes(c))) throw new Error("Use the six columns in the asset template: type, name, institution, value, ownershipShare, notes.");
  if (!rows.length || rows.length > MAX_RECORDS) throw new Error(`Import between 1 and ${MAX_RECORDS} asset records.`);
  const result = rows.map((values, index) => {
    if (values.length !== header.length) throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const d = Object.fromEntries(header.map((key, i) => [key, values[i].trim()]));
    const entry = { id: crypto.randomUUID(), type: d.type as AssetRecord["type"], name: d.name, institution: d.institution, value: Number(d.value.replace(/,/g, "")), ownershipShare: d.ownershipShare ? Number(d.ownershipShare) : 100, notes: d.notes };
    if (entry.name.length > 100 || entry.institution.length > 100 || entry.notes.length > 500) throw new Error(`Row ${index + 2} has text that is too long.`);
    return entry;
  });
  const error = validateEntries("assets", result); if (error) throw new Error(error);
  return result;
}
