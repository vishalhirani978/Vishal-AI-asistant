console.log('Character.js loaded — v1.4.0 (with Whisper voice input)');

// ===== DOM REFS =====
const vishal = document.getElementById('vishal');
const container = document.getElementById('vishal-container');
const nameTag = document.getElementById('vishal-name-tag');
const bubble = document.getElementById('thought-bubble');
const bubbleText = document.getElementById('bubble-text');
const bubbleButtons = document.getElementById('bubble-buttons');
const bubbleLoading = document.getElementById('bubble-loading');
const bubbleInputArea = document.getElementById('bubble-input-area');
const bubbleInput = document.getElementById('bubble-input');
const bubbleSendBtn = document.getElementById('bubble-send-btn');
const bubbleMicBtn = document.getElementById('bubble-mic-btn');
const bubbleCloseBtn = document.getElementById('bubble-close-btn');

// ===== SPRITES =====
const SPRITES = {
  front: '../assets/character-front.png',
  left: '../assets/character-left.png',
  right: '../assets/character-right.png',
  casual: '../assets/character-casual.png',
  thinking: '../assets/character-thinking.png',
  pointingLeft: '../assets/character-pointing-left.png',
  pointingRight: '../assets/character-pointing-right.png',
  presenting: '../assets/character-presenting.png',
  thumbsUp: '../assets/character-thumbs-up.png',
  ok: '../assets/character-ok.png',
  armsCrossed: '../assets/character-arms-crossed.png',
  waving: '../assets/character-waving.png',
  phone: '../assets/character-phone.png',
  headphones: '../assets/character-headphones.png',
  laptop: '../assets/character-laptop.png',
  excited: '../assets/character-excited.png',
};

// ===== STATE =====
let isWalking = false;
let isBusy = false;
let currentMood = 'front';
let currentGitHubEvent = null;
let currentAgentConfirmation = null;
let isDragging = false;
let charScale = 1.0;
let isListening = false;
let isTranscribing = false;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let moodBeforeListening = 'presenting';

// ===== APPLY SAVED SCALE =====
function applyScale(scale) {
  charScale = parseFloat(scale) || 1.0;
  container.style.transform = `scale(${charScale})`;
  container.style.transformOrigin = 'bottom right';
}

// ===== MOOD SYSTEM =====
function setMood(mood, duration = null) {
  if (!SPRITES[mood]) {
    console.warn(`Unknown mood: ${mood}, using front`);
    mood = 'front';
  }
  currentMood = mood;
  vishal.src = SPRITES[mood];
  if (duration) {
    setTimeout(() => {
      if (currentMood === mood) setMood('casual');
    }, duration);
  }
}
window.setMood = setMood;

// ===== START RECORDING =====
async function startListening() {
  if (isBusy && !bubble.classList.contains('visible')) return;
  if (isListening || isTranscribing) return;

  try {
    console.log('🎤 Requesting microphone...');
    
    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      } 
    });

    console.log('✅ Microphone access granted');

    // Create MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      console.log('🎤 Recording stopped, processing...');
      
      // Stop all audio tracks
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      // Process the recording
      await processRecording();
    };

    mediaRecorder.onerror = (event) => {
      console.error('🎤 MediaRecorder error:', event.error);
      stopListening();
    };

    // Start recording
    mediaRecorder.start();
    isListening = true;

    // Vishal puts on headphones
    moodBeforeListening = currentMood;
    setMood('headphones');

    // Update UI
    bubbleMicBtn.classList.add('listening');
    bubbleMicBtn.textContent = '⏹';
    bubbleMicBtn.title = 'Click to stop recording';
    bubbleInput.classList.add('listening');
    bubbleInput.placeholder = '🎤 Recording... click ⏹ when done';
    bubbleInput.value = '';

    console.log('🎤 Recording started');
  } catch (err) {
    console.error('❌ Failed to start recording:', err);
    
    if (err.name === 'NotAllowedError') {
      bubbleInput.placeholder = '❌ Mic permission denied';
    } else if (err.name === 'NotFoundError') {
      bubbleInput.placeholder = '❌ No microphone found';
    } else {
      bubbleInput.placeholder = '❌ ' + err.message;
    }
    
    setTimeout(() => {
      bubbleInput.placeholder = 'Type or click mic...';
    }, 3000);
    
    stopListening();
  }
}

