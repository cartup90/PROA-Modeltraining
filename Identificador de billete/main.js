// Define model path
const URL = "./model/";

let model, webcam, maxPredictions;
let isRunning = false;

// DOM Elements
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const webcamContainer = document.getElementById("webcam-container");
const cameraPlaceholder = document.getElementById("camera-loading");
const resultValue = document.getElementById("result-value");
const statusDot = document.getElementById("system-status-dot");
const statusText = document.getElementById("system-status-text");
const labelContainer = document.getElementById("label-container");

// Speech State Variables
let lastSpokenLabel = "";
let lastSpokenTime = 0;
const SPEECH_COOLDOWN_MS = 4000; // Wait 4 seconds before repeating the same bill

// Event Listeners
btnStart.addEventListener("click", init);
btnStop.addEventListener("click", stopSystem);

async function init() {
    try {
        btnStart.disabled = true;
        btnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CARGANDO...';
        
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        // Load the model and metadata
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        // Convenience function to setup a webcam
        const flip = true; // Set to false to avoid mirroring the image
        webcam = new tmImage.Webcam(400, 400, flip); // width, height, flip
        
        await webcam.setup(); // request access to the webcam
        await webcam.play();
        
        isRunning = true;
        
        // Update UI
        cameraPlaceholder.classList.add("hidden");
        webcamContainer.appendChild(webcam.canvas);
        
        btnStart.classList.add("hidden");
        btnStop.classList.remove("hidden");
        btnStop.disabled = false;
        
        statusDot.classList.add("active");
        statusText.innerText = "SISTEMA ACTIVO";

        // Generate prediction bars
        labelContainer.innerHTML = "";
        for (let i = 0; i < maxPredictions; i++) {
            const barRow = document.createElement("div");
            barRow.className = "bar-row";
            
            const label = document.createElement("div");
            label.className = "bar-label";
            label.innerText = model.getClassLabels()[i];
            
            const track = document.createElement("div");
            track.className = "bar-track";
            
            const fill = document.createElement("div");
            fill.className = "bar-fill";
            fill.id = `bar-fill-${i}`;
            
            const percent = document.createElement("div");
            percent.className = "bar-percent";
            percent.id = `bar-percent-${i}`;
            percent.innerText = "0%";

            track.appendChild(fill);
            barRow.appendChild(label);
            barRow.appendChild(track);
            barRow.appendChild(percent);
            labelContainer.appendChild(barRow);
        }

        // Start the prediction loop
        window.requestAnimationFrame(loop);
    } catch (err) {
        console.error("Error al iniciar:", err);
        alert("No se pudo acceder a la cámara o cargar el modelo. Verifique los permisos.");
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> INICIAR LECTOR';
    }
}

function stopSystem() {
    isRunning = false;
    
    if (webcam) {
        webcam.stop();
        // Remove canvas
        if (webcamContainer.contains(webcam.canvas)) {
            webcamContainer.removeChild(webcam.canvas);
        }
    }
    
    // Update UI
    cameraPlaceholder.classList.remove("hidden");
    btnStop.classList.add("hidden");
    
    btnStart.classList.remove("hidden");
    btnStart.disabled = false;
    btnStart.innerHTML = '<i class="fa-solid fa-play"></i> INICIAR LECTOR';
    
    statusDot.classList.remove("active");
    statusText.innerText = "ESPERANDO";
    resultValue.innerText = "---";
    
    lastSpokenLabel = ""; // Reset speech state
}

async function loop() {
    if (!isRunning) return;
    
    webcam.update(); // update the webcam frame
    await predict();
    window.requestAnimationFrame(loop);
}

// Function to speak text using the Web Speech API
function speakText(text) {
    // Check if speaking is supported
    if (!('speechSynthesis' in window)) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR'; // Argentine Spanish
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    window.speechSynthesis.speak(utterance);
}

// Map some labels to more natural phonetic strings if necessary
function getSpokenPhrase(label) {
    const map = {
        "10mil": "diez mil pesos",
        "20 mil": "veinte mil pesos",
        "2mil": "dos mil pesos",
        "mil": "mil pesos",
        "500": "quinientos pesos",
        "200": "doscientos pesos",
        "100": "cien pesos",
        "50": "cincuenta pesos"
    };
    return map[label] || label;
}

async function predict() {
    // Predict can take in an image, video or canvas html element
    const prediction = await model.predict(webcam.canvas);
    
    // Find the class with the highest probability
    let highestProb = 0;
    let bestLabel = "";
    
    for (let i = 0; i < maxPredictions; i++) {
        const prob = prediction[i].probability;
        if (prob > highestProb) {
            highestProb = prob;
            bestLabel = prediction[i].className;
        }
        
        // Update bars
        const fillElement = document.getElementById(`bar-fill-${i}`);
        const percentElement = document.getElementById(`bar-percent-${i}`);
        if (fillElement && percentElement) {
            const percentage = Math.round(prob * 100);
            fillElement.style.width = percentage + "%";
            percentElement.innerText = percentage + "%";
            
            // Highlight the dominant class
            if (prob > 0.95) {
                fillElement.style.backgroundColor = "var(--accent-color)";
            } else if (prob > 0.5) {
                fillElement.style.backgroundColor = "var(--text-secondary)";
            } else {
                fillElement.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
            }
        }
    }

    // Only consider it a valid detection if confidence is high (> 95%)
    if (highestProb > 0.95) {
        resultValue.innerText = bestLabel.toUpperCase();
        
        const now = Date.now();
        // Speak if it's a new bill, or if enough time has passed since we last spoke THIS bill
        if (bestLabel !== lastSpokenLabel || (now - lastSpokenTime) > SPEECH_COOLDOWN_MS) {
            const textToSpeak = getSpokenPhrase(bestLabel);
            speakText(textToSpeak);
            
            lastSpokenLabel = bestLabel;
            lastSpokenTime = now;
        }
    } else {
        resultValue.innerText = "No estoy seguro";
    }
}
