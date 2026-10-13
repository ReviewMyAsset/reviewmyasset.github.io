import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { assetPortfolio, financialTotals, initialEntries, newEntry, fileProgress, syncFileSection, validateEntries, validDate, parseAssetsCSV, assetCSVTemplate } from '../lib/financial-file.ts';

const q = () => ({step:9,fullName:'Example Client',dateOfBirth:'1990-01-02',maritalStatus:'Single',workStatus:'Working',workType:'Employment',incomeRange:'Below ₹10 lakh',familyMembers:[],familySkipped:false,
 assets:Object.fromEntries(['cash','investments','property','metals','businessOther'].map(k=>[k,{selected:false,amount:0,detailChoice:'',note:''}])),
 loans:Object.fromEntries(['home','vehicle','creditCard','education','business','other'].map(k=>[k,{selected:false,outstanding:0,monthlyEmi:0}])),noLoans:true,
 protection:Object.fromEntries(['life','health','accident','property','vehicle'].map(k=>[k,{status:'No',coverAmount:0}])),householdIncome:1200000,incomeFrequency:'annual',monthlyExpenses:40000,monthlyEmi:10000,goals:['Retirement'],primaryGoal:'Retirement'});
const user = () => ({id:'client',username:'client',inviteId:'a'.repeat(64),revision:1,role:'client',onboardingComplete:true,quickProfile:q(),profile:{fullName:'Example Client',dateOfBirth:'1990-01-02',email:'client@example.com',phone:'',city:'',occupation:'Teacher',maritalStatus:'Single',dependants:'0',incomeRange:'Below ₹10 lakh',primaryGoal:'Retirement',horizon:'5–10 years',riskComfort:'Moderate'},portfolio:{equity:500000,fixedIncome:200000,metals:0,property:1000000,debt:100000,insurance:5000000},financialFile:{},updatedAt:new Date().toISOString()});

