import confetti from 'canvas-confetti';

// --- CONFIGURATIONS AND STATIC DATA ---
const ML4K_KEY = "215192f0-6c00-11f1-9c26-31a98d66dcb6aa4d4e4d-862a-4446-92ab-6563c4b4dcfb";
const API_URL = `https://machinelearningforkids.co.uk/api/scratch/${ML4K_KEY}/classify`;

// Predefined safe and phishing keywords/regex for the heuristic local classifier (in Spanish)
const RISKY_PATTERNS = {
    urgency: [
        /urgente/i, /inmediatamente/i, /dentro de las \d+ horas/i, /inmediato/i, /suspender/i, 
        /suspendida/i, /bloqueada/i, /actividad inusual/i, /accion requerida/i, /evitar el cierre/i, 
        /caduca/i, /no compartas/i, /evitar cargos/i, /verificar cuenta/i, /ahora mismo/i, /hackeo/i
    ],
    prize: [
        /ganador/i, /ganaste/i, /premio/i, /sorteo/i, /0km/i, /auto nuevo/i, /efectivo/i, 
        /felicitaciones/i, /millonario/i, /reclamar/i, /adjudicado/i, /beneficiario/i
    ],
    credentials: [
        /ingrese su clave/i, /valide su usuario/i, /clave token/i, /codigo de \d+ digitos/i, 
        /reenvianos el codigo/i, /contraseña/i, /datos bancarios/i, /cbu/i, /usuario y contraseña/i,
        /nro de tarjeta/i, /cvv/i, /datos de acceso/i
    ],
    impersonation: [
        /correo argentino/i, /soporte de whatsapp/i, /homebanking/i, /banco/i, /anses/i, 
        /afip/i, /netflix/i, /mercado libre/i, /mercadopago/i, /visa/i, /mastercard/i, /banelco/i
    ],
    suspicious_url: [
        /http:\/\//i, 
        /https:\/\/(?!www\.mercadolibre\.com\.ar|www\.correoargentino\.com\.ar|www\.bancocredicoop\.coop|[\w-]+\.gov\.ar|[\w-]+\.edu\.ar)/i, // Matches non-official links
        /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // Matches direct IP addresses
        /[\w-]+\.(net|org|xyz|tk|ml|cf|ga|gq|club|online|site|info)\//i // Matches suspicious TLDs
    ]
};

// Audio Context for sound synthesis
let audioCtx = null;

// --- DOM ELEMENTS ---
const systemStatusDot = document.getElementById('system-status-dot');
const systemStatusText = document.getElementById('system-status-text');
const messageInput = document.getElementById('message-input');
const charCounter = document.getElementById('char-counter');
const btnScan = document.getElementById('btn-scan');
const btnClear = document.getElementById('btn-clear');
const templateBtns = document.querySelectorAll('.template-btn');
const modeBadge = document.getElementById('mode-badge');
const scannerScreen = document.getElementById('scanner-screen');
const scanBar = document.getElementById('scan-bar');
const gaugeProgress = document.getElementById('gauge-progress');
const riskScoreDisplay = document.getElementById('risk-score');
const scannerMainMsg = document.getElementById('scanner-main-msg');
const scannerSubMsg = document.getElementById('scanner-sub-msg');
const barConfidence = document.getElementById('bar-confidence');
const scoreConfidence = document.getElementById('score-confidence');
const indicatorsList = document.getElementById('indicators-list');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// --- SOUND UTILITY ---
function playSound(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume if suspended (browser security policy)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'scan') {
            // Sweep tone
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.8);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
            gain.gain.linearRampToValueAtTime(0, now + 0.8);
            
            osc.start(now);
            osc.stop(now + 0.8);
        } 
        else if (type === 'danger') {
            // Alarm dual chime
            osc.type = 'sawtooth';
            
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.setValueAtTime(250, now + 0.1);
            osc.frequency.setValueAtTime(350, now + 0.2);
            osc.frequency.setValueAtTime(250, now + 0.3);
            osc.frequency.setValueAtTime(350, now + 0.4);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.45);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            
            osc.start(now);
            osc.stop(now + 0.5);
        } 
        else if (type === 'safe') {
            // Cheerful chord arpeggio
            osc.type = 'triangle';
            
            osc.frequency.setValueAtTime(440, now); // A4
            osc.frequency.setValueAtTime(554.37, now + 0.1); // C#5
            osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
            osc.frequency.setValueAtTime(880, now + 0.3); // A5
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
            gain.gain.linearRampToValueAtTime(0.25, now + 0.35);
            gain.gain.linearRampToValueAtTime(0, now + 0.45);
            
            osc.start(now);
            osc.stop(now + 0.45);
        }
    } catch (e) {
        console.warn('AudioContext not allowed or failed:', e);
    }
}

