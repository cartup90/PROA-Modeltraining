// --- CONFIGURACIÓN Y ESTADO DE LA APLICACIÓN ---
let model = null;
let webcam = null;
let isSystemRunning = false;
let isMuted = false;
let volume = 0.8;
let maxPredictions = 0;

// Variables de detección y filtrado temporal
let distractionThreshold = 0.65; // Umbral de confianza
let consecutiveDistractedFrames = 0;
let alertTriggerFrames = 15; // Aprox. 500ms a 30 FPS para evitar falsos positivos rápidos
let lastState = "atento"; // Estado anterior: atento o distraído

// Simulación de conducción
let carSpeed = 0;
let targetSpeed = 0;
let steeringAngle = 0;
let targetSteeringAngle = 0;

// Web Audio API
let audioCtx = null;
let mainGainNode = null;
let alarmIntervalId = null;
let sirenOsc = null;
let sirenLfo = null;
let isSirenPlaying = false;
let testAlarmActive = false;

// DOM Elements
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnMute = document.getElementById("btn-mute");
const btnTestAlert = document.getElementById("btn-test-alert");
const btnReloadModel = document.getElementById("btn-reload-model");
const btnClearLogs = document.getElementById("btn-clear-logs");
const modelUrlInput = document.getElementById("model-url-input");

const systemStatusDot = document.getElementById("system-status-dot");
const systemStatusText = document.getElementById("system-status-text");
const systemLogs = document.getElementById("system-logs");

const digitalScreen = document.getElementById("digital-screen");
const screenStatusMsg = document.getElementById("screen-status-msg");
const screenSubMsg = document.getElementById("screen-sub-msg");

const speedDisplay = document.getElementById("speed-display");
const speedGauge = document.getElementById("speed-gauge");
const steeringWheelImg = document.getElementById("steering-wheel-img");

const barAtento = document.getElementById("bar-atento");
const scoreAtento = document.getElementById("score-atento");
const barDistraido = document.getElementById("bar-distraido");
const scoreDistraido = document.getElementById("score-distraido");

const hudAlertOverlay = document.getElementById("hud-alert-overlay");
const mirrorBezel = document.querySelector(".mirror-bezel");
const cameraLoading = document.getElementById("camera-loading");
const volumeSlider = document.getElementById("slider-volume");
const volumeValLabel = document.getElementById("volume-val");
const selectAlertType = document.getElementById("select-alert-type");

// Initialize Canvas
const roadCanvas = document.getElementById("road-canvas");
const ctx = roadCanvas.getContext("2d");

// Responsive Canvas Size
function resizeCanvas() {
    roadCanvas.width = roadCanvas.parentElement.clientWidth;
    roadCanvas.height = roadCanvas.parentElement.clientHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --- LOGGING SYSTEM ---
function addLog(message, type = "info") {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement("div");
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    systemLogs.appendChild(entry);
    systemLogs.scrollTop = systemLogs.scrollHeight;
}

btnClearLogs.addEventListener("click", () => {
    systemLogs.innerHTML = "";
    addLog("Historial limpiado.");
});

// --- AUDIO ALARM CONTROLLER (WEB AUDIO API) ---
function initAudio() {
    if (audioCtx) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        mainGainNode = audioCtx.createGain();
        mainGainNode.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
        mainGainNode.connect(audioCtx.destination);
        addLog("Motor de audio inicializado con éxito.", "success");
    } catch (e) {
        addLog("Error al inicializar el audio de la alarma: " + e.message, "error");
    }
}

// Actualizar volumen en base al slider
volumeSlider.addEventListener("input", (e) => {
    volume = parseFloat(e.target.value) / 100;
    volumeValLabel.textContent = `${e.target.value}%`;
    if (mainGainNode && !isMuted) {
        mainGainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    }
});

