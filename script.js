// НАСТРОЙКИ: Ссылки на изображения капибары
const IMAGES = {
    main: "capybara-main.png",
    sad: "capybara-sad.png",
    eyesClosed: "capybara-eyesclosed.png",
    sadClosed: "capybara-sad-closed.png",
    welcome: "capybara-welcome.png",
    welcomeClosed: "capybara-welcome-closed.png"
};

const DRAIN_TIMES = { 
    water: 2 * 60 * 60 * 1000,
    eyes: 45 * 60 * 1000,
    stretch: 60 * 60 * 1000,
    breath: 3 * 60 * 60 * 1000
};

const TIPS = {
    water: ["Сходи попей воды, чтобы освежить тело и вернуть фокус."],
    eyes: ["Разогрей ладони трением, накрой ими закрытые глаза и расслабься в темноте.", "Переводи взгляд с кончика носа на дальнюю точку за окном каждые 3–5 секунд.", "Быстро поморгай 10 секунд, чтобы увлажнить глаза."],
    stretch: ["Сцепи пальцы рук в замок над головой и потянись вверх.", "Медленно поверни голову вправо на 3 секунды, а затем влево.", "Подними плечи к ушам, напряги и резко сбрось вниз."],
    breath: ["Вдохни носом, выдохни через приоткрытый рот.", "Дыши по «квадрату»: вдох, задержка дыхания, выдох, пауза перед следующим вдохом.", "Зажми левую ноздрю — вдох. Закрой правую — выдох."]
};

const VIDEOS = {
    water: ["video-water.mp4"],
    eyes: ["video-eyes1.mp4", "video-eyes2.mp4", "video-eyes3.mp4"],
    stretch: ["video-body1.mp4", "video-body2.mp4", "video-body3.mp4"],
    breath: ["video-breath1.mp4", "video-breath2.mp4", "video-breath3.mp4"]
};

const COLORS = {
    water: 'bg-water',
    eyes: 'bg-eyes',
    stretch: 'bg-stretch',
    breath: 'bg-breath'
};

// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
let state = { 
    stats: { water: 100, eyes: 100, stretch: 100, breath: 100 }, 
    lastUpdated: Date.now(), 
    zen: 0,
    isMeeting: false,
    actionIndices: { water: 0, eyes: 0, stretch: 0, breath: 0 } 
};

let isActionRunning = false;
let tabAlarmInterval = null;
let isAlarmActive = false;
let isBlinkingNow = false; 
let isWelcomeOpen = false; 
let welcomeBubbleInterval = null;
let activeWelcomeBubbles = 0; 
let actionTimeout = null; 
let activeActionType = null; 
let jumpTimeout = null; // Таймер анимации прыжка

// Ленивая инициализация AudioContext для обхода блокировок браузера
let audioCtx = null;

function loadState() {
    const saved = localStorage.getItem('chillbara_state');
    if (saved) { 
        state = JSON.parse(saved); 
        if (!state.actionIndices) state.actionIndices = { water: 0, eyes: 0, stretch: 0, breath: 0 };
        if (state.zen === undefined) state.zen = 0;
        if (state.isMeeting === undefined) state.isMeeting = false;
    }
    
    const toggleInput = document.getElementById('meeting-toggle');
    if (toggleInput) {
        toggleInput.checked = !!state.isMeeting;
        applyMeetingModeUI(!!state.isMeeting, true);
    }

    // Рассчитываем прошедшее оффлайн-время
    calculateOfflineDrain();

    // Проверка первого запуска для приветственного экрана
    const welcomeSeen = localStorage.getItem('chillbara_welcome_seen');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    if (!welcomeSeen) {
        isWelcomeOpen = true;
        if (welcomeOverlay) {
            welcomeOverlay.classList.add('active'); // Показываем экран без миганий
        }
        startWelcomeBubbles();
    } else {
        if (welcomeOverlay) welcomeOverlay.remove();
        isWelcomeOpen = false;
    }
}

function saveState() {
    state.lastUpdated = Date.now();
    localStorage.setItem('chillbara_state', JSON.stringify(state));
}