// ===== STOP RECORDING =====
function stopListening() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (err) {
      console.log('MediaRecorder already stopped');
    }
  }

  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  isListening = false;

  // Restore mood (unless transcribing — keep headphones)
  if (!isTranscribing && currentMood === 'headphones') {
    setMood(moodBeforeListening || 'presenting');
  }

  // Reset UI
  bubbleMicBtn.classList.remove('listening');
  bubbleMicBtn.textContent = '🎤';
  bubbleMicBtn.title = 'Click to speak';
  bubbleInput.classList.remove('listening');
}

// ===== PROCESS RECORDING =====
async function processRecording() {
  if (audioChunks.length === 0) {
    console.log('🎤 No audio captured');
    stopListening();
    bubbleInput.placeholder = 'Type or click mic...';
    return;
  }

  isTranscribing = true;
  
  // Update UI — show transcribing state
  bubbleMicBtn.classList.add('disabled');
  bubbleInput.placeholder = '⏳ Transcribing your voice...';
  bubbleInput.classList.add('listening');
  setMood('thinking');

  try {
    // Combine all audio chunks
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    console.log('🎤 Audio blob size:', audioBlob.size, 'bytes');

    if (audioBlob.size < 1000) {
      console.log('🎤 Audio too short');
      bubbleInput.placeholder = '⚠️ Too short — try again';
      setTimeout(() => {
        bubbleInput.placeholder = 'Type or click mic...';
      }, 2000);
      return;
    }

    // Convert to ArrayBuffer
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Send to main process for Whisper transcription
    console.log('📤 Sending to Whisper...');
    const result = await window.vishalAPI.transcribeAudio(arrayBuffer, 'audio/webm');

    if (result.success && result.text) {
      console.log('✅ Got transcription:', result.text);
      bubbleInput.value = result.text;
      bubbleInput.placeholder = 'Edit or click Send';
    } else {
      console.error('❌ Transcription failed:', result.error);
      bubbleInput.placeholder = '❌ Transcription failed — type instead';
      setTimeout(() => {
        bubbleInput.placeholder = 'Type or click mic...';
      }, 3000);
    }
  } catch (err) {
    console.error('❌ Processing error:', err);
    bubbleInput.placeholder = '❌ Error — type instead';
    setTimeout(() => {
      bubbleInput.placeholder = 'Type or click mic...';
    }, 3000);
  } finally {
    isTranscribing = false;
    bubbleMicBtn.classList.remove('disabled');
    bubbleInput.classList.remove('listening');
    
    // Restore mood
    if (currentMood === 'thinking' || currentMood === 'headphones') {
      setMood('presenting');
    }
    
    // Focus input so user can edit/send
    setTimeout(() => bubbleInput.focus(), 100);
  }
}

// ===== TOGGLE LISTENING =====
function toggleListening() {
  if (isTranscribing) {
    console.log('🎤 Currently transcribing, please wait...');
    return;
  }
  
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
}

// ===== IDLE BOBBING =====
let bobDirection = 1;
let bobOffset = 0;
setInterval(() => {
  if (isWalking || isDragging) return;
  bobOffset += bobDirection * 0.3;
  if (bobOffset > 4 || bobOffset < 0) bobDirection *= -1;
  vishal.style.transform = `translateY(${bobOffset}px)`;
}, 50);

// ===== HOVER NAME TAG =====
container.addEventListener('mouseenter', () => (nameTag.style.opacity = '1'));
container.addEventListener('mouseleave', () => (nameTag.style.opacity = '0'));

