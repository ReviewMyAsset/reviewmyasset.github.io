import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { execute, field } from 'firebase/firestore/pipelines';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendEmailVerification, applyActionCode, reload, sendPasswordResetEmail, confirmPasswordReset, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { newEntry, syncFileSection, fileProgress } from '../lib/financial-file.ts';

let env;
const appRoot=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root:appRoot,resolve:{alias:{'@':appRoot}},server:{middlewareMode:true}});
const token = 'a'.repeat(64);
const advisorEmail = 'anubhanadgouda@gmail.com';
const auth = (uid, email, verified = true) => env.authenticatedContext(uid, {email, email_verified:verified}).firestore()._delegate;
const invitation = () => ({email:'client@example.com',clientName:'Test Client',status:'pending',acceptedUid:'',createdBy:'advisor',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+86400000),acceptedAt:null});
const profile = () => ({fullName:'Test Client',dateOfBirth:'',email:'client@example.com',phone:'',city:'',occupation:'',maritalStatus:'',dependants:'0',incomeRange:'',primaryGoal:'',horizon:'',riskComfort:''});
const quick = () => ({step:1,fullName:'',dateOfBirth:'',maritalStatus:'',workStatus:'',workType:'',incomeRange:'',familyMembers:[],familySkipped:false,
  assets:Object.fromEntries(['cash','investments','property','metals','businessOther'].map(k=>[k,{selected:false,amount:0,detailChoice:'',note:''}])),
  loans:Object.fromEntries(['home','vehicle','creditCard','education','business','other'].map(k=>[k,{selected:false,outstanding:0,monthlyEmi:0}])),noLoans:false,
  protection:Object.fromEntries(['life','health','accident','property','vehicle'].map(k=>[k,{status:'',coverAmount:0}])),householdIncome:0,incomeFrequency:'annual',monthlyExpenses:0,monthlyEmi:0,goals:[],primaryGoal:''});
const client = (uid='client') => ({uid,email:'client@example.com',inviteId:token,username:'client',onboardingComplete:false,quickProfile:quick(),profile:profile(),portfolio:{equity:0,fixedIncome:0,metals:0,property:0,debt:0,insurance:0},createdAt:serverTimestamp(),savedAt:serverTimestamp(),revision:0});
async function accept(db, record = client(), acceptedUid='client') {
  const batch=writeBatch(db);
  batch.set(doc(db,'clients',record.uid),record);
  batch.update(doc(db,'invitations',token),{status:'accepted',acceptedUid,acceptedAt:serverTimestamp()});
  return batch.commit();
}
async function seedAccepted() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore();
    await setDoc(doc(db,'invitations',token),{...invitation(),status:'accepted',acceptedUid:'client',acceptedAt:serverTimestamp()});
    await setDoc(doc(db,'clients','client'),client());
  });
}
before(async () => { env=await initializeTestEnvironment({projectId:'demo-review-my-asset',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}}); });
beforeEach(async()=>{ await env.clearFirestore(); });
after(async()=>{ await env?.cleanup(); await vite.close(); });

