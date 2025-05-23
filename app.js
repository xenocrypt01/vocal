const bgVideo = document.getElementById('bg-video');
// UPDATE this video URL to your own link:
bgVideo.src = "https://www.w3schools.com/howto/rain.mp4";

const originalInput = document.getElementById('original-song');
const beatInput = document.getElementById('replacement-beat');
const originalVolumeSlider = document.getElementById('original-volume');
const beatVolumeSlider = document.getElementById('beat-volume');

const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const exportBtn = document.getElementById('export-btn');
const status = document.getElementById('status');

let audioContext;
let originalSource, beatSource;
let originalBuffer, beatBuffer;
let originalGainNode, beatGainNode;

let isPlaying = false;

function reset() {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  originalSource = null;
  beatSource = null;
  originalBuffer = null;
  beatBuffer = null;
  originalGainNode = null;
  beatGainNode = null;
  isPlaying = false;

  playBtn.disabled = !(originalBuffer && beatBuffer);
  stopBtn.disabled = true;
  exportBtn.disabled = !(originalBuffer && beatBuffer);
  status.textContent = '';
}

function setupAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  originalGainNode = audioContext.createGain();
  beatGainNode = audioContext.createGain();

  originalGainNode.gain.value = parseFloat(originalVolumeSlider.value);
  beatGainNode.gain.value = parseFloat(beatVolumeSlider.value);
}

async function loadAudioFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const arrayBuffer = ev.target.result;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        resolve(audioBuffer);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function loadFiles() {
  if (!originalInput.files[0] || !beatInput.files[0]) {
    status.textContent = 'Please upload both files.';
    playBtn.disabled = true;
    exportBtn.disabled = true;
    return;
  }

  status.textContent = 'Loading audio files...';
  try {
    setupAudioContext();

    originalBuffer = await loadAudioFile(originalInput.files[0]);
    beatBuffer = await loadAudioFile(beatInput.files[0]);

    status.textContent = 'Files loaded. Ready to play.';
    playBtn.disabled = false;
    exportBtn.disabled = false;
  } catch (err) {
    status.textContent = 'Error loading audio files: ' + err.message;
  }
}

function play() {
  if (isPlaying) return;
  isPlaying = true;
  status.textContent = 'Playing...';

  originalSource = audioContext.createBufferSource();
  originalSource.buffer = originalBuffer;
  originalSource.connect(originalGainNode).connect(audioContext.destination);

  beatSource = audioContext.createBufferSource();
  beatSource.buffer = beatBuffer;
  beatSource.connect(beatGainNode).connect(audioContext.destination);

  originalSource.start(0);
  beatSource.start(0);

  playBtn.disabled = true;
  stopBtn.disabled = false;

  // Stop automatically when shortest buffer ends
  const duration = Math.min(originalBuffer.duration, beatBuffer.duration);
  setTimeout(stop, duration * 1000);
}

function stop() {
  if (!isPlaying) return;
  isPlaying = false;

  if (originalSource) {
    originalSource.stop();
    originalSource.disconnect();
  }
  if (beatSource) {
    beatSource.stop();
    beatSource.disconnect();
  }

  playBtn.disabled = false;
  stopBtn.disabled = true;
  status.textContent = 'Stopped.';
}

// Volume controls
originalVolumeSlider.addEventListener('input', () => {
  if (originalGainNode) {
    originalGainNode.gain.value = parseFloat(originalVolumeSlider.value);
  }
});

beatVolumeSlider.addEventListener('input', () => {
  if (beatGainNode) {
    beatGainNode.gain.value = parseFloat(beatVolumeSlider.value);
  }
});

// Load files on file input change
originalInput.addEventListener('change', loadFiles);
beatInput.addEventListener('change', loadFiles);

playBtn.addEventListener('click', () => {
  // Resume AudioContext if needed (required by some browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume().then(play);
  } else {
    play();
  }
});
stopBtn.addEventListener('click', stop);

// Export mixed audio (basic, only merges raw buffers without processing)
exportBtn.addEventListener('click', async () => {
  status.textContent = 'Exporting mixed audio...';

  try {
    // Simple mixing of audio buffers (offline)
    const maxDuration = Math.min(originalBuffer.duration, beatBuffer.duration);
    const sampleRate = originalBuffer.sampleRate;

    // Create offline context
    const offlineCtx = new OfflineAudioContext(2, sampleRate * maxDuration, sampleRate);

    // Original track
    const origSource = offlineCtx.createBufferSource();
    origSource.buffer = originalBuffer;
    const origGain = offlineCtx.createGain();
    origGain.gain.value = parseFloat(originalVolumeSlider.value);
    origSource.connect(origGain).connect(offlineCtx.destination);

    // Beat track
    const beatSourceOffline = offlineCtx.createBufferSource();
    beatSourceOffline.buffer = beatBuffer;
    const beatGain = offlineCtx.createGain();
    beatGain.gain.value = parseFloat(beatVolumeSlider.value);
    beatSourceOffline.connect(beatGain).connect(offlineCtx.destination);

    origSource.start(0);
    beatSourceOffline.start(0);

    const renderedBuffer = await offlineCtx.startRendering();

    // Convert buffer to WAV blob
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);

    // Download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'mixed_audio.wav';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    status.textContent = 'Export complete! Download should start.';
  } catch (err) {
    status.textContent = 'Export failed: ' + err.message;
  }
});

// Helper: Convert AudioBuffer to WAV Blob
function bufferToWave(abuffer, len) {
  let numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [],
    i,
    sample,
    offset = 0,
    pos = 0;

  // write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      // clamp the sample
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      // scale to 16-bit signed int
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}