// ===== DRAG TO REPOSITION =====
(function initDrag() {
  let dragStartX = 0;
  let dragStartY = 0;
  let containerStartX = 0;
  let containerStartY = 0;
  let hasMoved = false;

  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = container.getBoundingClientRect();
    containerStartX = rect.left;
    containerStartY = rect.top;

    window.vishalAPI.vishalActive();

    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.left = containerStartX + 'px';
    container.style.top = containerStartY + 'px';
    container.style.cursor = 'grabbing';

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }

    const newX = containerStartX + dx;
    const newY = containerStartY + dy;

    const maxX = window.innerWidth - container.offsetWidth;
    const maxY = window.innerHeight - container.offsetHeight;
    const clampedX = Math.max(0, Math.min(newX, maxX));
    const clampedY = Math.max(0, Math.min(newY, maxY));

    container.style.left = clampedX + 'px';
    container.style.top = clampedY + 'px';

    if (!bubble.classList.contains('hidden')) {
      positionBubble();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    container.style.cursor = 'pointer';

    const rect = container.getBoundingClientRect();
    window.vishalAPI.savePosition({ x: rect.left, y: rect.top });
    console.log('📍 Position saved:', rect.left, rect.top);

    if (!isBusy) {
      window.vishalAPI.vishalIdle();
    }

    if (!hasMoved && e.button === 0 && !isBusy) {
      handleVishalClick();
    }
  });
})();

// ===== RIGHT-CLICK CONTEXT MENU =====
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.vishalAPI.showContextMenu(e.screenX, e.screenY);
});

// ===== LISTEN FOR CONTEXT MENU ACTIONS =====
if (window.vishalAPI && window.vishalAPI.onContextMenuAction) {
  window.vishalAPI.onContextMenuAction((action) => {
    console.log('Context menu action:', action);
    switch (action) {
      case 'chat':
        if (!isBusy) handleVishalClick();
        break;

      case 'github-status':
        if (!isBusy) {
          window.vishalAPI.githubGetSummary().then((summary) => {
            const message =
              `📊 GitHub Status:\n` +
              `• PRs needing review: ${summary.prsNeedingReview}\n` +
              `• Issues assigned: ${summary.issuesAssigned}\n` +
              `• Mentions: ${summary.mentions}\n` +
              `• Build failures (24h): ${summary.buildFailures}`;

            summonWithGitHubBubble({
              type: 'summary',
              priority: 'info',
              title: 'GitHub Summary',
              message,
              url: `https://github.com`,
              actions: ['Open GitHub', 'Done'],
            });
          });
        }
        break;

      case 'quit':
        if (isListening) stopListening();
        setMood('waving');
        hideBubble();
        setTimeout(() => {
          window.vishalAPI.quitVishal();
        }, 1500);
        break;

      default:
        console.log('Unknown context menu action:', action);
    }
  });
}

// ===== LISTEN FOR SETTINGS CHANGES =====
if (window.vishalAPI && window.vishalAPI.onSettingsChanged) {
  window.vishalAPI.onSettingsChanged((settings) => {
    if (settings.charScale) applyScale(settings.charScale);
  });
}

// ===== GO IDLE =====
function goIdle() {
  if (isListening) stopListening();
  isBusy = false;
  window.vishalAPI.summonDone();
  window.vishalAPI.vishalIdle();
  console.log('✅ Vishal idle — screen clickable');
}

// ===== CLICK HANDLER =====
function handleVishalClick() {
  if (isBusy) return;
  isBusy = true;

  window.vishalAPI.vishalActive();

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const centerX = screenW / 2 - 70;
  const centerY = screenH / 2 - 100;

  walkTo(centerX, centerY, 'left', () => {
    setMood('thinking');
    setTimeout(() => {
      setMood('presenting');
      showChatBubble("Hey boss! What can I help with?");
    }, 600);
  });
}

