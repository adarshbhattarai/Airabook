try {
    const firebase = require('@genkit-ai/firebase');
    console.log('firebase exports:', Object.keys(firebase));
} catch (e) { console.log('firebase error', e.message); }

try {
    const https = require('firebase-functions/https');
    console.log('https exports:', Object.keys(https));
} catch (e) { console.log('https error', e.message); }

try {
    const genkit = require('genkit');
    console.log('genkit exports:', Object.keys(genkit));
} catch (e) { console.log('genkit error', e.message); }

try {
    const https = require('firebase-functions/v2/https');
    console.log('https v2 exports:', Object.keys(https));
} catch (e) { console.log('https v2 error', e.message); }