// --- LOCAL HEURISTIC CLASSIFIER ---
function classifyLocally(text) {
    let phishingScore = 0;
    const triggers = [];

    // Normalize text: remove accents and convert to lowercase
    const normalizedText = text.normalize("NFD")
                               .replace(/[\u0300-\u036f]/g, "")
                               .toLowerCase();

    // Analyze text factors
    const hasUrgency = RISKY_PATTERNS.urgency.some(pattern => {
        if (pattern.test(normalizedText)) {
            triggers.push({ type: 'threat', text: 'Urgencia de tiempo o alerta de seguridad detectada.' });
            return true;
        }
        return false;
    });

    const hasPrize = RISKY_PATTERNS.prize.some(pattern => {
        if (pattern.test(normalizedText)) {
            triggers.push({ type: 'threat', text: 'Promesa de premio, sorteo o dinero gratis.' });
            return true;
        }
        return false;
    });

    const hasCredentials = RISKY_PATTERNS.credentials.some(pattern => {
        if (pattern.test(normalizedText)) {
            triggers.push({ type: 'threat', text: 'Solicitud de datos confidenciales (claves, token, SMS).' });
            return true;
        }
        return false;
    });

    const hasImpersonation = RISKY_PATTERNS.impersonation.some(pattern => {
        if (pattern.test(normalizedText)) {
            triggers.push({ type: 'threat', text: 'Uso de nombres de entidades oficiales (Bancos, WhatsApp, Correo).' });
            return true;
        }
        return false;
    });

    const hasSuspiciousUrl = RISKY_PATTERNS.suspicious_url.some(pattern => {
        if (pattern.test(normalizedText)) {
            triggers.push({ type: 'threat', text: 'Enlace web externo o sospechoso adjunto en el cuerpo.' });
            return true;
        }
        return false;
    });

    // Score calculations
    if (hasSuspiciousUrl) phishingScore += 45;
    if (hasCredentials) phishingScore += 35;
    if (hasUrgency) phishingScore += 20;
    if (hasPrize) phishingScore += 30;
    if (hasImpersonation) phishingScore += 15;

    // Minimum check for phishing flag
    const isPhishing = phishingScore >= 35 || (hasSuspiciousUrl && (hasUrgency || hasCredentials || hasImpersonation));

    if (isPhishing) {
        // High confidence of Phishing
        const confidence = Math.min(75 + phishingScore, 98);
        return {
            class_name: 'phishing',
            confidence: confidence,
            triggers: triggers
        };
    } else {
        // It's Safe
        const confidence = Math.max(95 - phishingScore, 70);
        return {
            class_name: 'safe',
            confidence: confidence,
            triggers: [
                { type: 'safe', text: 'No se detectaron enlaces o IPs fraudulentas.' },
                { type: 'safe', text: 'El mensaje no solicita códigos token ni credenciales bancarias.' },
                { type: 'safe', text: 'El tono conversacional es normal, libre de urgencia falsa.' }
            ]
        };
    }
}

// --- INTERACTIVE EVENTS ---