// ===== WALKING =====
function walkTo(targetX, targetY, direction, callback) {
  isWalking = true;
  vishal.src = SPRITES[direction];
  vishal.style.transform = 'translateY(0)';

  const rect = container.getBoundingClientRect();
  const startX = rect.left;
  const startY = rect.top;

  const duration = Math.max(
    800,
    Math.min(2000, Math.hypot(targetX - startX, targetY - startY) * 1.2)
  );

  container.style.right = 'auto';
  container.style.bottom = 'auto';
  container.style.left = startX + 'px';
  container.style.top = startY + 'px';

  let walkBobOffset = 0;
  let walkBobDir = 1;
  const walkBobInterval = setInterval(() => {
    walkBobOffset += walkBobDir * 1;
    if (walkBobOffset > 6 || walkBobOffset < 0) walkBobDir *= -1;
    vishal.style.transform = `translateY(-${walkBobOffset}px)`;
  }, 80);

  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutQuad(progress);

    container.style.left = startX + (targetX - startX) * eased + 'px';
    container.style.top = startY + (targetY - startY) * eased + 'px';

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      clearInterval(walkBobInterval);
      vishal.src = SPRITES.casual;
      currentMood = 'casual';
      vishal.style.transform = 'translateY(0)';
      isWalking = false;
      if (callback) callback();
    }
  }

  requestAnimationFrame(animate);
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function walkHome(callback) {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const homeX = screenW - 160;
  const homeY = screenH - 260;

  walkTo(homeX, homeY, 'right', () => {
    container.style.left = 'auto';
    container.style.top = 'auto';
    container.style.right = '20px';
    container.style.bottom = '20px';
    if (callback) callback();
  });
}

// ===== BUBBLE POSITIONING =====
const bubbleTail = document.querySelector('.bubble-tail');

function positionBubble() {
  const BUBBLE_WIDTH = 300;
  const BUBBLE_MARGIN = 20;
  const rect = container.getBoundingClientRect();

  let bubbleX = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2;
  let bubbleY = rect.top - bubble.offsetHeight - 10;

  bubbleX = Math.max(
    BUBBLE_MARGIN,
    Math.min(bubbleX, window.innerWidth - BUBBLE_WIDTH - BUBBLE_MARGIN)
  );

  bubbleY = Math.max(BUBBLE_MARGIN + 30, bubbleY);

  bubble.style.left = bubbleX + 'px';
  bubble.style.top = bubbleY + 'px';
  alignTail();
}

function alignTail() {
  const bubbleRect = bubble.getBoundingClientRect();
  const charRect = container.getBoundingClientRect();
  const charCenterX = charRect.left + charRect.width / 2;
  const bubbleCenterX = bubbleRect.left + bubbleRect.width / 2;
  const offset = charCenterX - bubbleCenterX;
  const tailLeft = 50 + (offset / bubbleRect.width) * 50;
  bubbleTail.style.left = Math.max(10, Math.min(90, tailLeft)) + '%';
}

