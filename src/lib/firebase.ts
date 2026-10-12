import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyDQo9oaIHxOcvPsDxy_7Sx4wCPApvNRBcE',
  authDomain: 'sync-3626f.firebaseapp.com',
  databaseURL: 'https://sync-3626f-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'sync-3626f',
  storageBucket: 'sync-3626f.firebasestorage.app',
  messagingSenderId: '566444076930',
  appId: '1:566444076930:web:37a75e45c043763931a99b',
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);