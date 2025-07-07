console.log('🔧 EEG Viewer starting...');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOM loaded, initializing viewer...');

  window.addEventListener('error', (e) => {
    console.error('💥 Global error caught:', e.error);
    showError(`JavaScript Error: ${e.error.message}`);
    e.preventDefault();
    return true;
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('💥 Unhandled promise rejection:', e.reason);
    showError(`Promise Error: ${e.reason}`);
    e.preventDefault();
    return true;
  });

  try {
    await initializeViewer();
  } catch (error) {
    console.error('💥 Initialization failed:', error);
    showError(`Initialization failed: ${error.message}`);
  }
});

async function initializeViewer() {
  console.log('🔧 Initializing viewer...');

  if (typeof Plotly === 'undefined') {
    throw new Error('Plotly.js library not loaded');
  }
  console.log('✅ Plotly.js available');

  await loadAndProcessData();
}

async function loadAndProcessData() {
  console.log('📦 Loading data from storage...');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Storage access timeout after 10 seconds'));
    }, 10000);

    chrome.storage.local.get([
      'eegDataBuffer',
      'eegDataType',
      'eegFileName'
    ], async (result) => {
      clearTimeout(timeout);

      try {
        if (!result.eegDataBuffer) {
          throw new Error('No EEG data found in storage');
        }

        console.log('🌐 Sending EDF to Flask API for preview...');
        await sendToFlaskAndPlot(result.eegDataBuffer, result.eegFileName);

        resolve();
      } catch (error) {
        console.error('❌ Data processing error:', error);
        reject(error);
      }
    });
  });
}

async function sendToFlaskAndPlot(bufferArray, fileName) {
  try {
    const blob = new Blob([new Uint8Array(bufferArray)], {
      type: 'application/octet-stream'
    });

    const formData = new FormData();
    formData.append('file', blob, fileName || 'eeg.edf');

    const response = await fetch('http://localhost:5000/edf-preview', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flask error: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ EDF Preview from Flask:', result);

    await plotPreviewEDF(result, fileName);
  } catch (error) {
    console.error('❌ Error calling Flask API:', error);
    showError(error.message);
  }
}

function downsample(arr, factor = 10) {
  return arr.filter((_, i) => i % factor === 0);
}

async function plotPreviewEDF(data, fileName) {
  try {
    const traces = [];
    const timeAxis = Array.from(
      { length: data.signals[0].length },
      (_, i) => i / data.sample_rate
    );

    for (let i = 0; i < Math.min(data.signals.length, 6); i++) {
      const y = downsample(data.signals[i]);
      const x = downsample(timeAxis, data.signals[i].length / y.length);

      traces.push({
        x,
        y,
        type: 'scatter',
        mode: 'lines',
        name: data.channel_names[i],
        yaxis: `y${i + 1}`
      });
    }

    await createPlot(traces, `Preview: ${fileName}`, true);
  } catch (error) {
    console.error('❌ EDF plotting failed:', error);
    showError('Plotting failed: ' + error.message);
  }
}

async function createPlot(traces, title, useSubplots) {
  try {
    const layout = {
      title,
      showlegend: true,
      height: window.innerHeight,
      margin: { l: 50, r: 50, t: 50, b: 50 }
    };

    if (useSubplots && traces.length > 1) {
      const subplotHeight = 1 / traces.length;
      for (let i = 0; i < traces.length; i++) {
        layout[`yaxis${i + 1}`] = {
          domain: [i * subplotHeight, (i + 1) * subplotHeight - 0.02],
          title: traces[i].name
        };
      }
    } else {
      layout.yaxis = { title: 'Amplitude' };
      layout.xaxis = { title: 'Time (s)' };
    }

    await Plotly.newPlot('plot', traces, layout, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d']
    });
  } catch (error) {
    console.error('❌ Plot creation failed:', error);
    showError('Plot error: ' + error.message);
  }
}

function showError(message) {
  const plotDiv = document.getElementById('plot');
  plotDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; padding: 20px; text-align: center;">
      <div style="font-size: 18px; color: #d32f2f; margin-bottom: 20px; max-width: 600px; line-height: 1.4;">
        ${message}
      </div>
      <div style="padding: 15px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-width: 600px;">
        - Check browser console (F12) for detailed logs<br>
        - Ensure Flask API is running at http://localhost:5000<br>
        - Make sure CORS is enabled in Flask
      </div>
      <div style="margin-top: 20px;">
        <button onclick="window.location.reload()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Reload Page</button>
      </div>
    </div>
  `;
}

// Initial loading state
document.getElementById('plot').innerHTML = `
  <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: #666;">
    🧠 Loading EEG data...
  </div>
`;

console.log('✅ Viewer script loaded successfully');
