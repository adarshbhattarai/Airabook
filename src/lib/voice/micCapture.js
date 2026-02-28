export const startMicCapture = async ({
  targetSampleRate = 16000,
  onPcm,
} = {}) => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone is not available in this environment.');
  }
  if (typeof onPcm !== 'function') {
    throw new Error('startMicCapture requires an onPcm callback.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextImpl) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Web Audio (AudioContext) is not supported in this browser.');
  }

  const audioContext = new AudioContextImpl();

  // AudioWorklet module must be a real URL. Vite will bundle/serve it correctly.
  await audioContext.audioWorklet.addModule(new URL('./pcmCaptureProcessor.js', import.meta.url));

  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetSampleRate },
  });

  const mute = audioContext.createGain();
  mute.gain.value = 0;

  workletNode.port.onmessage = (evt) => {
    // evt.data is { pcmBuffer: ArrayBuffer (transferred), rms: number }
    const data = evt?.data;
    if (data?.pcmBuffer instanceof ArrayBuffer) {
      onPcm({ pcmBuffer: data.pcmBuffer, rms: typeof data.rms === 'number' ? data.rms : 0 });
    }
  };

  source.connect(workletNode);
  workletNode.connect(mute);
  mute.connect(audioContext.destination);

  // Some browsers start suspended until user gesture; caller is triggered by click.
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const stop = async () => {
    try {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
      source.disconnect();
      mute.disconnect();
    } catch (_) {
      // ignore
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch (_) {
      // ignore
    }
    try {
      await audioContext.close();
    } catch (_) {
      // ignore
    }
  };

  return { stop, audioContext };
};