// Handle template loading
templateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Clear active states
        templateBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Load content
        const text = btn.getAttribute('data-text');
        messageInput.value = text;
        updateCharCounter();
        
        // Sound & trigger
        playSound('scan');
        btnScan.disabled = false;
        
        // Auto scan for quick demonstration
        triggerScan(text);
    });
});

// Update character counter and enable/disable scanner
messageInput.addEventListener('input', () => {
    // Clear template active highlights
    templateBtns.forEach(b => b.classList.remove('active'));
    
    updateCharCounter();
    btnScan.disabled = messageInput.value.trim().length === 0;
});

function updateCharCounter() {
    const len = messageInput.value.length;
    charCounter.textContent = `${len} / 500 caracteres`;
}

// Scan Action Trigger
btnScan.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (text) {
        triggerScan(text);
    }
});

// Clear Form Trigger
btnClear.addEventListener('click', () => {
    // Reset inputs
    messageInput.value = '';
    updateCharCounter();
    btnScan.disabled = true;
    templateBtns.forEach(b => b.classList.remove('active'));

    // Reset status labels
    systemStatusDot.className = 'status-indicator-dot';
    systemStatusText.textContent = 'ESPERANDO ENTRADA';
    
    // Reset scanner box classes
    scannerScreen.className = 'scanner-screen';
    
    // Reset mode badge
    modeBadge.className = 'mode-badge badge-idle';
    modeBadge.textContent = 'DESCONECTADO';

    // Reset gauge progress
    gaugeProgress.style.strokeDashoffset = '314.16';
    riskScoreDisplay.textContent = '--%';
    document.documentElement.style.setProperty('--accent-color', '#00f0ff');
    document.documentElement.style.setProperty('--accent-glow', 'rgba(0, 240, 255, 0.25)');

    // Reset messages
    scannerMainMsg.textContent = 'ESPERANDO ANÁLISIS';
    scannerSubMsg.textContent = 'Ingrese un texto para escanear en tiempo real';

    // Reset bar confidence
    barConfidence.style.width = '0%';
    scoreConfidence.textContent = '0%';

    // Reset indicators
    indicatorsList.innerHTML = `<li class="idle-item"><i class="fa-solid fa-circle-notch fa-spin"></i> Esperando análisis de texto...</li>`;
});

// --- CORE DISPATCH SCAN FUNCTION ---
function triggerScan(text) {
    // Initial scanning effects
    playSound('scan');
    
    scannerScreen.className = 'scanner-screen state-scanning';
    document.documentElement.style.setProperty('--accent-color', '#00f0ff');
    document.documentElement.style.setProperty('--accent-glow', 'rgba(0, 240, 255, 0.25)');
    
    systemStatusDot.className = 'status-indicator-dot status-scanning';
    systemStatusText.textContent = 'ESCANEAR';
    
    scannerMainMsg.textContent = 'ANALIZANDO...';
    scannerSubMsg.textContent = 'Evaluando texto con el modelo de clasificación de IA';
    
    btnScan.disabled = true;
    btnClear.disabled = true;

    // Call remote API or fallback locally
    setTimeout(async () => {
        try {
            // Attempt remote classification via ML4K API
            const response = await fetch(`${API_URL}?data=${encodeURIComponent(text)}`);
            
            if (response.ok) {
                const results = await response.json();
                
                // Inspect if it returned an API error key
                if (results.error) {
                    console.warn("ML4K API returned key error, falling back locally:", results.error);
                    processResults(classifyLocally(text), 'local');
                } else if (Array.isArray(results) && results.length > 0) {
                    // Successful classification from API
                    const match = results[0];
                    processResults({
                        class_name: match.class_name.toLowerCase(), // safe vs phishing
                        confidence: match.confidence,
                        triggers: [] // Will build triggers based on text anyway to enrich UI details
                    }, 'api');
                } else {
                    throw new Error("Invalid API response format");
                }
            } else {
                throw new Error("Server responded with error status");
            }
        } catch (err) {
            console.warn("API request failed, running intelligent local fallback classifier:", err);
            // Local fallback
            processResults(classifyLocally(text), 'local');
        } finally {
            btnScan.disabled = false;
            btnClear.disabled = false;
        }
    }, 1200); // 1.2s delay to make scan effect visually engaging
}