test('public users cannot read/list clients, invitations, or notes',async()=>{
  const db=env.unauthenticatedContext().firestore();
  for(const path of ['clients','invitations','adviserNotes']) { await assertFails(getDocs(collection(db,path))); await assertFails(getDoc(doc(db,path,'hidden'))); }
});
test('unverified adviser cannot grant invitations',async()=>{await assertFails(setDoc(doc(auth('advisor',advisorEmail,false),'invitations',token),invitation()));});
test('ordinary verified users cannot issue invitations',async()=>{await assertFails(setDoc(doc(auth('other','other@example.com'),'invitations',token),invitation()));});
test('verified adviser can create an invitation and list clients',async()=>{const db=auth('advisor',advisorEmail);await assertSucceeds(setDoc(doc(db,'invitations',token),invitation()));await assertSucceeds(getDocs(collection(db,'clients')));});
test('client must accept invitation and create profile atomically',async()=>{
  await setDoc(doc(auth('advisor',advisorEmail),'invitations',token),invitation());
  const db=auth('client','client@example.com');
  await assertFails(setDoc(doc(db,'clients','client'),client()));
  await assertFails(updateDoc(doc(db,'invitations',token),{status:'accepted',acceptedUid:'client',acceptedAt:serverTimestamp()}));
  await assertSucceeds(accept(db));await assertSucceeds(getDoc(doc(db,'clients','client')));
});
test('wrong email cannot read or accept invitation',async()=>{await setDoc(doc(auth('advisor',advisorEmail),'invitations',token),invitation());const db=auth('client','wrong@example.com');await assertFails(getDoc(doc(db,'invitations',token)));await assertFails(accept(db));});
test('unverified client cannot accept an invitation',async()=>{await setDoc(doc(auth('advisor',advisorEmail),'invitations',token),invitation());await assertFails(accept(auth('client','client@example.com',false)));});
test('expired invitations cannot be accepted',async()=>{await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'invitations',token),{...invitation(),createdAt:Timestamp.fromMillis(Date.now()-172800000),expiresAt:Timestamp.fromMillis(Date.now()-86400000)});});await assertFails(accept(auth('client','client@example.com')));});
test('client cannot accept for another UID',async()=>{await setDoc(doc(auth('advisor',advisorEmail),'invitations',token),invitation());await assertFails(accept(auth('client','client@example.com'),client('other'),'other'));});
test('accepted invitations cannot be replayed',async()=>{await seedAccepted();await assertFails(accept(auth('second','client@example.com'),client('second'),'second'));});
test('client cannot read/list another client or impersonate an adviser',async()=>{await seedAccepted();const db=auth('other','other@example.com');await assertFails(getDoc(doc(db,'clients','client')));await assertFails(getDocs(collection(db,'clients')));await assertFails(updateDoc(doc(db,'clients','client'),{role:'adviser'}));});
test('owner can save profile and figures with incremented revision',async()=>{await seedAccepted();const db=auth('client','client@example.com');await assertSucceeds(updateDoc(doc(db,'clients','client'),{portfolio:{equity:125000,fixedIncome:50000,metals:0,property:0,debt:10000,insurance:1000000},revision:1,savedAt:serverTimestamp()}));});
test('adviser cannot edit client financial figures',async()=>{await seedAccepted();await assertFails(updateDoc(doc(auth('advisor',advisorEmail),'clients','client'),{portfolio:{equity:1,fixedIncome:0,metals:0,property:0,debt:0,insurance:0},revision:1,savedAt:serverTimestamp()}));});
test('stale revision saves are denied',async()=>{await seedAccepted();await assertFails(updateDoc(doc(auth('client','client@example.com'),'clients','client'),{revision:0,savedAt:serverTimestamp()}));});
for(const [label,change] of [
  ['role injection',{role:'adviser'}],['password injection',{password:'secret'}],['ownership change',{uid:'other'}],['email change',{email:'other@example.com'}],['invitation change',{inviteId:'b'.repeat(64)}],['createdAt change',{createdAt:Timestamp.fromMillis(1)}],['invalid field type',{onboardingComplete:'true'}],
  ['negative portfolio',{portfolio:{equity:-1,fixedIncome:0,metals:0,property:0,debt:0,insurance:0}}],['oversized name',{profile:{...profile(),fullName:'x'.repeat(1001)}}],['unknown profile fields',{profile:{...profile(),admin:true}}],['unknown goals',{quickProfile:{...quick(),goals:['admin']}}],['too many family members',{quickProfile:{...quick(),familyMembers:Array.from({length:11},(_,i)=>({id:String(i),relationship:'Child',age:'10',financiallyDependent:'Yes'}))}}],['malformed family member',{quickProfile:{...quick(),familyMembers:[{id:'1',relationship:'Child',age:10,financiallyDependent:'Yes'}]}}]
]) test(`owner update rejects ${label}`,async()=>{await seedAccepted();await assertFails(updateDoc(doc(auth('client','client@example.com'),'clients','client'),{...change,revision:1,savedAt:serverTimestamp()}));});
test('adviser notes are private, bounded, and tied to a client',async()=>{
  await seedAccepted();const advisor=auth('advisor',advisorEmail);const note={text:'Private context',adviserUid:'advisor',updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(advisor,'adviserNotes','client'),note));await assertSucceeds(getDoc(doc(advisor,'adviserNotes','client')));
  await assertFails(getDoc(doc(auth('client','client@example.com'),'adviserNotes','client')));
  await assertFails(setDoc(doc(auth('client','client@example.com'),'adviserNotes','client'),note));
  await assertFails(setDoc(doc(advisor,'adviserNotes','missing'),note));await assertFails(setDoc(doc(advisor,'adviserNotes','client'),{...note,text:'x'.repeat(5001)}));
});
test('revoked invitation removes client reads and writes',async()=>{await seedAccepted();const db=auth('client','client@example.com');await assertSucceeds(updateDoc(doc(auth('advisor',advisorEmail),'invitations',token),{status:'revoked'}));await assertFails(getDoc(doc(db,'clients','client')));await assertFails(updateDoc(doc(db,'clients','client'),{revision:1,savedAt:serverTimestamp()}));});
test('client cannot change invitation recipient or revoke an invitation',async()=>{await seedAccepted();const db=auth('client','client@example.com');await assertFails(updateDoc(doc(db,'invitations',token),{email:'wrong@example.com'}));await assertFails(updateDoc(doc(db,'invitations',token),{status:'revoked'}));});
test('adviser pipelines work while clients cannot query other profiles',async()=>{await seedAccepted();const db=auth('advisor',advisorEmail);await assertSucceeds(execute(db.pipeline().collection('clients').sort(field('savedAt').descending())));await assertSucceeds(execute(db.pipeline().collection('invitations').sort(field('createdAt').descending())));await assertFails(execute(auth('client','client@example.com').pipeline().collection('clients')));});
for (const section of ['assets','loans','protection','familyMembers','goals']) test(`Quick Profile saves a complete ${section} section`,async()=>{
  await seedAccepted();const q=quick();q.step=3;
  if(section==='assets') for(const entry of Object.values(q.assets)) { entry.selected=true; entry.amount=10000; entry.detailChoice='later'; }
  if(section==='loans') for(const entry of Object.values(q.loans)) { entry.selected=true; entry.outstanding=10000; entry.monthlyEmi=1000; }
  if(section==='protection') for(const entry of Object.values(q.protection)) { entry.status='Yes'; entry.coverAmount=10000; }
  if(section==='familyMembers') q.familyMembers=Array.from({length:10},(_,i)=>({id:String(i),relationship:'Child',age:'10',financiallyDependent:'Yes'}));
  if(section==='goals') { q.goals=['Children’s Education','Retirement'];q.primaryGoal='Retirement'; }
  const db=auth('client','client@example.com');
  if (section==='familyMembers') {
    const batch=writeBatch(db);batch.update(doc(db,'clients','client'),{quickProfile:{...q,familyMembers:[]},revision:1,savedAt:serverTimestamp()});batch.set(doc(db,'clientFamilies','client'),{members:q.familyMembers,revision:1,savedAt:serverTimestamp()});await assertSucceeds(batch.commit());
  } else await assertSucceeds(updateDoc(doc(db,'clients','client'),{quickProfile:q,revision:1,savedAt:serverTimestamp()}));
});
test('real Auth SDK verifies an invited client, saves across sessions, and resets passwords',async()=>{
  const apps=[];
  const setup=(name)=>{const app=initializeApp({projectId:'demo-review-my-asset',apiKey:'demo-key',authDomain:'demo-review-my-asset.firebaseapp.com'},name);apps.push(app);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);return {auth,db};};
  const verify=async(auth)=>{await sendEmailVerification(auth.currentUser);const {oobCodes}=await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-review-my-asset/oobCodes')).json();const code=oobCodes.findLast(code=>code.email===auth.currentUser.email && code.requestType==='VERIFY_EMAIL');await applyActionCode(auth,code.oobCode);await reload(auth.currentUser);await auth.currentUser.getIdToken(true);};
  try {
    const advisor=setup('sdk-advisor');const customer=setup('sdk-client');
    await createUserWithEmailAndPassword(advisor.auth,advisorEmail,'A-test-only-long-passphrase');await verify(advisor.auth);
    await setDoc(doc(advisor.db,'invitations',token),{...invitation(),createdBy:advisor.auth.currentUser.uid});
    await createUserWithEmailAndPassword(customer.auth,'client@example.com','Another-test-only-passphrase');const uid=customer.auth.currentUser.uid;
    await assertFails(getDoc(doc(customer.db,'invitations',token)));await verify(customer.auth);
    await assertSucceeds(accept(customer.db,client(uid),uid));
    await updateDoc(doc(customer.db,'clients',uid),{portfolio:{equity:500000,fixedIncome:100000,metals:0,property:0,debt:0,insurance:0},revision:1,savedAt:serverTimestamp()});
    await signOut(customer.auth);await signInWithEmailAndPassword(customer.auth,'client@example.com','Another-test-only-passphrase');
    assert.equal((await getDoc(doc(customer.db,'clients',uid))).data().portfolio.equity,500000);
    const records=await execute(advisor.db.pipeline().collection('clients').sort(field('savedAt').descending()));assert.equal(records.results[0].id,uid);
    await sendPasswordResetEmail(customer.auth,'client@example.com');const {oobCodes}=await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-review-my-asset/oobCodes')).json();const reset=oobCodes.findLast(code=>code.email==='client@example.com' && code.requestType==='PASSWORD_RESET');
    await confirmPasswordReset(customer.auth,reset.oobCode,'A-new-test-only-passphrase');await signOut(customer.auth);await signInWithEmailAndPassword(customer.auth,'client@example.com','A-new-test-only-passphrase');assert.equal(customer.auth.currentUser.uid,uid);
  } finally {await Promise.all(apps.map(deleteApp));}
});
test('About You updates both profile and Quick Profile together',async()=>{await seedAccepted();const q={...quick(),step:3,fullName:'Test Client',dateOfBirth:'1990-01-02',maritalStatus:'Married',workStatus:'Working',workType:'Employment',incomeRange:'₹25–50 lakh'};await assertSucceeds(updateDoc(doc(auth('client','client@example.com'),'clients','client'),{quickProfile:q,profile:{...profile(),fullName:q.fullName,dateOfBirth:q.dateOfBirth,maritalStatus:q.maritalStatus,occupation:'Working · Employment',incomeRange:q.incomeRange},revision:1,savedAt:serverTimestamp()}));});
test('family documents are private, bounded, and saved atomically with the profile',async()=>{
  await seedAccepted();const customer=auth('client','client@example.com');const ref=doc(customer,'clientFamilies','client');const family={members:[{id:'1',relationship:'Child',age:'10',financiallyDependent:'Yes'}],revision:1,savedAt:serverTimestamp()};
  await assertFails(setDoc(ref,family));
  const save=async(members)=>{const batch=writeBatch(customer);batch.update(doc(customer,'clients','client'),{revision:1,savedAt:serverTimestamp()});batch.set(ref,{...family,members});return batch.commit();};
  await assertFails(save([{id:'1',relationship:'Child',age:10,financiallyDependent:'Yes'}]));
  await assertFails(save(Array.from({length:11},()=>family.members[0])));
  await assertSucceeds(save(family.members));await assertSucceeds(getDoc(ref));await assertSucceeds(getDoc(doc(auth('advisor',advisorEmail),'clientFamilies','client')));
  await assertFails(getDoc(doc(auth('other','other@example.com'),'clientFamilies','client')));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'clientFamilies','client')));
});

