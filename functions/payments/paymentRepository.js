const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const db = admin.firestore();
const COLLECTION = 'payments';

const paymentRepository = {
  async createPayment(paymentId, payload) {
    const docRef = db.collection(COLLECTION).doc(paymentId);
    await docRef.set({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return docRef;
  },

  async updatePayment(paymentId, payload) {
    const docRef = db.collection(COLLECTION).doc(paymentId);
    await docRef.set(
      {
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return docRef;
  },

  async getPayment(paymentId) {
    const doc = await db.collection(COLLECTION).doc(paymentId).get();
    return doc.exists ? doc.data() : null;
  },
};

module.exports = { paymentRepository };