// Process results & render interface changes
function processResults(result, source) {
    const isPhishing = result.class_name === 'phishing' || result.class_name === 'peligroso';
    const confidence = result.confidence;

    // Rich details if triggers list is empty (API fallback triggers enrichments)
    let triggers = result.triggers || [];
    if (triggers.length === 0) {
        // Enriched triggers manually if source is API so UI shows the rules triggers
        const localCheck = classifyLocally(messageInput.value);
        triggers = localCheck.triggers;
    }

    // Set connection status badge
    if (source === 'api') {
        modeBadge.className = 'mode-badge badge-api';
        modeBadge.textContent = 'CONEXIÓN API';
    } else {
        modeBadge.className = 'mode-badge badge-local';
        modeBadge.textContent = 'RESPALDO LOCAL';
    }

    // Render results based on classifications
    if (isPhishing) {
        // Set dynamic colors variables to Red Alert
        document.documentElement.style.setProperty('--accent-color', 'var(--danger-color)');
        document.documentElement.style.setProperty('--accent-glow', 'var(--danger-glow)');

        // Play alarm sound
        playSound('danger');
        
        // Add screen shake and danger classes
        scannerScreen.className = 'scanner-screen state-danger';
        systemStatusDot.className = 'status-indicator-dot status-danger';
        systemStatusText.textContent = 'AMENAZA DETECTADA';

        // Set text alert messages
        scannerMainMsg.textContent = 'PELIGRO: ESTAFA DETECTADA';
        scannerSubMsg.textContent = 'El texto presenta un alto índice de phishing';

        // Animate circular gauge
        const offset = 314.16 - (314.16 * confidence) / 100;
        gaugeProgress.style.strokeDashoffset = offset;
        riskScoreDisplay.textContent = `${confidence.toFixed(0)}%`;

        // Render analysis details
        renderIndicators(triggers);

    } else {
        // Set dynamic colors variables to Green Safe
        document.documentElement.style.setProperty('--accent-color', 'var(--success-color)');
        document.documentElement.style.setProperty('--accent-glow', 'var(--success-glow)');

        // Play success sound
        playSound('safe');

        // Confetti!
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });

        // Set scanner elements state
        scannerScreen.className = 'scanner-screen state-safe';
        systemStatusDot.className = 'status-indicator-dot status-active';
        systemStatusText.textContent = 'MENSAJE SEGURO';

        // Set text messages
        scannerMainMsg.textContent = 'MENSAJE SEGURO';
        scannerSubMsg.textContent = 'No se detectaron indicios claros de phishing';

        // Animate circular gauge to risk inversion
        const riskLevel = 100 - confidence;
        const offset = 314.16 - (314.16 * riskLevel) / 100;
        gaugeProgress.style.strokeDashoffset = offset;
        riskScoreDisplay.textContent = `${riskLevel.toFixed(0)}%`;

        // Render indicators
        renderIndicators(triggers);
    }

    // Animate progress confidence bar
    barConfidence.style.width = `${confidence}%`;
    scoreConfidence.textContent = `${confidence.toFixed(0)}%`;
}

// Render dynamic triggers list
function renderIndicators(triggers) {
    indicatorsList.innerHTML = '';
    triggers.forEach(trig => {
        const li = document.createElement('li');
        if (trig.type === 'threat') {
            li.className = 'indicator-threat';
            li.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span><strong>Riesgo:</strong> ${trig.text}</span>`;
        } else {
            li.className = 'indicator-safe';
            li.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span><strong>Seguro:</strong> ${trig.text}</span>`;
        }
        indicatorsList.appendChild(li);
    });
}

// --- EDUCATIONAL TABS INTERACTION ---
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Toggle active tabs buttons
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle active panes
        const tabId = btn.getAttribute('data-tab');
        tabPanes.forEach(pane => {
            if (pane.id === tabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    });
});