function closeWelcome() {
    isWelcomeOpen = false;
    const welcomeOverlay = document.getElementById('welcome-overlay');
    if (welcomeOverlay) welcomeOverlay.classList.add('fade-out');
    localStorage.setItem('chillbara_welcome_seen', 'true');
    
    if (welcomeBubbleInterval) { clearInterval(welcomeBubbleInterval); welcomeBubbleInterval = null; }
    document.querySelectorAll('#welcome-overlay .glass-bubble').forEach(el => el.remove());
    activeWelcomeBubbles = 0;

    setTimeout(() => {
        const welcomeEl = document.getElementById('welcome-overlay');
        if(welcomeEl) welcomeEl.remove(); 
    }, 400);
}

// Рассчитываем оффлайн-уменьшение шкал при входе в игру
function calculateOfflineDrain() {
    if (state.isMeeting || isWelcomeOpen) { 
        state.lastUpdated = Date.now(); 
        return; 
    }
    
    const timePassed = Date.now() - state.lastUpdated;
    if (timePassed > 0) {
        Object.keys(state.stats).forEach(key => {
            state.stats[key] = Math.max(0, state.stats[key] - (timePassed / DRAIN_TIMES[key]) * 100);
        });
    }
    state.lastUpdated = Date.now();
    updateUI();
    saveState();
}

function calculateDrain() {
    if (state.isMeeting || isWelcomeOpen) { state.lastUpdated = Date.now(); return; }
    
    const timePassed = Date.now() - state.lastUpdated;
    Object.keys(state.stats).forEach(key => {
        state.stats[key] = Math.max(0, state.stats[key] - (timePassed / DRAIN_TIMES[key]) * 100);
    });
    
    state.lastUpdated = Date.now();
    updateUI();
    saveState();
}

function updateUI() {
    Object.keys(state.stats).forEach(key => {
        const val = Math.round(state.stats[key]);
        const bar = document.getElementById(`bar-${key}`);
        const valEl = document.getElementById(`val-${key}`);
        if (bar) bar.style.width = `${val}%`;
        if (valEl) valEl.innerText = `${val}%`;
    });

    const isSad = Object.values(state.stats).some(val => val <= 10);
    const img = document.getElementById('capybara-img');

    if (isSad && !state.isMeeting) {
        if (!isBlinkingNow && !isActionRunning) img.src = IMAGES.sad;
        if (!tabAlarmInterval) {
            tabAlarmInterval = setInterval(() => { 
                document.title = isAlarmActive ? "✨Пора сделать паузу" : "🫶 Позаботься о себе"; 
                isAlarmActive = !isAlarmActive; 
            }, 1000);
        }
    } else {
        if (!state.isMeeting && !isBlinkingNow && !isActionRunning) img.src = IMAGES.main;
        if (tabAlarmInterval) { clearInterval(tabAlarmInterval); tabAlarmInterval = null; document.title = "Моя Капибара"; }
    }
}

function startAction(type) {
    if (isActionRunning) return;
    isActionRunning = true;
    activeActionType = type;

    const overlay = document.getElementById('action-overlay');
    const progress = document.getElementById('action-progress');
    const currentIndex = state.actionIndices[type];
    
    state.actionIndices[type] = (currentIndex + 1) % TIPS[type].length;
    saveState();

    document.getElementById('action-text').innerText = TIPS[type][currentIndex];
    document.getElementById('action-icon').innerHTML = `<video src="${VIDEOS[type][currentIndex]}" autoplay muted playsinline></video>`;

    progress.className = `progress-fill ${COLORS[type]}`;
    overlay.classList.add('active');
    
    progress.classList.remove('timer-anim');
    void progress.offsetWidth; 
    progress.classList.add('timer-anim');

    actionTimeout = setTimeout(() => { completeAction(); }, 10000);
}