// Botón de silenciar
btnMute.addEventListener("click", () => {
    isMuted = !isMuted;
    if (isMuted) {
        btnMute.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> Desactivar Silencio`;
        btnMute.classList.add("btn-danger");
        if (mainGainNode) mainGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        addLog("Audio silenciado.");
    } else {
        btnMute.innerHTML = `<i class="fa-solid fa-volume-high"></i> Silenciar`;
        btnMute.classList.remove("btn-danger");
        if (mainGainNode) mainGainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        addLog("Audio activado.");
    }
});

// Generar pitido pulsante
function playPulseBeep() {
    if (!audioCtx || isMuted) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(950, audioCtx.currentTime); // Pitido agudo
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        
        osc.connect(gain);
        gain.connect(mainGainNode);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.18);
    } catch (err) {
        console.error("Audio error:", err);
    }
}

// Iniciar alarma continua
function startSiren() {
    if (!audioCtx || isMuted || isSirenPlaying) return;
    try {
        isSirenPlaying = true;
        sirenOsc = audioCtx.createOscillator();
        sirenOsc.type = "sawtooth";
        sirenOsc.frequency.setValueAtTime(700, audioCtx.currentTime);
        
        const sirenGain = audioCtx.createGain();
        sirenGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        
        sirenLfo = audioCtx.createOscillator();
        sirenLfo.frequency.value = 3; // Sweeps 3 veces por segundo
        
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 250; // Rango de variación
        
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        
        sirenOsc.connect(sirenGain);
        sirenGain.connect(mainGainNode);
        
        sirenLfo.start();
        sirenOsc.start();
    } catch (err) {
        console.error("Siren audio error:", err);
    }
}

// Detener alarma continua
function stopSiren() {
    if (!isSirenPlaying) return;
    try {
        if (sirenOsc) {
            sirenOsc.stop();
            sirenOsc.disconnect();
            sirenOsc = null;
        }
        if (sirenLfo) {
            sirenLfo.stop();
            sirenLfo.disconnect();
            sirenLfo = null;
        }
        isSirenPlaying = false;
    } catch (err) {
        console.error("Stop Siren audio error:", err);
    }
}

// Alerta por voz sintetizada (Text-To-Speech)
let lastVoiceAlertTime = 0;
function speakWarning() {
    if (isMuted) return;
    const now = Date.now();
    if (now - lastVoiceAlertTime > 2500) { // Limitar repetición de voz cada 2.5 seg
        lastVoiceAlertTime = now;
        const utterance = new SpeechSynthesisUtterance("¡Atención al volante!");
        utterance.lang = "es-ES";
        utterance.rate = 1.15;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// Disparar las alertas sonoras en base al tipo seleccionado
function triggerAudioAlert() {
    const alertType = selectAlertType.value;
    if (alertType === "pulse") {
        stopSiren();
        if (!alarmIntervalId) {
            playPulseBeep();
            alarmIntervalId = setInterval(playPulseBeep, 300);
        }
    } else if (alertType === "siren") {
        if (alarmIntervalId) {
            clearInterval(alarmIntervalId);
            alarmIntervalId = null;
        }
        startSiren();
    } else if (alertType === "voice") {
        stopSiren();
        if (alarmIntervalId) {
            clearInterval(alarmIntervalId);
            alarmIntervalId = null;
        }
        speakWarning();
        alarmIntervalId = setInterval(speakWarning, 2500);
    }
}

// Apagar todos los sonidos de alarma
function clearAudioAlert() {
    if (alarmIntervalId) {
        clearInterval(alarmIntervalId);
        alarmIntervalId = null;
    }
    stopSiren();
}

// Botón de prueba de alarma
btnTestAlert.addEventListener("click", () => {
    initAudio();
    if (testAlarmActive) {
        testAlarmActive = false;
        clearAudioAlert();
        hudAlertOverlay.classList.remove("active");
        btnTestAlert.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Probar Alarma`;
        addLog("Prueba de alarma desactivada.");
    } else {
        testAlarmActive = true;
        triggerAudioAlert();
        hudAlertOverlay.classList.add("active");
        btnTestAlert.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Parar Prueba`;
        addLog("Probando alerta sonora y visual. Asegúrate de interactuar con el sitio para activar el sonido.");
    }
});

// --- DYNAMIC CAR SIMULATOR DRAWING (Windshield Road Canvas) ---
const roadLines = [];
const starBackground = [];

// Inicializar estrellas para el fondo
for (let i = 0; i < 60; i++) {
    starBackground.push({
        x: Math.random(),
        y: Math.random() * 0.5, // Solo en la mitad superior (cielo)
        radius: Math.random() * 1.5 + 0.5,
        alpha: Math.random()
    });
}

// Inicializar marcas de carril
for (let i = 0; i < 5; i++) {
    roadLines.push({
        progress: i / 5, // Progreso del horizonte al frente (0 a 1)
    });
}

function updateSimulator(deltaTime) {
    // 1. Simulación de velocidad
    if (isSystemRunning) {
        if (lastState === "distraído") {
            // El auto se frena en caso de distracción (Sistema ADAS activo)
            targetSpeed = 15; // frena gradualmente a 15 km/h
        } else {
            // Conducción normal rápida
            targetSpeed = 100;
        }
    } else {
        targetSpeed = 0;
    }
    
    // Suavizado de velocidad
    carSpeed += (targetSpeed - carSpeed) * deltaTime * 1.5;
    
    // Mostrar velocímetro
    const displaySpeed = Math.round(carSpeed);
    speedDisplay.textContent = displaySpeed;
    
    // Actualizar velocímetro SVG
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (displaySpeed / 140) * circumference;
    speedGauge.style.strokeDasharray = `${circumference} ${circumference}`;
    speedGauge.style.strokeDashoffset = offset;
    
    // Cambiar color velocímetro si está distraído
    if (lastState === "distraído") {
        speedGauge.style.stroke = "var(--danger-color)";
    } else {
        speedGauge.style.stroke = "var(--primary-color)";
    }

    // 2. Movimiento del volante
    if (isSystemRunning && lastState === "atento") {
        // En conducción normal, simular que el conductor mueve el volante para mantener el carril
        if (Math.random() < 0.02) {
            targetSteeringAngle = (Math.random() - 0.5) * 20; // -10 a 10 grados
        }
    } else {
        targetSteeringAngle = 0; // Volante centrado si frena o está apagado
    }
    
    // Suavizado del volante
    steeringAngle += (targetSteeringAngle - steeringAngle) * deltaTime * 4;
    steeringWheelImg.style.transform = `rotate(${steeringAngle}deg)`;

    // 3. Progreso de las líneas de la carretera
    const speedFactor = carSpeed / 100;
    roadLines.forEach(line => {
        line.progress += deltaTime * 0.7 * speedFactor;
        if (line.progress > 1) {
            line.progress -= 1;
        }
    });
}

function drawSimulator() {
    const width = roadCanvas.width;
    const height = roadCanvas.height;
    const horizon = height * 0.45;

    // Fondo: Cielo Nocturno
    ctx.fillStyle = "#020308";
    ctx.fillRect(0, 0, width, height);

    // Dibujar estrellas
    ctx.fillStyle = "white";
    starBackground.forEach(star => {
        ctx.globalAlpha = star.alpha * (0.6 + 0.4 * Math.sin(Date.now() * 0.001 * star.radius));
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Dibujar montañas a lo lejos
    ctx.fillStyle = "#0c0d1b";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width * 0.2, horizon - 25);
    ctx.lineTo(width * 0.35, horizon - 10);
    ctx.lineTo(width * 0.5, horizon - 35);
    ctx.lineTo(width * 0.7, horizon - 15);
    ctx.lineTo(width * 0.85, horizon - 30);
    ctx.lineTo(width, horizon);
    ctx.closePath();
    ctx.fill();

    // Dibujar Suelo (Verde oscuro / pasto)
    ctx.fillStyle = "#050b07";
    ctx.fillRect(0, horizon, width, height - horizon);

    // Dibujar Carretera en perspectiva
    ctx.fillStyle = "#111422";
    ctx.beginPath();
    ctx.moveTo(width * 0.48, horizon);
    ctx.lineTo(width * 0.52, horizon);
    ctx.lineTo(width * 0.95, height);
    ctx.lineTo(width * 0.05, height);
    ctx.closePath();
    ctx.fill();

    // Dibujar bordes de la carretera (Líneas continuas)
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 3;
    
    // Borde izquierdo
    ctx.beginPath();
    ctx.moveTo(width * 0.48, horizon);
    ctx.lineTo(width * 0.05, height);
    ctx.stroke();

    // Borde derecho
    ctx.beginPath();
    ctx.moveTo(width * 0.52, horizon);
    ctx.lineTo(width * 0.95, height);
    ctx.stroke();

    // Dibujar Líneas centrales divisorias (Líneas discontinuas en 3D)
    ctx.strokeStyle = "#ffffff";
    roadLines.forEach(line => {
        // Mapeo no lineal para simular perspectiva 3D (las líneas se aceleran al acercarse)
        const p = line.progress;
        const scale = p * p; // Efecto de aceleración perspectiva

        const startY = horizon + (height - horizon) * scale;
        const lineLen = 30 * scale; // Las líneas son más grandes mientras más cerca están
        const endY = startY + lineLen;

        if (endY < height && startY > horizon) {
            const getX = (y) => {
                const ratio = (y - horizon) / (height - horizon);
                return width * 0.5 + (width * 0.45) * ratio * 0; // en el centro
            };
            
            ctx.lineWidth = 1 + 5 * scale;
            ctx.strokeStyle = `rgba(255, 255, 255, ${scale * 0.8})`;
            ctx.beginPath();
            ctx.moveTo(width * 0.5, startY);
            ctx.lineTo(width * 0.5, endY);
            ctx.stroke();
        }
    });

    // Dibujar resplandor rojo en parabrisas si la alarma está activa
    if ((lastState === "distraído" && isSystemRunning) || testAlarmActive) {
        const pulse = 0.2 + 0.15 * Math.sin(Date.now() * 0.01);
        ctx.fillStyle = `rgba(255, 0, 85, ${pulse})`;
        ctx.fillRect(0, 0, width, height);
        
        // Bordes con viñeta de alerta
        const grad = ctx.createRadialGradient(width/2, height/2, width/4, width/2, height/2, width);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(255, 0, 85, ${pulse * 1.5})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
}

// Bucle de animación del simulador
let lastTime = performance.now();
function animationLoop(now) {
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    // Impedir saltos gigantes de frames si la ventana pierde el foco
    const boundedDelta = Math.min(deltaTime, 0.1);

    updateSimulator(boundedDelta);
    drawSimulator();

    requestAnimationFrame(animationLoop);
}
requestAnimationFrame(animationLoop);

// --- CAMARA Y CLASIFICACION (TEACHABLE MACHINE API) ---
async function setupWebcam() {
    // Teachable Machine helper crea una cámara y la inicializa
    // tmImage.Webcam(width, height, flip)
    webcam = new tmImage.Webcam(280, 200, true);
    await webcam.setup();
    await webcam.play();
    
    // Remover placeholder y adjuntar canvas
    cameraLoading.style.display = "none";
    const webcamContainer = document.getElementById("webcam-container");
    webcamContainer.innerHTML = "";
    webcamContainer.appendChild(webcam.canvas);
}

async function loadModel(modelURL) {
    try {
        addLog("Cargando modelo de Inteligencia Artificial...");
        
        // Garantizar que la barra diagonal final esté presente
        const formattedURL = modelURL.endsWith("/") ? modelURL : modelURL + "/";
        const modelJSON = formattedURL + "model.json";
        const metadataJSON = formattedURL + "metadata.json";

        model = await tmImage.load(modelJSON, metadataJSON);
        maxPredictions = model.getTotalClasses();
        
        addLog("Modelo cargado con éxito. Clases detectadas: " + maxPredictions, "success");
        return true;
    } catch (e) {
        addLog("Error al cargar el modelo. Verifique la URL: " + e.message, "error");
        console.error(e);
        return false;
    }
}

// Bucle continuo de predicción
async function predictLoop() {
    if (!isSystemRunning) return;

    webcam.update(); // Actualiza el frame de la webcam
    await predictClassification();
    
    // Continuar ciclo con requestAnimationFrame
    window.requestAnimationFrame(predictLoop);
}

async function predictClassification() {
    if (!model) return;
    try {
        const prediction = await model.predict(webcam.canvas);
        
        let scoreAtentoVal = 0;
        let scoreDistraidoVal = 0;

        // Recorremos las predicciones del modelo
        for (let i = 0; i < maxPredictions; i++) {
            const className = prediction[i].className.toLowerCase().trim();
            const probability = prediction[i].probability;

            if (className === "atento" || className === "atent") {
                scoreAtentoVal = probability;
            } else if (className === "distraído" || className === "distraido" || className === "distraction" || className === "distracted") {
                scoreDistraidoVal = probability;
            } else {
                // Compatibilidad por posición en caso de clases con nombres distintos (Atento suele ser 1era o 2da)
                if (i === 0) scoreDistraidoVal = probability;
                else scoreAtentoVal = probability;
            }
        }

        // Actualizar UI bars
        barAtento.style.width = `${Math.round(scoreAtentoVal * 100)}%`;
        scoreAtento.textContent = `${Math.round(scoreAtentoVal * 100)}%`;

        barDistraido.style.width = `${Math.round(scoreDistraidoVal * 100)}%`;
        scoreDistraido.textContent = `${Math.round(scoreDistraidoVal * 100)}%`;

        // Lógica de decisión
        if (scoreDistraidoVal >= distractionThreshold) {
            consecutiveDistractedFrames++;
            
            // Si el estado distraído se mantiene por encima del umbral de frames
            if (consecutiveDistractedFrames >= alertTriggerFrames) {
                if (lastState !== "distraído") {
                    lastState = "distraído";
                    triggerSystemWarning();
                }
            }
        } else {
            // El conductor está atento
            consecutiveDistractedFrames = 0;
            if (lastState !== "atento") {
                lastState = "atento";
                triggerSystemNormal();
            }
        }
    } catch (err) {
        console.error("Inference error:", err);
    }
}

// Activar Estado de Alerta
function triggerSystemWarning() {
    systemStatusDot.className = "status-indicator-dot warning";
    systemStatusText.textContent = "ALERTA: DISTRACCIÓN DETECTADA";
    systemStatusText.style.color = "var(--danger-color)";

    screenStatusMsg.textContent = "¡DISTRAÍDO!";
    screenStatusMsg.className = "screen-main-msg active-warn";
    screenSubMsg.textContent = "POR FAVOR, PRESTE ATENCIÓN";
    screenStatusMsg.parentElement.style.borderColor = "var(--danger-color)";

    // Activar alertas en el HUD y el sonido
    if (!testAlarmActive) {
        hudAlertOverlay.classList.add("active");
        triggerAudioAlert();
    }
    
    addLog("¡ATENCIÓN! Conductor distraído detectado.", "warning");
}

// Regresar a Estado Normal
function triggerSystemNormal() {
    systemStatusDot.className = "status-indicator-dot active";
    systemStatusText.textContent = "MONITOR DMS ACTIVO";
    systemStatusText.style.color = "var(--success-color)";

    screenStatusMsg.textContent = "ATENTO";
    screenStatusMsg.className = "screen-main-msg active-ok";
    screenSubMsg.textContent = "Conducción Segura";
    screenStatusMsg.parentElement.style.borderColor = "#1f2a44";

    // Quitar alertas visuales y sonoras
    if (!testAlarmActive) {
        hudAlertOverlay.classList.remove("active");
        clearAudioAlert();
    }

    addLog("Conductor atento nuevamente. Estado normal restaurado.", "success");
}

// --- CONFIGURACIÓN DE LOS BOTONES DEL SISTEMA ---

// Iniciar Sistema
btnStart.addEventListener("click", async () => {
    initAudio();
    btnStart.disabled = true;
    btnStart.classList.remove("btn-pulse");
    
    // Cargar modelo si aún no está cargado
    if (!model) {
        const loadSuccess = await loadModel(modelUrlInput.value);
        if (!loadSuccess) {
            btnStart.disabled = false;
            btnStart.classList.add("btn-pulse");
            return;
        }
    }

    // Inicializar Cámara
    try {
        addLog("Inicializando cámara web...");
        await setupWebcam();
        addLog("Cámara web iniciada con éxito.", "success");
    } catch (e) {
        addLog("Error de cámara: " + e.message, "error");
        addLog("Asegúrese de otorgar permisos de cámara en el navegador.", "warning");
        btnStart.disabled = false;
        btnStart.classList.add("btn-pulse");
        return;
    }

    // Configurar estados
    isSystemRunning = true;
    btnStop.disabled = false;
    btnReloadModel.disabled = true;
    modelUrlInput.disabled = true;
    mirrorBezel.classList.add("active");
    
    systemStatusDot.className = "status-indicator-dot active";
    systemStatusText.textContent = "MONITOR DMS ACTIVO";
    systemStatusText.style.color = "var(--success-color)";
    
    screenStatusMsg.textContent = "ATENTO";
    screenStatusMsg.className = "screen-main-msg active-ok";
    screenSubMsg.textContent = "Conduciendo...";
    
    addLog("Monitoreo activo. Sistema DMS en funcionamiento.", "success");
    
    // Iniciar bucle de predicciones
    predictLoop();
});

// Detener Sistema
btnStop.addEventListener("click", () => {
    isSystemRunning = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnReloadModel.disabled = false;
    modelUrlInput.disabled = false;
    mirrorBezel.classList.remove("active");
    cameraLoading.style.display = "flex";
    
    // Apagar webcam
    if (webcam) {
        webcam.stop();
        webcam = null;
        document.getElementById("webcam-container").innerHTML = "";
    }

    // Apagar sonidos de alarmas
    clearAudioAlert();
    hudAlertOverlay.classList.remove("active");
    
    // Restablecer interfaz
    lastState = "atento";
    consecutiveDistractedFrames = 0;
    
    systemStatusDot.className = "status-indicator-dot";
    systemStatusText.textContent = "SISTEMA INACTIVO";
    systemStatusText.style.color = "inherit";
    
    screenStatusMsg.textContent = "SISTEMA APAGADO";
    screenStatusMsg.className = "screen-main-msg";
    screenSubMsg.textContent = "Presione Iniciar Sistema";
    screenStatusMsg.parentElement.style.borderColor = "#1f2a44";
    
    barAtento.style.width = "0%";
    scoreAtento.textContent = "0%";
    barDistraido.style.width = "0%";
    scoreDistraido.textContent = "0%";
    
    addLog("Sistema desactivado.", "info");
});

// Recargar modelo personalizado
btnReloadModel.addEventListener("click", async () => {
    const url = modelUrlInput.value.trim();
    if (!url) {
        addLog("Por favor ingrese una URL válida.", "error");
        return;
    }
    
    btnReloadModel.disabled = true;
    const success = await loadModel(url);
    btnReloadModel.disabled = false;
    
    if (success) {
        addLog("Modelo actualizado correctamente. Listo para iniciar.", "success");
    }
});

// --- LÓGICA DE NAVEGACIÓN POR PESTAÑAS (TABS) ---
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        // Remover clase activa de todos los botones
        tabButtons.forEach(b => b.classList.remove("active"));
        // Ocultar todos los páneles
        tabPanes.forEach(pane => pane.classList.remove("active"));
        
        // Activar el actual
        btn.classList.add("active");
        const targetTab = btn.getAttribute("data-tab");
        document.getElementById(targetTab).classList.add("active");
    });
});

// --- LÓGICA DE BOTONES DE GRUPO ---
const btnModel1 = document.getElementById("btn-model-1");
const btnModel2 = document.getElementById("btn-model-2");

if (btnModel1) {
    btnModel1.addEventListener("click", async () => {
        modelUrlInput.value = "https://teachablemachine.withgoogle.com/models/uBf6EKeRr/";
        if (!isSystemRunning) addLog("URL del Modelo 1 seleccionada. Presiona Iniciar Sistema.", "info");
        else {
            btnModel1.disabled = true;
            addLog("Cambiando al Modelo 1...");
            await loadModel(modelUrlInput.value);
            btnModel1.disabled = false;
        }
    });
}

if (btnModel2) {
    btnModel2.addEventListener("click", async () => {
        modelUrlInput.value = "./my-pose-model-Bauti/";
        if (!isSystemRunning) addLog("URL del Modelo 2 seleccionada. Presiona Iniciar Sistema.", "info");
        else {
            btnModel2.disabled = true;
            addLog("Cambiando al Modelo 2...");
            await loadModel(modelUrlInput.value);
            btnModel2.disabled = false;
        }
    });
}
