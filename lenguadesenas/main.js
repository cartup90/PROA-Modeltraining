import * as tf from '@tensorflow/tfjs';
import * as tmImage from '@teachablemachine/image';
import confetti from 'canvas-confetti';

const URL = "./model/";

let model, videoElement, offscreenCanvas, offscreenCtx, labelContainer, maxPredictions;
let currentChallenge = "";
let challengeActive = true;

const challengeTargetEl = document.getElementById("target-sign");
const nextChallengeBtn = document.getElementById("next-challenge-btn");

// Initialize the image model and setup the webcam
async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    // Load the model and metadata
    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        await getCameras();
        
        // Creamos el elemento de video nativo
        videoElement = document.createElement("video");
        videoElement.width = 400;
        videoElement.height = 300;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        // Invertimos la cámara como en un espejo
        videoElement.style.transform = "scaleX(-1)";
        videoElement.style.width = "100%";
        videoElement.style.height = "100%";
        videoElement.style.objectFit = "cover";

        const webcamContainer = document.getElementById("webcam-container");
        webcamContainer.appendChild(videoElement);

        // Canvas auxiliar para la predicción (invisible)
        offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = 224; // Tamaño óptimo para teachable machine
        offscreenCanvas.height = 224;
        offscreenCtx = offscreenCanvas.getContext("2d");

        await setupCamera();

        labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = ""; // Limpiar nodos previos (incluyendo comentarios html)
        for (let i = 0; i < maxPredictions; i++) { 
            // Create bar row
            const barRow = document.createElement("div");
            barRow.className = "bar-row";
            
            const labelDiv = document.createElement("div");
            labelDiv.className = "bar-label-container";
            
            const nameSpan = document.createElement("span");
            nameSpan.className = "bar-name";
            const valSpan = document.createElement("span");
            valSpan.className = "bar-val";
            
            labelDiv.appendChild(nameSpan);
            labelDiv.appendChild(valSpan);
            
            const trackDiv = document.createElement("div");
            trackDiv.className = "bar-track";
            
            const fillDiv = document.createElement("div");
            fillDiv.className = "bar-fill";
            
            trackDiv.appendChild(fillDiv);
            
            barRow.appendChild(labelDiv);
            barRow.appendChild(trackDiv);
            
            labelContainer.appendChild(barRow);
        }

        setNewChallenge();

    } catch (e) {
        console.error("Error loading model", e);
        document.getElementById("webcam-loading").innerText = "Error al cargar la cámara o modelo.";
    }
}

let reqAnimFrameId;

async function loop() {
    try {
        if (videoElement.readyState >= 2) { // 2 = HAVE_CURRENT_DATA
            await predict();
        }
    } catch (e) {
        console.warn("Loop update warning:", e);
    }
    
    if (window.isLooping) {
        reqAnimFrameId = window.requestAnimationFrame(loop);
    }
}

async function predict() {
    if (!videoElement || videoElement.videoWidth === 0) return;

    // Dibujamos el video en el canvas auxiliar (con recorte si es necesario)
    const minDim = Math.min(videoElement.videoWidth, videoElement.videoHeight);
    const startX = (videoElement.videoWidth - minDim) / 2;
    const startY = (videoElement.videoHeight - minDim) / 2;
    
    offscreenCtx.save();
    // Reflejamos el canvas para que coincida con lo que ve el usuario
    offscreenCtx.translate(offscreenCanvas.width, 0);
    offscreenCtx.scale(-1, 1);
    offscreenCtx.drawImage(videoElement, startX, startY, minDim, minDim, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offscreenCtx.restore();

    // predecir usando el canvas auxiliar
    const prediction = await model.predict(offscreenCanvas);
    
    for (let i = 0; i < maxPredictions; i++) {
        const classPredictionName = prediction[i].className;
        const probability = prediction[i].probability;
        const probPercentage = (probability * 100).toFixed(0) + "%";
        
        const row = labelContainer.children[i];
        if (!row) continue;
        
        const nameSpan = row.querySelector(".bar-name");
        const valSpan = row.querySelector(".bar-val");
        const fillDiv = row.querySelector(".bar-fill");
        
        nameSpan.innerText = classPredictionName;
        valSpan.innerText = probPercentage;
        fillDiv.style.width = probPercentage;
        
        // Change color based on confidence
        if (probability > 0.85) {
            fillDiv.style.background = "var(--success-color)";
        } else {
            fillDiv.style.background = "var(--accent-gradient)";
        }

        // Check challenge
        if (challengeActive && classPredictionName === currentChallenge && probability > 0.85) {
            challengeSuccess();
        }
    }
}

async function getCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const select = document.getElementById("camera-select");
    
    select.innerHTML = "";
    videoDevices.forEach(device => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Cámara ${select.length + 1}`;
        select.appendChild(option);
    });

    select.addEventListener("change", async (e) => {
        await setupCamera(e.target.value);
    });
}

async function setupCamera(deviceId = null) {
    window.isLooping = false;
    if (reqAnimFrameId) {
        window.cancelAnimationFrame(reqAnimFrameId);
    }
    
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    
    document.getElementById("webcam-loading").style.display = "block";
    
    try {
        const constraints = {
            video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        
        // Esperamos a que el video cargue sus metadatos antes de reproducir
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve();
            };
        });
        
        await videoElement.play();
        document.getElementById("webcam-loading").style.display = "none";
        
        window.isLooping = true;
        reqAnimFrameId = window.requestAnimationFrame(loop);
    } catch (e) {
        console.error("Error setting up camera:", e);
        document.getElementById("webcam-loading").innerText = "Error: Permiso denegado o cámara bloqueada.";
    }
}

function setNewChallenge() {
    if (!model) return;
    const labels = model.getClassLabels();
    // exclude current challenge if possible
    let newChallenge = currentChallenge;
    while (newChallenge === currentChallenge) {
        const randomIndex = Math.floor(Math.random() * labels.length);
        newChallenge = labels[randomIndex];
    }
    currentChallenge = newChallenge;
    challengeTargetEl.innerText = `"${currentChallenge}"`;
    challengeActive = true;
}

function challengeSuccess() {
    challengeActive = false; // prevent multiple triggers
    
    // Fire confetti
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#8b5cf6']
    });

    challengeTargetEl.innerHTML = `<span style="color: #10b981;">¡Correcto! 🎉</span>`;
    
    setTimeout(() => {
        setNewChallenge();
    }, 3000);
}

nextChallengeBtn.addEventListener("click", () => {
    setNewChallenge();
});

// Run init when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
