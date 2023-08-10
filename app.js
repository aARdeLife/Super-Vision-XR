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
  const objectSymbolMapping = {"car": "🚗", "person": "🚶", "tree": "🌳", "dog": "🐕", "cat": "🐈", "bicycle": "🚲", "bus": "🚌", "bird": "🐦"};


let symbolGrowthData = {};

function updateSymbolGrowth() {
    for (let key in symbolGrowthData) {
        symbolGrowthData[key].growth += 2;
        
        // Check if growth reached 100%
        if (symbolGrowthData[key].growth >= 100) {
            symbolGrowthData[key].duplicates += 1;
            symbolGrowthData[key].growth = 0;
        }
    }
}

// Set up an interval to update symbol growth every minute
setInterval(updateSymbolGrowth, 60000);



let objectTimers = {};

function updateObjectTimers() {
    for (let key in objectTimers) {
        if (objectTimers[key].detected) {
            objectTimers[key].time += 1;
        }
    }
}

// Set up an interval to update the timers every second
setInterval(updateObjectTimers, 1000);


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

const symbol = objectSymbolMapping[prediction.class];
if (symbol) {
    ctx.fillText(symbol, x, y - 20);
}

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

    // Get the user's location
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      // Send the detected objects and location data to the server
      const detectedObjects = currentPredictions.map(prediction => ({
        object_name: prediction.class,
        timestamp: new Date(),
        location: `POINT(${longitude} ${latitude})`
      }));

      const response = await fetch('/api/detected-objects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(detectedObjects)
      });

      if (response.ok) {
        console.log('Objects and location data sent to the server');
      } else {
        console.error('Failed to send objects and location data to the server');
      }
    });

    requestAnimationFrame(detectFrame);
  }

  detectFrame();
}

(async function() {
  const videoElement = await setupCamera();
  videoElement.play();
  detectObjects();
})();



let selectedObjects = [];

function drawPredictions(predictions) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        ctx.strokeStyle = selectedObjects.includes(prediction.class) ? 'red' : 'green';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = 'white';
        ctx.fillText(prediction.class, x, y);
        const symbol = objectSymbolMapping[prediction.class];
        if (symbol) {
            ctx.fillText(symbol, x, y - 20);
        }
    });
}

canvas.addEventListener('click', (event) => {
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        if (isPointInRect(event.clientX, event.clientY, prediction.bbox)) {
            if (selectedObjects.includes(prediction.class)) {
                const index = selectedObjects.indexOf(prediction.class);
                selectedObjects.splice(index, 1);
            } else {
                selectedObjects.push(prediction.class);
            }
            drawPredictions(predictions);
        }
    });
});

const activityMapping = {
    'person,car': { activity: 'traffic', symbol: '🚦' },
    'dog,person': { activity: 'dog walking', symbol: '🐕' },
    'person,bicycle': { activity: 'cycling', symbol: '🚴' },
    // ... more combinations can be added here
};

function determineActivity() {
    const sortedSelectedObjects = selectedObjects.sort().join(',');
    return activityMapping[sortedSelectedObjects];
}

canvas.addEventListener('click', (event) => {
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        if (isPointInRect(event.clientX, event.clientY, prediction.bbox)) {
            if (selectedObjects.includes(prediction.class)) {
                const index = selectedObjects.indexOf(prediction.class);
                selectedObjects.splice(index, 1);
            } else {
                selectedObjects.push(prediction.class);
            }
            drawPredictions(predictions);

            // Check for activity after selecting objects
            const activity = determineActivity();
            if (activity) {
                // Calculate center point of all selected objects
                let totalX = 0, totalY = 0;
                selectedObjects.forEach(object => {
                    const objectPrediction = predictions.find(pred => pred.class === object);
                    totalX += objectPrediction.bbox[0] + objectPrediction.bbox[2] / 2;
                    totalY += objectPrediction.bbox[1] + objectPrediction.bbox[3] / 2;
                });
                const centerX = totalX / selectedObjects.length;
                const centerY = totalY / selectedObjects.length;

                // Draw the activity symbol at the center
                ctx.font = "30px Arial";
                ctx.fillText(activity.symbol, centerX, centerY);
            }
        }
    });
});
