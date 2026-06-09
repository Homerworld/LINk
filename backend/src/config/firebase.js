const admin = require('firebase-admin');

let db;

const initFirebase = () => {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    return;
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || null;
  if (privateKey) {
    // Strip wrapping quotes Railway/shells sometimes keep, then turn \n into real newlines
    privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  }

  if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('Missing Firebase environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
};

const getDb = () => {
  if (!db) throw new Error('Firebase not initialized');
  return db;
};

// Firestore helpers
const collection = (name) => getDb().collection(name);

const getDoc = async (col, id) => {
  const doc = await collection(col).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
};

const setDoc = async (col, id, data) => {
  await collection(col).doc(id).set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { id, ...data };
};

const addDoc = async (col, data) => {
  const ref = await collection(col).add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...data };
};

const updateDoc = async (col, id, data) => {
  await collection(col).doc(id).update({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { id, ...data };
};

const deleteDoc = async (col, id) => {
  await collection(col).doc(id).delete();
};

const queryDocs = async (col, conditions = [], orderBy = null, limit = null) => {
  let ref = collection(col);
  for (const [field, op, value] of conditions) {
    ref = ref.where(field, op, value);
  }
  if (orderBy) ref = ref.orderBy(orderBy[0], orderBy[1] || 'asc');
  if (limit) ref = ref.limit(limit);
  const snap = await ref.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const increment = (n) => admin.firestore.FieldValue.increment(n);

module.exports = { initFirebase, getDb, collection, getDoc, setDoc, addDoc, updateDoc, deleteDoc, queryDocs, serverTimestamp, increment };
