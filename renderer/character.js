console.log('Character.js loaded - VERSION WITH GITHUB FIX');

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
const bubbleCloseBtn = document.getElementById('bubble-close-btn');

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
  excited: '../assets/character-excited.png'
};

let isWalking = false;
let isBusy = false;
let currentMood = 'front';
let currentGitHubEvent = null;

// ===== MOOD SYSTEM =====
function setMood(mood, duration = null) {
  if (!SPRITES[mood]) {
    console.warn(`Unknown mood: ${mood}, using front`);
    mood = 'front';
  }
  console.log(`Mood: ${currentMood} → ${mood}`);
  currentMood = mood;
  vishal.src = SPRITES[mood];
  if (duration) {
    setTimeout(() => {
      if (currentMood === mood) setMood('casual');
    }, duration);
  }
}
window.setMood = setMood;

// ===== IDLE BOBBING =====
let bobDirection = 1;
let bobOffset = 0;
setInterval(() => {
  if (isWalking) return;
  bobOffset += bobDirection * 0.3;
  if (bobOffset > 4 || bobOffset < 0) bobDirection *= -1;
  if (vishal) vishal.style.transform = `translateY(${bobOffset}px)`;
}, 50);

// ===== HOVER NAME TAG =====
container.addEventListener('mouseenter', () => nameTag.style.opacity = '1');
container.addEventListener('mouseleave', () => nameTag.style.opacity = '0');
vishal.addEventListener('click', () => console.log('Vishal clicked'));

// ===== WALKING =====
function walkTo(targetX, targetY, direction, callback) {
  isWalking = true;
  vishal.src = SPRITES[direction];
  vishal.style.transform = 'translateY(0)';

  const rect = container.getBoundingClientRect();
  const startX = rect.left;
  const startY = rect.top;
  const distanceX = targetX - startX;
  const distanceY = targetY - startY;
  const duration = 1500;
  const startTime = performance.now();

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

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutQuad(progress);
    container.style.left = (startX + distanceX * eased) + 'px';
    container.style.top = (startY + distanceY * eased) + 'px';
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
  const homeX = screenW - 140 - 20;
  const homeY = screenH - 240 - 20;
  walkTo(homeX, homeY, 'right', () => {
    container.style.left = 'auto';
    container.style.top = 'auto';
    container.style.right = '20px';
    container.style.bottom = '20px';
    if (callback) callback();
  });
}

// ===== BUBBLE POSITIONING =====
function positionBubble() {
  const BUBBLE_WIDTH = 320;
  const BUBBLE_ESTIMATED_HEIGHT = 200;
  const rect = container.getBoundingClientRect();
  const vishalCenterX = rect.left + (rect.width / 2);
  
  let bubbleX = vishalCenterX - (BUBBLE_WIDTH / 2);
  let bubbleY = rect.top - BUBBLE_ESTIMATED_HEIGHT - 25;
  
  if (bubbleX < 10) bubbleX = 10;
  if (bubbleX + BUBBLE_WIDTH > window.innerWidth - 10) {
    bubbleX = window.innerWidth - BUBBLE_WIDTH - 10;
  }
  if (bubbleY < 10) bubbleY = rect.bottom + 25;
  
  bubble.style.left = bubbleX + 'px';
  bubble.style.top = bubbleY + 'px';
}

// ===== SHOW CHAT BUBBLE =====
function showChatBubble(message) {
  currentGitHubEvent = null;
  bubbleText.textContent = message;
  bubbleText.style.display = 'block';
  bubbleLoading.classList.add('hidden');
  bubbleButtons.innerHTML = '';
  bubbleInputArea.classList.remove('hidden');
  
  positionBubble();
  bubble.classList.remove('hidden');
  requestAnimationFrame(() => bubble.classList.add('visible'));
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
    if (lower.includes('approve')) btn.style.background = '#27ae60';
    else if (lower.includes('ignore') || lower.includes('later') || lower.includes('skip')) {
      btn.classList.add('later');
    }
    btn.textContent = label;
    btn.onclick = () => handleGitHubAction(label, event);
    bubbleButtons.appendChild(btn);
  });
  
  positionBubble();
  bubble.classList.remove('hidden');
  requestAnimationFrame(() => bubble.classList.add('visible'));
}

