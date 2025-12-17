import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const formatAmount = (amountCents = 0, currency = 'usd') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format((amountCents || 0) / 100);
};

const DonateSuccess = () => {
  const [searchParams] = useSearchParams();
  const { entitlements } = useAuth();
  const [payment, setPayment] = useState(null);
  const [status, setStatus] = useState('loading');
  const paymentId = searchParams.get('paymentId');

  useEffect(() => {
    let active = true;
    const fetchPayment = async () => {
      if (!paymentId) {
        setStatus('missing');
        return;
      }
      try {
        const snapshot = await getDoc(doc(firestore, 'payments', paymentId));
        if (!active) {
          return;
        }
        if (snapshot.exists()) {
          setPayment(snapshot.data());
          setStatus('ready');
        } else {
          setStatus('pending');
        }
      } catch (error) {
        console.error('Unable to load payment', error);
        setStatus('error');
      }
    };
    fetchPayment();
    return () => {
      active = false;
    };
  }, [paymentId]);

  const isCompleted = status === 'ready' && payment?.status === 'completed';

  const headline = isCompleted ? 'Payment successful' : 'Thanks for your kindness!';

  return (
    <div className="min-h-screen bg-[#ecf0f1] flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-[#3498db]/10 p-10 text-center space-y-6"
      >
        <p className="text-sm uppercase tracking-[0.4em] text-[#3498db]">Donation received</p>
        <h1 className="text-4xl font-bold text-slate-900">{headline}</h1>
        <p className="text-slate-600">
          {isCompleted && payment
            ? `Your payment of ${formatAmount(payment.amount, payment.currency)} is successful.`
            : status === 'ready' && payment?.planLabel
              ? `You are now on the ${payment.planLabel} plan.`
              : 'We are confirming things with Stripe. This usually takes a few seconds.'}
        </p>

        <div className="bg-[#f5fbff] border border-[#3498db]/30 rounded-2xl p-6 text-left space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-[#3498db]">Receipt preview</p>
          <p className="text-3xl font-bold text-slate-900">
            {payment ? formatAmount(payment.amount, payment.currency) : '--'}
          </p>
          <p className="text-sm text-slate-500">
            Status:{' '}
            <span className="font-semibold text-[#2ecc71]">
              {payment?.status ? payment.status : status === 'pending' ? 'processing' : 'waiting'}
            </span>
          </p>
          {paymentId && (
            <p className="text-xs text-slate-400 break-words">Payment ID: {paymentId}</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-4">
          <Button asChild className="bg-[#3498db] hover:bg-[#2c82c9] text-white w-full">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-[#2ecc71] text-[#2ecc71] hover:bg-[#2ecc71]/10 w-full"
          >
            <Link to="/create-book" state={{ fromSuccess: true }}>
              {entitlements?.canWriteBooks ? 'Start writing' : 'Browse books'}
            </Link>
          </Button>
        </div>

        <p className="text-xs text-slate-400">
          Need to edit or refund a payment? Contact support@airabook.app with the payment ID.
        </p>
      </motion.div>
    </div>
  );
};

export default DonateSuccess;