function makeBubbleDraggable() {
  let isDragging = false;
  let dragStartX, dragStartY, bubbleStartX, bubbleStartY;

  function onMouseDown(e) {
    if (e.target.closest('#bubble-close-btn') || e.target.closest('#bubble-mic-btn') || e.target.closest('#bubble-send-btn')) return;
    isDragging = true;
    const rect = bubble.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    bubbleStartX = rect.left;
    bubbleStartY = rect.top;
    bubble.style.cursor = 'grabbing';
    bubble.style.transition = 'none';
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    bubble.style.left = (bubbleStartX + dx) + 'px';
    bubble.style.top = (bubbleStartY + dy) + 'px';
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    bubble.style.cursor = '';
    bubble.style.transition = '';
    alignTail();
  }

  bubble.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ===== SHOW CHAT BUBBLE =====
function showChatBubble(message) {
  currentGitHubEvent = null;
  bubbleText.textContent = message;
  bubbleText.style.display = 'block';
  bubbleText.style.whiteSpace = 'normal';
  bubbleLoading.classList.add('hidden');
  bubbleButtons.innerHTML = '';
  bubbleInputArea.classList.remove('hidden');
  
  bubbleMicBtn.classList.remove('disabled');

  bubble.classList.remove('hidden');
  bubble.style.transform = 'scale(0)';
  positionBubble();
  requestAnimationFrame(() => {
    bubble.style.transform = '';
    bubble.classList.add('visible');
  });

  setTimeout(() => bubbleInput.focus(), 100);
}

// ===== SHOW GITHUB EVENT BUBBLE =====
function showGitHubBubble(event) {
  console.log('📦 Showing GitHub bubble:', event);
  currentGitHubEvent = event;

  bubbleText.textContent = `${event.title}\n${event.message}`;
  bubbleText.style.display = 'block';
  bubbleText.style.whiteSpace = 'pre-line';
  bubbleLoading.classList.add('hidden');
  bubbleInputArea.classList.add('hidden');

  bubbleButtons.innerHTML = '';
  (event.actions || ['Done']).forEach((label) => {
    const btn = document.createElement('button');
    btn.className = 'bubble-btn';
    const lower = label.toLowerCase();

    if (lower.includes('approve')) {
      btn.style.background = '#27ae60';
    } else if (
      lower.includes('ignore') ||
      lower.includes('later') ||
      lower.includes('skip') ||
      lower === 'done'
    ) {
      btn.classList.add('later');
    }

    btn.textContent = label;
    btn.onclick = () => handleGitHubAction(label, event);
    bubbleButtons.appendChild(btn);
  });

  bubble.classList.remove('hidden');
  bubble.style.transform = 'scale(0)';
  positionBubble();
  requestAnimationFrame(() => {
    bubble.style.transform = '';
    bubble.classList.add('visible');
  });
}

// ===== SHOW CONFIRMATION BUBBLE (Agent tool confirmation) =====
function showConfirmationBubble(confirmation) {
  console.log('🎯 Showing confirmation:', confirmation);
  currentAgentConfirmation = confirmation;
  currentGitHubEvent = null;

  bubbleText.textContent = `${confirmation.title}\n${confirmation.description}`;
  bubbleText.style.display = 'block';
  bubbleText.style.whiteSpace = 'pre-line';
  bubbleLoading.classList.add('hidden');
  bubbleInputArea.classList.add('hidden');

  bubbleButtons.innerHTML = '';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'bubble-btn confirm-yes';
  yesBtn.textContent = '✓ Yes, do it';
  yesBtn.onclick = () => handleAgentConfirmation('yes');
  bubbleButtons.appendChild(yesBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'bubble-btn confirm-cancel';
  cancelBtn.textContent = '✗ Cancel';
  cancelBtn.onclick = () => handleAgentConfirmation('cancel');
  bubbleButtons.appendChild(cancelBtn);

  setMood('pointingRight');

  bubble.classList.remove('hidden');
  bubble.style.transform = 'scale(0)';
  positionBubble();
  requestAnimationFrame(() => {
    bubble.style.transform = '';
    bubble.classList.add('visible');
  });
}

// ===== HANDLE AGENT CONFIRMATION =====
async function handleAgentConfirmation(choice) {
  if (!currentAgentConfirmation) return;

  const confirmation = currentAgentConfirmation;
  currentAgentConfirmation = null;

  if (choice === 'yes') {
    hideBubble();
    setMood('laptop');
    window.vishalAPI.vishalIdle();

    try {
      const result = await window.vishalAPI.agentExecute(
        confirmation.toolName,
        confirmation.params
      );

      window.vishalAPI.vishalActive();
      if (result.success) {
        setMood('excited', 2000);
        setTimeout(() => {
          setMood('presenting');
          showChatBubble(`✅ Done! ${result.message}`);
        }, 300);
      } else {
        setMood('armsCrossed', 2000);
        setTimeout(() => {
          setMood('presenting');
          showChatBubble(`❌ Sorry boss, ${result.error}`);
        }, 300);
      }
    } catch (err) {
      console.error('❌ Agent execute error:', err);
      window.vishalAPI.vishalActive();
      setMood('armsCrossed', 2000);
      setTimeout(() => {
        setMood('presenting');
        showChatBubble('❌ Sorry boss, that didn\'t work.');
      }, 300);
    }
  } else {
    hideBubble();
    setMood('ok', 2000);
    setTimeout(() => {
      showChatBubble('👍 Cancelled, boss');
      setTimeout(() => {
        hideBubble();
        walkHome(() => {
          goIdle();
        });
      }, 2000);
    }, 300);
  }
}

// ===== SUMMON WITH GITHUB BUBBLE =====
function summonWithGitHubBubble(event) {
  if (isBusy) return;
  isBusy = true;

  window.vishalAPI.vishalActive();

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const centerX = screenW / 2 - 70;
  const centerY = screenH / 2 - 100;

  walkTo(centerX, centerY, 'left', () => {
    let mood = 'presenting';
    if (event.type === 'build-failure') mood = 'armsCrossed';
    else if (event.type === 'pr-review') mood = 'pointingRight';
    else if (event.type === 'issue-assigned') mood = 'thinking';
    else if (event.type === 'mention') mood = 'waving';

    setMood(mood);
    setTimeout(() => showGitHubBubble(event), 600);
  });
}

// ===== HANDLE GITHUB ACTION =====
async function handleGitHubAction(action, event) {
  console.log(`🎬 ACTION: "${action}"`);
  hideBubble();

  const lower = action.toLowerCase().trim();

  if (lower.includes('view') || lower.includes('open') || lower.includes('logs')) {
    const urlToOpen = event.url || `https://github.com`;
    console.log('🌐 Opening:', urlToOpen);
    try {
      await window.vishalAPI.githubOpenUrl(urlToOpen);
      setMood('pointingRight', 1500);
    } catch (err) {
      console.error('❌ Open URL failed:', err);
      setMood('armsCrossed', 1500);
    }
  } else if (lower === 'approve' && event.type === 'pr-review') {
    setMood('thinking');
    try {
      const [owner, repo] = event.repo.split('/');
      const result = await window.vishalAPI.githubApprovePR({
        owner,
        repo,
        prNumber: event.number,
      });
      setMood(result.success ? 'thumbsUp' : 'armsCrossed', 2000);
    } catch (err) {
      console.error('❌ Approve failed:', err);
      setMood('armsCrossed', 1500);
    }
  } else {
    setMood('ok', 1500);
  }

  setTimeout(() => {
    walkHome(() => {
      goIdle();
    });
  }, 1800);
}

// ===== SHOW LOADING =====
function showBubbleLoading() {
  bubbleText.textContent = '';
  bubbleText.style.display = 'none';
  bubbleLoading.classList.remove('hidden');
  bubbleButtons.innerHTML = '';
  bubbleInputArea.classList.add('hidden');
  positionBubble();
}

// ===== HIDE BUBBLE =====
function hideBubble() {
  if (isListening) stopListening();
  bubble.classList.remove('visible');
  setTimeout(() => {
    bubble.classList.add('hidden');
    bubble.style.transform = 'scale(0)';
  }, 350);
}

// ===== SEND CHAT MESSAGE (Agent-powered) =====
async function sendMessageToVishal(userMessage) {
  if (isListening) stopListening();

  showBubbleLoading();
  setMood('thinking');

  try {
    const result = await window.vishalAPI.agentParse(userMessage);

    if (result.type === 'chat') {
      setMood('presenting');
      showChatBubble(result.response);
      return;
    }

    if (result.type === 'confirmation') {
      showConfirmationBubble(result.confirmation);
      return;
    }

    setMood('presenting');
    showChatBubble(`Sorry boss, I'm not sure what to do with that.`);
  } catch (err) {
    console.error('Agent error:', err);
    setMood('armsCrossed');
    showChatBubble("Sorry boss, something went wrong. Try again?");
  }
}

// ===== INPUT HANDLERS =====
bubbleSendBtn.addEventListener('click', () => {
  const message = bubbleInput.value.trim();
  if (!message) return;
  bubbleInput.value = '';
  sendMessageToVishal(message);
});

bubbleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    bubbleSendBtn.click();
  }
  if (e.key === 'Escape') bubbleCloseBtn.click();
});