test('ownership shares and asset categories calculate attributable market values',()=>{
 const records=[{...newEntry('assets','a'),type:'property',value:2000000,ownershipShare:50},{...newEntry('assets','b'),type:'vehicle',value:300000,ownershipShare:100},{...newEntry('assets','c'),type:'cash',value:100000,ownershipShare:100},{...newEntry('assets','d'),type:'business',value:500000,ownershipShare:20}];
 assert.deepEqual(assetPortfolio(records),{equity:0,fixedIncome:100000,metals:0,property:1300000});
 const u=user();u.financialFile.assets={confirmed:true,entries:records};Object.assign(u.portfolio,assetPortfolio(records));
 assert.equal(financialTotals(u).assets,1500000);assert.equal(financialTotals(u).netWorth,1400000);
});
test('insurance and goal targets do not inflate assets or net worth',()=>{
 const u=user();u.financialFile.goals={confirmed:true,entries:[{...newEntry('goals','g'),targetAmount:10000000,savedAmount:1000000}]};
 assert.equal(financialTotals(u).assets,1700000);assert.equal(financialTotals(u).netWorth,1600000);
});
test('annual income, zero loan repayments, and insurance premiums produce correct cash flow',()=>{
 const u=user();u.financialFile.loans={confirmed:true,entries:[]};u.financialFile.protection={confirmed:true,entries:[{...newEntry('protection','p'),annualPremium:24000}]};
 assert.equal(financialTotals(u).income,100000);assert.equal(financialTotals(u).emi,0);assert.equal(financialTotals(u).premiums,2000);assert.equal(financialTotals(u).surplus,58000);
});
test('legacy business estimates are reclassified without duplication',()=>{
 const u=user();u.quickProfile.assets.investments={selected:true,amount:400000,detailChoice:'later',note:''};u.quickProfile.assets.businessOther={selected:true,amount:100000,detailChoice:'later',note:''};
 const entries=initialEntries('assets',u);assert.equal(entries.find(a=>a.type==='equity').value,400000);assert.equal(entries.find(a=>a.type==='business').value,100000);
 assert.equal(financialTotals(u).assets,1700000);
});
test('existing edited snapshot totals override stale Quick Profile estimates',()=>{
 const u=user();u.quickProfile.loans.home={selected:true,outstanding:200000,monthlyEmi:2000};
 const entries=initialEntries('loans',u);assert.equal(entries.length,1);assert.equal(entries[0].outstanding,100000);assert.equal(entries[0].type,'other');
});
test('detailed section synchronization updates the snapshot and Quick Profile together',()=>{
 const u=user();const quick=structuredClone(u.quickProfile);const entries=[{...newEntry('loans','l'),type:'home',outstanding:100000,monthlyEmi:3000},{...newEntry('loans','m'),type:'home',outstanding:50000,monthlyEmi:2000}];
 const changes=syncFileSection(u,'loans',entries,quick);assert.equal(changes.portfolio.debt,150000);assert.equal(changes.quickProfile.monthlyEmi,5000);assert.equal(changes.portfolio.equity,u.portfolio.equity);assert.equal(changes.quickProfile.loans.home.outstanding,u.quickProfile.loans.home.outstanding);
});
test('editing other sections preserves a custom primary goal and contact details',()=>{
 const u=user();u.profile.primaryGoal='Retire in Mysore';u.profile.phone='+91 9876543210';
 const changes=syncFileSection(u,'assets',[],structuredClone(u.quickProfile));assert.equal(changes.profile.primaryGoal,'Retire in Mysore');assert.equal(changes.profile.phone,'+91 9876543210');
});
test('incomplete records save as drafts but need names before confirmation',()=>{
 const entries=[newEntry('assets','a')];assert.equal(validateEntries('assets',entries,false),'');assert.match(validateEntries('assets',entries,true),/name/);
 assert.match(validateEntries('assets',[{...entries[0],value:Infinity}],false),/valid/);assert.match(validateEntries('assets',[{...entries[0],ownershipShare:101}],false),/ownership/);
});
test('invalid calendar dates and dates of birth in the future are rejected',()=>{
 assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2099-01-01'),false);assert.equal(validDate('2099-01-01',true),true);
});
test('progress requires confirmed sections and a review of the current revision',()=>{
 const u=user();for(const id of ['about','family','assets','loans','protection','cashflow','goals'])u.financialFile[id]={confirmed:true,entries:[],revision:1};
 assert.equal(fileProgress(u).percent,88);u.financialFile.review={confirmed:true,entries:[],revision:1};assert.equal(fileProgress(u).percent,100);assert.equal(fileProgress(u).reviewed,true);
 u.revision=2;assert.equal(fileProgress(u).reviewed,false);u.financialFile.assets.confirmed=false;assert.equal(fileProgress(u).next,'assets');
});
test('CSV import handles quoted amounts, commas and multi-line notes',()=>{
 const entries=parseAssetsCSV('type,name,institution,value,ownershipShare,notes\r\nequity,"Fund, growth",Example,"1,25,000",100,"Line one\nLine two"');
 assert.equal(entries[0].value,125000);assert.equal(entries[0].name,'Fund, growth');assert.equal(entries[0].notes,'Line one\nLine two');assert.equal(parseAssetsCSV(assetCSVTemplate).length,2);
});
test('CSV import rejects malformed headers, unknown categories and invalid amounts',()=>{
 assert.throws(()=>parseAssetsCSV('name,value\nExample,100'),/six columns/);
 assert.throws(()=>parseAssetsCSV('type,name,institution,value,ownershipShare,notes\nunknown,Example,,100,100,'),/asset type/);
 assert.throws(()=>parseAssetsCSV('type,name,institution,value,ownershipShare,notes\nequity,Example,,-100,100,'),/valid/);
 assert.throws(()=>parseAssetsCSV('type,name,institution,value,ownershipShare,notes\nequity,"Unclosed'),/not closed/);
});

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(async()=>{await vite.close();});
test('full setup exposes all eight sections and saved status',async()=>{
 const {FinancialMasterFile}=await vite.ssrLoadModule('/app/financial-master-file.tsx');
 const html=renderToStaticMarkup(React.createElement(FinancialMasterFile,{user:user(),brand:'Review My Asset',onSave:async()=>2,onClose:()=>{}}));
 for(const text of ['About you','Your family','What you own','What you owe','Your protection','Income &amp; expenses','Your goals','Review your file','Continue setup','Download profile'])assert.ok(html.includes(text),text);
});
test('every editing section renders labeled fields and working save actions',async()=>{
 const {FinancialMasterFile}=await vite.ssrLoadModule('/app/financial-master-file.tsx');
 for(const section of ['about','family','assets','loans','protection','cashflow','goals']){
  const html=renderToStaticMarkup(React.createElement(FinancialMasterFile,{user:user(),brand:'Review My Asset',initialSection:section,onSave:async()=>2,onClose:()=>{}}));
  assert.ok(html.includes('Save draft'),section);assert.ok(html.includes('Confirm &amp; continue'),section);assert.ok(html.includes('Back to sections'),section);
 }
});
test('saved summaries show nominees, loan details, goals and cash flow without private notes',async()=>{
 const {FinancialFileSummary}=await vite.ssrLoadModule('/app/financial-master-file.tsx');const u=user();
 u.financialFile.protection={confirmed:true,entries:[{...newEntry('protection','p'),insurer:'Example insurer',nominee:'My spouse',renewalDate:'2020-01-01'}]};
 u.financialFile.loans={confirmed:true,entries:[{...newEntry('loans','l'),lender:'Example lender',interestRate:8.5,endDate:'2031-01-01'}]};
 const html=renderToStaticMarkup(React.createElement(FinancialFileSummary,{user:u}));
 assert.match(html,/My spouse/);assert.match(html,/8.5%/);assert.match(html,/2031-01-01/);assert.match(html,/renewal date has passed/);assert.match(html,/Estimated monthly surplus/);assert.doesNotMatch(html,/Private adviser notes/);
});
