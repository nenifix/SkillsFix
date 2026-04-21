import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

// Connectivity check as per guidelines
async function testConnection() {
  try {
    const testDoc = doc(db, '_internal', 'connectivity-check');
    await getDocFromServer(testDoc);
    console.log("Firebase connection established successfully.");
  } catch (error: any) {
    if (error.code === 'not-found') {
      console.log("Firebase server reached (document not found, which is expected). Connection is active.");
      return;
    }

    console.error("Firebase connection check failed:", error.message || error);
    
    if (error.code === 'permission-denied') {
      console.warn("Firestore rules may be blocking access. Please deploy your security rules.");
    } else if (error.message && error.message.includes('offline')) {
      console.error("CRITICAL: The client is offline or the database has NOT been provisioned yet.");
      console.warn("ACTION REQUIRED: Go to https://console.firebase.google.com/project/skillsfix-f5a3a/firestore and click 'Create Database' if you haven't already.");
    }
  }
}

testConnection();
