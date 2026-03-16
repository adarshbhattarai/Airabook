export const BILLING_PLANS = {
  free: {
    key: 'free',
    label: 'Free',
    priceMonthly: 0,
    includedCreditsMonthly: 150,
    rolloverCap: 0,
    books: 3,
    pages: 150,
    storageMb: 50,
    voiceEnabled: false,
  },
  creator: {
    key: 'creator',
    label: 'Creator',
    priceMonthly: 7,
    includedCreditsMonthly: 2500,
    rolloverCap: 625,
    books: 25,
    pages: 5000,
    storageMb: 512,
    voiceEnabled: true,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    priceMonthly: 15,
    includedCreditsMonthly: 7000,
    rolloverCap: 1750,
    books: 100,
    pages: 20000,
    storageMb: 2048,
    voiceEnabled: true,
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    priceMonthly: 25,
    includedCreditsMonthly: 16000,
    rolloverCap: 4000,
    books: 500,
    pages: 100000,
    storageMb: 8192,
    voiceEnabled: true,
  },
};

export const CREDIT_PACKS = [
  {
    id: 'pack_1000',
    label: '1,000 credits',
    priceLabel: '$5',
    priceCents: 500,
    credits: 1000,
  },
  {
    id: 'pack_2750',
    label: '2,750 credits',
    priceLabel: '$12',
    priceCents: 1200,
    credits: 2750,
  },
  {
    id: 'pack_5000',
    label: '5,000 credits',
    priceLabel: '$20',
    priceCents: 2000,
    credits: 5000,
  },
];

export const COMMON_CREDIT_ESTIMATES = [
  { label: 'Rewrite a page', credits: '1-6 credits' },
  { label: 'Generate chapter outline', credits: '4-10 credits' },
  { label: 'Draft a full page', credits: '6-18 credits' },
  { label: 'Generate one image', credits: '24-30 credits' },
  { label: '1 minute of voice writing', credits: '12-20 credits' },
];

export const HOW_CREDITS_WORK = [
  'Creating blank books and pages uses workspace limits, not credits.',
  'AI writing and RAG consume credits from prompt and response token usage.',
  'Image generation consumes credits from prompt tokens plus Google image output tokens.',
  'Voice writing consumes credits from speech-to-text and text-to-speech usage.',
  'Stored media counts against your storage cap and also accrues daily storage-retention credits.',
];
