import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { parseEmailAction, verifyEmailLink, emailActionError } from '../lib/email-actions.ts';

const project='demo-review-my-asset';
const host='https://review-my-asset-uttam-2026.firebaseapp.com/__/auth/action';
const link=(code='example-code-12345',mode='verifyEmail',continueUrl='https://review-my-asset-uttam-2026.web.app/')=>`${host}?mode=${mode}&oobCode=${code}&apiKey=&continueUrl=${encodeURIComponent(continueUrl)}`;
test('parses a Firebase verification link with an empty apiKey',()=>{
 assert.deepEqual(parseEmailAction(link()),{mode:'verifyEmail',code:'example-code-12345',continuePath:'/'});
});
test('preserves only a valid client invitation in the return URL',()=>{
 const invite='a'.repeat(64);assert.equal(parseEmailAction(link(undefined,undefined,`https://review-my-asset-uttam-2026.web.app/?invite=${invite}&oobCode=secret`)).continuePath,`/?invite=${invite}`);
});
test('never follows an external or recursive action return URL',()=>{
 assert.equal(parseEmailAction(link(undefined,undefined,'https://evil.example')).continuePath,'/');
 assert.equal(parseEmailAction(link(undefined,undefined,'https://review-my-asset-uttam-2026.web.app/auth/action?oobCode=secret')).continuePath,'/');
});
test('rejects foreign hosts, credential URLs, HTTP links, and invalid modes',()=>{
 for(const url of [link().replace('review-my-asset-uttam-2026.firebaseapp.com','evil.example'),link().replace('https://','http://'),link().replace('https://','https://user:password@'),link(undefined,'verifyemail')])assert.throws(()=>parseEmailAction(url));
});
test('missing codes cannot produce a verification action',()=>{assert.throws(()=>parseEmailAction(`${host}?mode=verifyEmail&apiKey=`),/missing/);});
test('email errors explain expired or already-used links',()=>{assert.match(emailActionError({code:'auth/invalid-action-code'}),/expired or has already been used/);});

async function setup(name,email) {
 const app=initializeApp({projectId:project,apiKey:'demo-key',authDomain:`${project}.firebaseapp.com`},name);const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 await createUserWithEmailAndPassword(auth,email,'A-test-only-long-password');return {app,auth};
}
async function latestCode(email,requestType){const {oobCodes}=await(await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/oobCodes`)).json();return oobCodes.findLast(c=>c.email===email&&c.requestType===requestType).oobCode;}
test('real verification works with an empty-key email URL, rejects another recipient, and blocks replay',async()=>{
 const {app,auth}=await setup('verify-link','link-test@example.com');
 try {
  assert.equal(auth.currentUser.emailVerified,false);await sendEmailVerification(auth.currentUser);const code=await latestCode('link-test@example.com','VERIFY_EMAIL');
  await assert.rejects(verifyEmailLink(auth,link(code),'another@example.com'),/different email/);assert.equal(auth.currentUser.emailVerified,false);
  const result=await verifyEmailLink(auth,link(code),'link-test@example.com');assert.equal(result.email,'link-test@example.com');assert.equal(auth.currentUser.emailVerified,true);
  await assert.rejects(verifyEmailLink(auth,link(code)),{code:'auth/invalid-action-code'});
 } finally {await deleteApp(app);}
});
test('a password reset code cannot verify an email and stays available for password recovery',async()=>{
 const {app,auth}=await setup('reset-link','reset-link-test@example.com');
 try {
  await sendPasswordResetEmail(auth,'reset-link-test@example.com');const code=await latestCode('reset-link-test@example.com','PASSWORD_RESET');
  await assert.rejects(verifyEmailLink(auth,link(code)),/cannot verify/);assert.equal(auth.currentUser.emailVerified,false);
  assert.equal(await verifyPasswordResetCode(auth,parseEmailAction(link(code,'resetPassword')).code),'reset-link-test@example.com');
  await confirmPasswordReset(auth,code,'A-new-test-only-long-password');
 } finally {await deleteApp(app);}
});
test('a forged verification code cannot change Firebase verification status',async()=>{
 const {app,auth}=await setup('fake-link','fake-link-test@example.com');
 try {await assert.rejects(verifyEmailLink(auth,link('a-fake-verification-code')),{code:'auth/invalid-action-code'});assert.equal(auth.currentUser.emailVerified,false);}
 finally {await deleteApp(app);}
});