const sectionDocument=(entries=[],revision=1)=>({entries,confirmed:true,revision,savedAt:serverTimestamp()});
async function saveSection(db,section,data,revision=1,uid='client') {
  const batch=writeBatch(db);batch.update(doc(db,'clients',uid),{revision,savedAt:serverTimestamp()});const detailed=['assets','loans','protection','goals'].includes(section);for(let part=0;part<(detailed?3:1);part++)batch.set(doc(db,'clients',uid,'sections',section+(part?'-'+(part+1):'')),{...data,entries:data.entries.slice(part*4,part===2?undefined:(part+1)*4),revision});return batch.commit();
}
for(const section of ['about','family','cashflow','review','assets','loans','protection','goals'])test(`Master File saves and reads the ${section} section`,async()=>{
 await seedAccepted();const db=auth('client','client@example.com');const entries=['assets','loans','protection','goals'].includes(section)?[{...newEntry(section,'1'),...(section==='assets'||section==='goals'?{name:'Test record'}:{})}]:[];
 await assertSucceeds(saveSection(db,section,sectionDocument(entries)));await assertSucceeds(getDoc(doc(db,'clients','client','sections',section)));await assertSucceeds(getDoc(doc(auth('advisor',advisorEmail),'clients','client','sections',section)));
});
for(const section of ['assets','loans','protection','goals'])test(`Master File accepts the maximum 12 ${section} records`,async()=>{
 await seedAccepted();const entries=Array.from({length:12},(_,i)=>({...newEntry(section,String(i)),...(section==='assets'||section==='goals'?{name:'Test record'}:{}),notes:'x'.repeat(500)}));await assertSucceeds(saveSection(auth('client','client@example.com'),section,sectionDocument(entries)));
});
test('Master File rejects public, other client, unverified, and adviser writes',async()=>{
 await seedAccepted();const ref=db=>doc(db,'clients','client','sections','assets');
 await assertSucceeds(saveSection(auth('client','client@example.com'),'assets',sectionDocument([])));
 for(const db of [env.unauthenticatedContext().firestore(),auth('other','other@example.com'),auth('client','client@example.com',false)]){await assertFails(getDoc(ref(db)));await assertFails(setDoc(ref(db),sectionDocument([])));}
 await assertFails(setDoc(ref(auth('advisor',advisorEmail)),sectionDocument([])));
});
test('Master File denies list queries and unknown section writes',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');await assertFails(getDocs(collection(db,'clients','client','sections')));await assertFails(saveSection(db,'roles',sectionDocument([])));
});
test('Master File requires an existing parent and an atomic matching revision',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');await assertFails(setDoc(doc(db,'clients','client','sections','assets'),sectionDocument([])));
 const batch=writeBatch(db);batch.update(doc(db,'clients','client'),{revision:1,savedAt:serverTimestamp()});batch.set(doc(db,'clients','client','sections','assets'),sectionDocument([],2));await assertFails(batch.commit());
 await assertFails(setDoc(doc(auth('missing','client@example.com'),'clients','missing','sections','assets'),sectionDocument([])));
});
test('revocation also blocks all Master File reads and writes',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');await saveSection(db,'assets',sectionDocument([]));await updateDoc(doc(auth('advisor',advisorEmail),'invitations',token),{status:'revoked'});
 await assertFails(getDoc(doc(db,'clients','client','sections','assets')));await assertFails(saveSection(db,'assets',sectionDocument([]),2));
});
for(const [label,section,entries,extras] of [
 ['oversized list','assets',Array.from({length:13},(_,i)=>newEntry('assets',String(i)))],
 ['oversized notes','assets',[{...newEntry('assets','a'),notes:'x'.repeat(501)}]],
 ['oversized institution','assets',[{...newEntry('assets','a'),institution:'x'.repeat(101)}]],
 ['negative market value','assets',[{...newEntry('assets','a'),value:-1}]],
 ['oversized market value','assets',[{...newEntry('assets','a'),value:1e13}]],
 ['invalid ownership','assets',[{...newEntry('assets','a'),ownershipShare:101}]],
 ['invalid asset type','assets',[{...newEntry('assets','a'),type:'admin'}]],
 ['missing required record field','assets',[Object.fromEntries(Object.entries(newEntry('assets','a')).filter(([key])=>key!=='value'))]],
 ['record field injection','assets',[{...newEntry('assets','a'),role:'adviser'}]],
 ['invalid interest rate','loans',[{...newEntry('loans','l'),interestRate:101}]],
 ['invalid repayment type','loans',[{...newEntry('loans','l'),monthlyEmi:'100'}]],
 ['invalid insurance date','protection',[{...newEntry('protection','p'),renewalDate:'tomorrow'}]],
 ['oversized nominee','protection',[{...newEntry('protection','p'),nominee:'x'.repeat(101)}]],
 ['invalid goal category','goals',[{...newEntry('goals','g'),category:'Admin'}]],
 ['invalid goal year','goals',[{...newEntry('goals','g'),targetYear:2101}]],
 ['metadata field injection','assets',[],{owner:'other'}],
 ['records in metadata section','about',[newEntry('assets','a')]],
 ['missing required section field','assets',[],{confirmed:undefined}],
 ])test(`Master File create and update reject ${label}`,async()=>{
 await seedAccepted();const db=auth('client','client@example.com');const data={...sectionDocument(entries),...extras};if(data.confirmed===undefined)delete data.confirmed;
 await assertFails(saveSection(db,section,data));await assertSucceeds(saveSection(db,section,sectionDocument([])));await assertFails(saveSection(db,section,data,2));
});
test('actual app service persists full setup, refuses stale saves, and keeps data across reads',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');const {readClient,saveClient}=await vite.ssrLoadModule('/lib/client-records.ts');
 let record=await readClient('client',db);assert.equal(Object.keys(record.financialFile).length,0);
 for(const section of ['about','family','assets','loans','protection','cashflow','goals']){
  let entries=[];if(['assets','loans','protection','goals'].includes(section))entries=[{...newEntry(section,'record-'+section),...(section==='assets'||section==='goals'?{name:'Actual record'}:{})}];
  if(section==='assets')entries[0].value=500000;if(section==='loans'){entries[0].outstanding=100000;entries[0].monthlyEmi=2000;}if(section==='protection'){entries[0].coverAmount=5000000;entries[0].annualPremium=24000;}if(section==='goals'){entries[0].targetAmount=1000000;entries[0].savedAmount=100000;}
  const changes=syncFileSection(record,section,entries,structuredClone(record.quickProfile));
  record=await saveClient('client',{...changes,financialFile:{[section]:{entries,confirmed:true}},onboardingComplete:true},record.revision,db);
  assert.equal(record.financialFile[section].confirmed,true);
 }
 assert.equal(record.portfolio.equity,500000);assert.equal(record.portfolio.debt,100000);assert.equal(record.portfolio.insurance,5000000);assert.equal(fileProgress(record).completed.length,7);
 await assert.rejects(saveClient('client',{financialFile:{assets:{entries:[],confirmed:false}}},0,db),/another device/);
 record=await saveClient('client',{financialFile:{review:{entries:[],confirmed:true}}},record.revision,db);assert.equal(fileProgress(record).reviewed,true);
 const adviser=await readClient('client',auth('advisor',advisorEmail));assert.equal(adviser.financialFile.assets.entries[0].value,500000);assert.equal(adviser.financialFile.protection.entries[0].annualPremium,24000);
 record=await saveClient('client',{financialFile:{goals:{entries:[],confirmed:false}}},record.revision,db);assert.equal(fileProgress(record).reviewed,false);assert.equal(record.financialFile.assets.entries[0].value,500000);
});
test('actual app service merges 12 records, clears removed chunks, and serves unchanged cached profiles',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');const {readClient,saveClient}=await vite.ssrLoadModule('/lib/client-records.ts');let record=await readClient('client',db);
 const entries=Array.from({length:12},(_,i)=>({...newEntry('assets','record-'+i),name:'Asset '+i,value:1000,notes:'first line\nsecond line'}));
 record=await saveClient('client',{portfolio:{...record.portfolio,equity:12000,other:0},financialFile:{assets:{entries,confirmed:true}}},record.revision,db);
 assert.equal(record.financialFile.assets.entries.length,12);assert.strictEqual(await readClient('client',db,record),record);
 record=await saveClient('client',{portfolio:{...record.portfolio,equity:2000},financialFile:{assets:{entries:entries.slice(0,2),confirmed:true}}},record.revision,db);
 assert.equal(record.financialFile.assets.entries.length,2);assert.equal((await getDoc(doc(db,'clients','client','sections','assets-2'))).data().entries.length,0);assert.equal((await getDoc(doc(db,'clients','client','sections','assets-3'))).data().entries.length,0);
});
test('detailed chunks cannot be changed without a matching section and parent commit',async()=>{
 await seedAccepted();const db=auth('client','client@example.com');await saveSection(db,'assets',sectionDocument([]));
 const batch=writeBatch(db);batch.update(doc(db,'clients','client'),{revision:2,savedAt:serverTimestamp()});batch.set(doc(db,'clients','client','sections','assets-2'),sectionDocument([],2));await assertFails(batch.commit());
 await assertFails(saveSection(db,'assets-4',sectionDocument([]),2));
});
test('only the adviser can restore an accepted revoked invitation',async()=>{
 await seedAccepted();const advisor=auth('advisor',advisorEmail);const customer=auth('client','client@example.com');await updateDoc(doc(advisor,'invitations',token),{status:'revoked'});
 await assertFails(updateDoc(doc(customer,'invitations',token),{status:'accepted'}));await assertSucceeds(updateDoc(doc(advisor,'invitations',token),{status:'accepted'}));await assertSucceeds(getDoc(doc(customer,'clients','client')));
});