function completeAction() {
    if (!isActionRunning) return;
    if (actionTimeout) { clearTimeout(actionTimeout); actionTimeout = null; }

    document.getElementById('action-overlay').classList.remove('active');
    document.getElementById('action-progress').classList.remove('timer-anim');
    
    setTimeout(() => { document.getElementById('action-icon').innerHTML = ''; }, 300);

    state.stats[activeActionType] = 100;
    isActionRunning = false;
    
    const img = document.getElementById('capybara-img');
    
    // СБРОС АНИМАЦИИ ПРЕДЫДУЩЕГО ПРЫЖКА
    img.classList.remove('capy-jump');
    void img.offsetWidth; // Хак для мгновенного сброса анимации в браузере
    if (jumpTimeout) clearTimeout(jumpTimeout);

    img.classList.remove('capy-idle'); 
    img.classList.add('capy-jump');    
    jumpTimeout = setTimeout(() => { 
        img.classList.remove('capy-jump'); 
        img.classList.add('capy-idle'); 
        jumpTimeout = null;
    }, 900);

    updateUI();
    saveState();
}

function applyMeetingModeUI(active, isInitial = false) {
    const bg = document.body;
    const img = document.getElementById('capybara-img');
    const controls = document.getElementById('controls-container');
    const zzzParticles = document.getElementById('sleep-particles');

    if (active) {
        bg.classList.add('meeting-mode');
        if (isInitial) { 
            if (controls) controls.style.display = 'none'; 
        } else { 
            if (controls) {
                controls.style.opacity = '0'; 
                controls.style.pointerEvents = 'none'; 
                setTimeout(() => { if(state.isMeeting && controls) controls.style.display = 'none'; }, 300); 
            }
        }
        
        img.src = IMAGES.eyesClosed;
        img.classList.add('sleep-state');
        if (zzzParticles) zzzParticles.classList.remove('hidden');
    } else {
        bg.classList.remove('meeting-mode');
        if (controls) {
            controls.style.display = 'grid';
            if (isInitial) { controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; } 
            else { setTimeout(() => { if(!state.isMeeting && controls) { controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; } }, 50); }
        }
        
        img.src = IMAGES.main;
        img.classList.remove('sleep-state');
        if (zzzParticles) zzzParticles.classList.add('hidden');
        document.querySelectorAll('.glass-bubble').forEach(el => el.remove());
        state.lastUpdated = Date.now();
    }
    updateUI();
}

document.getElementById('meeting-toggle').addEventListener('change', (e) => {
    state.isMeeting = e.target.checked;
    saveState();
    applyMeetingModeUI(state.isMeeting);
});

function initAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
}