// ===== MIC BUTTON HANDLER =====
bubbleMicBtn.addEventListener('click', () => {
  toggleListening();
});

bubbleCloseBtn.addEventListener('click', () => {
  if (isListening) stopListening();
  currentAgentConfirmation = null;
  hideBubble();
  setMood('waving', 1500);
  setTimeout(() => {
    walkHome(() => {
      goIdle();
    });
  }, 500);
});

// ===== STARTUP: LOAD SAVED POSITION =====
async function initPosition() {
  try {
    const saved = await window.vishalAPI.getPosition();
    if (saved && saved.x !== null && saved.y !== null) {
      console.log('📍 Restoring position:', saved);
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.left = saved.x + 'px';
      container.style.top = saved.y + 'px';
    }
  } catch (e) {
    console.log('No saved position, using default');
  }
}

// ===== STARTUP SEQUENCE =====
makeBubbleDraggable();
initPosition().then(() => {
  setTimeout(() => {
    setMood('waving', 2500);
  }, 500);
});

// ===== STARTUP GREETING =====
if (window.vishalAPI && window.vishalAPI.onStartupGreeting) {
  window.vishalAPI.onStartupGreeting((data) => {
    console.log('👋 Startup greeting:', data);
    setMood('waving', 3000);
    nameTag.style.opacity = '1';
    setTimeout(() => { nameTag.style.opacity = '0'; }, 3000);
  });
}