// ===== HANDLE GITHUB ACTION =====
async function handleGitHubAction(action, event) {
  console.log(`🎬 ACTION CLICKED: "${action}"`);
  console.log(`🎬 Event:`, event);
  
  hideBubble();
  
  const lower = action.toLowerCase().trim();
  
  // Open URL actions
  if (lower.includes('view') || lower.includes('open') || lower.includes('logs')) {
    console.log('🌐 → URL action');
    const urlToOpen = event.url || `https://github.com/vishalhirani978`;
    console.log(`🌐 → Opening: ${urlToOpen}`);
    
    try {
      const result = await window.vishalAPI.githubOpenUrl(urlToOpen);
      console.log('🌐 → Result:', result);
      setMood('pointingRight', 1500);
    } catch (err) {
      console.error('❌ Open failed:', err);
      setMood('armsCrossed', 1500);
    }
  }
  // Approve PR
  else if (lower === 'approve' && event.type === 'pr-review') {
    console.log('✅ → Approve action');
    setMood('thinking');
    try {
      const [owner, repo] = event.repo.split('/');
      const result = await window.vishalAPI.githubApprovePR({
        owner, repo, prNumber: event.number
      });
      if (result.success) {
        setMood('thumbsUp', 2000);
      } else {
        setMood('armsCrossed', 2000);
      }
    } catch (err) {
      console.error('❌ Approve error:', err);
      setMood('armsCrossed', 1500);
    }
  }
  // Dismiss
  else {
    console.log('👌 → Dismiss action');
    setMood('ok', 1500);
  }
  
  // ALWAYS walk home
  console.log('🏠 Walking home...');
  setTimeout(() => {
    walkHome(() => {
      window.vishalAPI.summonDone();
      isBusy = false;
      console.log('✅ Vishal returned home');
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
  bubble.classList.remove('visible');
  bubble.style.transform = 'scale(0)';
  setTimeout(() => bubble.classList.add('hidden'), 350);
}

// ===== SEND CHAT MESSAGE =====
async function sendMessageToVishal(userMessage) {
  console.log('Sending to Vishal:', userMessage);
  showBubbleLoading();
  setMood('thinking');
  try {
    const result = await window.vishalAPI.askVishal(userMessage);
    setMood('presenting');
    showChatBubble(result.response);
  } catch (err) {
    console.error('Error:', err);
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
  if (e.key === 'Enter') bubbleSendBtn.click();
  else if (e.key === 'Escape') bubbleCloseBtn.click();
});

bubbleCloseBtn.addEventListener('click', () => {
  hideBubble();
  setMood('waving', 1500);
  setTimeout(() => {
    walkHome(() => {
      window.vishalAPI.summonDone();
      isBusy = false;
      console.log('Vishal returned home');
    });
  }, 500);
});

// ===== STARTUP =====
setTimeout(() => {
  console.log('Vishal: Waving hello!');
  setMood('waving', 2500);
}, 1000);

// ===== LISTEN FOR CHAT SUMMON =====
if (window.vishalAPI && window.vishalAPI.onSummon) {
  window.vishalAPI.onSummon((data) => {
    console.log('Chat summon received:', data);
    if (isBusy) { console.log('Busy, ignoring'); return; }
    isBusy = true;
    
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const centerX = (screenW / 2) - 70;
    const centerY = (screenH / 2) - 100;

    walkTo(centerX, centerY, 'left', () => {
      setMood('thinking');
      setTimeout(() => {
        setMood('presenting');
        showChatBubble(data.message || "Hey boss! What can I help with?");
      }, 800);
    });
  });
}

// ===== LISTEN FOR GITHUB EVENT =====
if (window.vishalAPI && window.vishalAPI.onGitHubEvent) {
  window.vishalAPI.onGitHubEvent((event) => {
    console.log('🐙 GitHub event received:', event);
    if (isBusy) { console.log('Busy, ignoring event'); return; }
    isBusy = true;
    
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const centerX = (screenW / 2) - 70;
    const centerY = (screenH / 2) - 100;

    walkTo(centerX, centerY, 'left', () => {
      let moodForEvent = 'presenting';
      if (event.type === 'build-failure') moodForEvent = 'armsCrossed';
      else if (event.type === 'pr-review') moodForEvent = 'pointingRight';
      else if (event.type === 'issue-assigned') moodForEvent = 'thinking';
      else if (event.type === 'mention') moodForEvent = 'waving';
      else if (event.type === 'summary') moodForEvent = 'presenting';
      
      setMood(moodForEvent);
      setTimeout(() => {
        showGitHubBubble(event);
      }, 800);
    });
  });
}

console.log('Vishal: Ready. Ctrl+Alt+V to chat, Ctrl+Alt+G for GitHub.');