function playPopSound() {
    initAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

// Моргание основной Капибары
setInterval(() => {
    if (isWelcomeOpen || state.isMeeting || isActionRunning || isBlinkingNow) return;
    isBlinkingNow = true;
    const img = document.getElementById('capybara-img');
    const isSad = Object.values(state.stats).some(val => val <= 10);
    img.src = isSad ? IMAGES.sadClosed : IMAGES.eyesClosed;
    setTimeout(() => { if (!state.isMeeting && !isActionRunning) img.src = isSad ? IMAGES.sad : IMAGES.main; isBlinkingNow = false; }, 150);
}, 8000);

// Моргание Капибары на приветственном экране
setInterval(() => {
    if (!isWelcomeOpen) return;
    const img = document.getElementById('welcome-capy-img');
    if (img) { img.src = IMAGES.welcomeClosed; setTimeout(() => { img.src = IMAGES.welcome; }, 150); }
}, 8000);

function createGlassBubble(startX, startY, isWelcome = false) {
    const bubble = document.createElement('div');
    bubble.className = isWelcome ? 'glass-bubble welcome-bubble-style' : 'glass-bubble';
    
    const size = 60 + Math.random() * 80; 
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${startX - (size / 2)}px`; 
    bubble.style.top = `${startY - (size / 2)}px`;
    
    bubble.style.setProperty('--end-x', `${(Math.random() - 0.5) * window.innerWidth}px`);
    bubble.style.setProperty('--end-y', `${(Math.random() - 0.5) * window.innerHeight}px`);
    bubble.style.setProperty('--duration', `${3 + Math.random() * 2}s`);

    // СЧЕТЧИК ПУЗЫРЕЙ НА СТАРТЕ: Корректно считаем живые пузыри
    if (isWelcome) {
        activeWelcomeBubbles++;
    }

    const popBubble = (e) => {
        e.stopPropagation(); 
        playPopSound(); 
        bubble.classList.add('popped');
        if (!isWelcome) { 
            state.zen += 1; 
            updateUI(); 
            saveState(); 
        } else {
            activeWelcomeBubbles = Math.max(0, activeWelcomeBubbles - 1);
        }
        setTimeout(() => bubble.remove(), 200);
    };

    setTimeout(() => {
        bubble.addEventListener('mousedown', popBubble);
        bubble.addEventListener('touchstart', popBubble, { passive: true });
    }, 150);

    const container = isWelcome ? document.getElementById('welcome-overlay') : document.body;
    if (container) container.appendChild(bubble);

    // Удаление пузыря по таймауту
    setTimeout(() => { 
        if (bubble.parentNode) { 
            bubble.remove(); 
            if (isWelcome) {
                activeWelcomeBubbles = Math.max(0, activeWelcomeBubbles - 1);
            }
        } 
    }, 5000);
}

function startWelcomeBubbles() {
    if (!isWelcomeOpen) return;
    for (let i = 0; i < 3; i++) {
        createGlassBubble(Math.random() * window.innerWidth, Math.random() * window.innerHeight, true);
    }
    welcomeBubbleInterval = setInterval(() => {
        if (isWelcomeOpen && activeWelcomeBubbles < 5) {
            createGlassBubble(Math.random() * window.innerWidth, Math.random() * window.innerHeight, true);
        }
    }, 2000);
}

const mainCapyHandler = (e) => {
    if (!state.isMeeting || isActionRunning || e.target.closest('.glass-bubble')) return; 
    let x, y;
    if (e.type === 'touchstart') {
        // ИСПРАВЛЕНО: Гарантированное получение точных координат пальца при тапе на мобильном
        const touch = e.changedTouches[0];
        x = touch.clientX; 
        y = touch.clientY;
    } else {
        x = e.clientX; 
        y = e.clientY;
    }
    
    if (x && y) {
        const purr = document.getElementById('purr-text');
        if (purr) {
            purr.style.opacity = 1; purr.style.transform = 'translateY(-20px) translateX(-50%) scale(1.1)';
            setTimeout(() => { purr.style.opacity = 0; purr.style.transform = 'translateY(0) translateX(-50%) scale(1)'; }, 500);
        }
        createGlassBubble(x, y, false);
    }
};

const mainCapy = document.getElementById('capybara-wrapper');
if (mainCapy) {
    mainCapy.addEventListener('mousedown', mainCapyHandler);
    mainCapy.addEventListener('touchstart', mainCapyHandler, { passive: true });
}

const welcomeCapyHandler = (e) => {
    if (e.target.closest('.glass-bubble')) return;
    let x, y;
    if (e.type === 'touchstart') {
        // ИСПРАВЛЕНО: Гарантированное получение точных координат пальца на мобильном для стартового экрана
        const touch = e.changedTouches[0];
        x = touch.clientX; 
        y = touch.clientY;
    } else {
        x = e.clientX; 
        y = e.clientY;
    }
    if (x && y) createGlassBubble(x, y, true);
};

const welcomeCapy = document.getElementById('welcome-capybara-wrapper');
if (welcomeCapy) {
    welcomeCapy.addEventListener('mousedown', welcomeCapyHandler);
    welcomeCapy.addEventListener('touchstart', welcomeCapyHandler, { passive: true });
}

// Ленивое прохождение ограничений браузера на автозвук
document.body.addEventListener('click', () => { 
    initAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume(); 
}, { once: true });

// Запись времени при закрытии вкладки
window.addEventListener('beforeunload', () => {
    saveState();
});

setInterval(calculateDrain, 1000);
loadState();