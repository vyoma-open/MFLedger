export function playCoinSound() {
  const isSoundEnabled = localStorage.getItem('mfledger_sound') !== 'false';
  if (!isSoundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Coin chime: two frequencies played rapidly
    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1500, now + 0.1);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1760, now); // A6
    osc2.frequency.exponentialRampToValueAtTime(3000, now + 0.15);
    
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.error('Audio play failed:', e);
  }
}

export function playSuccessSound() {
  const isSoundEnabled = localStorage.getItem('mfledger_sound') !== 'false';
  if (!isSoundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const duration = 0.08;

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * duration);
      
      gainNode.gain.setValueAtTime(0.1, now + idx * duration);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * duration + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + idx * duration);
      osc.stop(now + idx * duration + duration);
    });
  } catch (e) {
    console.error('Audio play failed:', e);
  }
}

export function playCancelSound() {
  const isSoundEnabled = localStorage.getItem('mfledger_sound') !== 'false';
  if (!isSoundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Soft descending double-beep
    const notes = [220, 196]; // A3, G3
    const duration = 0.12;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * duration);
      
      gainNode.gain.setValueAtTime(0.08, now + idx * duration);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * duration + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(now + idx * duration);
      osc.stop(now + idx * duration + duration);
    });
  } catch (e) {
    console.error('Audio play failed:', e);
  }
}

export function playTrashSound() {
  const isSoundEnabled = localStorage.getItem('mfledger_sound') !== 'false';
  if (!isSoundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Synthesis of a trash paper crumple using synthesized noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.15); // 0.15s of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to make it sound scratchy/muffled
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1.5;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.12, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.15);
  } catch (e) {
    console.error('Audio play failed:', e);
  }
}

export function triggerConfetti(options?: { x?: number; y?: number; count?: number }) {
  const isAnimationsEnabled = localStorage.getItem('mfledger_animations') !== 'false';
  if (!isAnimationsEnabled) return;

  const count = options?.count ?? 25;
  const x = options?.x ?? window.innerWidth / 2;
  const y = options?.y ?? window.innerHeight / 2;
  
  const emojis = ['💰', '🪙', '✨', '💸', '📈', '🚀', '🍀', '💎'];
  
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.position = 'fixed';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = `${Math.floor(Math.random() * 12) + 14}px`;
    el.style.pointerEvents = 'none';
    el.style.zIndex = '9999';
    el.style.userSelect = 'none';
    
    // Physics
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 6 + 3;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity - 2; // Initial upward bias
    
    let currentX = x;
    let currentY = y;
    let currentVx = vx;
    let currentVy = vy;
    let opacity = 1;
    let rotation = Math.random() * 360;
    const rotationSpeed = (Math.random() - 0.5) * 8;
    
    el.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    document.body.appendChild(el);
    
    const startTime = Date.now();
    const duration = 800 + Math.random() * 400; // 0.8 - 1.2s
    
    function update() {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        el.remove();
        return;
      }
      
      const progress = elapsed / duration;
      currentX += currentVx;
      currentY += currentVy;
      
      // Gravity
      currentVy += 0.2;
      // Air resistance
      currentVx *= 0.97;
      currentVy *= 0.97;
      
      opacity = 1 - progress;
      rotation += rotationSpeed;
      
      el.style.left = `${currentX}px`;
      el.style.top = `${currentY}px`;
      el.style.opacity = `${opacity}`;
      el.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${1 - progress * 0.4})`;
      
      requestAnimationFrame(update);
    }
    
    requestAnimationFrame(update);
  }
}