// ===== LISTEN FOR CHAT SUMMON =====
if (window.vishalAPI && window.vishalAPI.onSummon) {
  window.vishalAPI.onSummon((data) => {
    console.log('Chat summon received:', data);
    if (isBusy) return;
    isBusy = true;

    window.vishalAPI.vishalActive();

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const centerX = screenW / 2 - 70;
    const centerY = screenH / 2 - 100;

    walkTo(centerX, centerY, 'left', () => {
      setMood('thinking');
      setTimeout(() => {
        setMood('presenting');
        showChatBubble(data.message || "Hey boss! What can I help with?");
      }, 600);
    });
  });
}

// ===== LISTEN FOR GITHUB EVENT =====
if (window.vishalAPI && window.vishalAPI.onGitHubEvent) {
  window.vishalAPI.onGitHubEvent((event) => {
    console.log('🐙 GitHub event received:', event);
    if (isBusy) {
      console.log('Busy, skipping');
      return;
    }
    summonWithGitHubBubble(event);
  });
}

// ===== LISTEN FOR VOICE INPUT HOTKEY =====
if (window.vishalAPI && window.vishalAPI.onStartVoiceInput) {
  window.vishalAPI.onStartVoiceInput(() => {
    console.log('🎤 Voice input hotkey pressed');
    
    if (!bubble.classList.contains('visible')) {
      if (isBusy) return;
      isBusy = true;
      window.vishalAPI.vishalActive();
      
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const centerX = screenW / 2 - 70;
      const centerY = screenH / 2 - 100;
      
      walkTo(centerX, centerY, 'left', () => {
        setMood('presenting');
        showChatBubble("Hey boss! Click 🎤 to speak");
        setTimeout(() => startListening(), 500);
      });
    } else {
      toggleListening();
    }
  });
}

console.log('✅ Vishal ready. Ctrl+Alt+V chat | Ctrl+Alt+G github | Ctrl+Alt+Space voice | right-click menu | drag to move');