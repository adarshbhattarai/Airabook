const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting emulators with seeded data...');

// Start emulators
const emulators = spawn('firebase', ['emulators:start'], {
  stdio: 'inherit',
  shell: true
});

// Wait a bit for emulators to start, then seed data
setTimeout(() => {
  console.log('🌱 Seeding data...');
  
  const seedProcess = spawn('node', ['functions/seedData.js'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });
  
  seedProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Data seeded successfully!');
    } else {
      console.log('❌ Seeding failed');
    }
  });
}, 10000); // Wait 10 seconds for emulators to start

emulators.on('close', (code) => {
  console.log(`Emulators stopped with code ${code}`);
});
