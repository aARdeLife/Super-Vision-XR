const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const summaryBox = document.createElement('div');
const switchCameraButton = document.getElementById('switch-camera');

summaryBox.style.position = 'absolute';
summaryBox.style.padding = '10px';
summaryBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
summaryBox.style.color = 'white';
summaryBox.style.borderRadius = '5px';
summaryBox.style.fontSize = '14px';
summaryBox.style.maxWidth = '250px';
summaryBox.style.display = 'none';

document.body.appendChild(summaryBox);

let currentStream;

async function setupCamera(deviceId = null) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    const constraints = {
        video: {
            width: 640,
            height: 480,
            deviceId: deviceId ? { exact: deviceId } : undefined
        },
        audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
   video.onloadedmetadata = () => {
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
};



    return new Promise((resolve) => {
        video.onloadeddata = () => {
            resolve(video);
        };
    });
}

switchCameraButton.addEventListener('click', async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const currentDevice = videoDevices.find(device => device.deviceId === currentStream.getVideoTracks()[0].getSettings().deviceId);
    const nextDeviceIndex = (videoDevices.indexOf(currentDevice) + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextDeviceIndex];
    await setupCamera(nextDevice.deviceId);
    video.play();
    detectObjects(); // Restart object detection after switching camera
});


function isPointInRect(x, y, rect) {
    return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3];
}

async function fetchWikipediaSummary(title) {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (response.ok) {
        const data = await response.json();
        return data.extract;
    } else {
        return 'No summary available';
    }
}

canvas.addEventListener('click', async event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (const prediction of currentPredictions) {
        if (isPointInRect(x, y, prediction.bbox)) {
            const summary = await fetchWikipediaSummary(prediction.class);
            summaryBox.style.display = 'block';
            summaryBox.style.left = `${prediction.bbox[0] + prediction.bbox[2]}px`;
            summaryBox.style.top = `${prediction.bbox[1]}px`;
            summaryBox.textContent = summary;
            return;
        }
    }

    summaryBox.style.display = 'none';
});

function getColorBySize(bbox) {
    const area = bbox[2] * bbox[3];
    const maxArea = canvas.width * canvas.height;
    const ratio = area / maxArea;

    const red = 255;
    const green = Math.floor(255 * ratio);
const blue = 0;

return `rgb(${red}, ${green}, ${blue})`;
}

async function drawPredictions(predictions) {
ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
ctx.font = '16px sans-serif';
ctx.textBaseline = 'top';

predictions.forEach(prediction => {
    const x = prediction.bbox[0];
    const y = prediction.bbox[1];
    const width = prediction.bbox[2];
    const height = prediction.bbox[3];

    ctx.strokeStyle = getColorBySize(prediction.bbox);
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = getColorBySize(prediction.bbox);
    ctx.fillText(prediction.class, x, y);
});
}

let currentPredictions = [];

const speakButton = document.getElementById('speak');

function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

speakButton.addEventListener('click', () => {
    if (currentPredictions.length > 0) {
        // Speak the class of the first detected object
        speak(currentPredictions[0].class);
    } else {
        // Speak a message if no objects are detected
        speak('No objects detected');
    }
});


async function detectObjects() {
const model = await cocoSsd.load();

async function detectFrame() {
    currentPredictions = await model.detect(video);
    drawPredictions(currentPredictions);
    requestAnimationFrame(detectFrame);
}

detectFrame();
}

(async function() {
const videoElement = await setupCamera();
videoElement.play();
detectObjects();
})();

