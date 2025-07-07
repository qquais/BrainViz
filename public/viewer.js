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
      'eegDataText',
      'eegDataBuffer',
      'eegDataType',
      'eegDataSource',
      'eegFileName'
    ], async (result) => {
      clearTimeout(timeout);

      try {
        if (!result.eegDataText && !result.eegDataBuffer) {
          throw new Error('No EEG data found in storage');
        }

        if (result.eegDataType === 'edf' && result.eegDataBuffer) {
          console.log('🔬 Processing EDF data...');
          await processEDFData(result.eegDataBuffer, result.eegFileName);
        } else if (result.eegDataText) {
          console.log('📄 Processing text data...');
          await processTextData(result.eegDataText, result.eegFileName);
        } else {
          throw new Error('Invalid data format in storage');
        }

        resolve();
      } catch (error) {
        console.error('❌ Data processing error:', error);
        reject(error);
      }
    });
  });
}

async function processEDFData(bufferArray, fileName) {
  try {
    const arrayBuffer = new Uint8Array(bufferArray).buffer;
    console.log('📄 Converted to ArrayBuffer:', arrayBuffer.byteLength, 'bytes');

    if (!edfdecoder?.EdfDecoder) {
      throw new Error('edfdecoder.js not available. Cannot process EDF file.');
    }

    const decoder = new edfdecoder.EdfDecoder();
    decoder.setInput(arrayBuffer);
    decoder.decode();
    const edfData = decoder.getOutput();

    if (!edfData) throw new Error('EDF decoder returned null');

    console.log('✅ EDF data processed successfully');
    await plotEDFSignals(edfData, fileName);
  } catch (error) {
    console.error('❌ EDF processing failed:', error);
    showError(`EDF processing failed: ${error.message}`);
  }
}

async function processTextData(textData, fileName) {
  try {
    const lines = textData.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) throw new Error('Text file appears to be empty');

    const parsedData = parseTextEEG(lines);
    await plotTextSignals(parsedData, fileName);
  } catch (error) {
    console.error('❌ Text processing failed:', error);
    showError(`Text processing failed: ${error.message}`);
  }
}

function parseTextEEG(lines) {
  const dataLines = lines.filter(line =>
    !line.startsWith('#') &&
    !line.startsWith('%') &&
    (line.includes(',') || line.includes('\t') || line.includes(' '))
  );

  if (dataLines.length === 0) {
    throw new Error('No valid data lines found in text file');
  }

  const firstLine = dataLines[0];
  const delimiter = firstLine.includes(',') ? ',' :
                   firstLine.includes('\t') ? '\t' : ' ';

  const signals = [];
  const timeData = [];

  for (let i = 0; i < Math.min(dataLines.length, 10000); i++) {
    const values = dataLines[i].split(delimiter)
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));

    if (values.length > 0) {
      timeData.push(i * 0.004); // Assume 250 Hz

      if (signals.length === 0) {
        for (let j = 0; j < values.length; j++) {
          signals.push({ label: `Channel ${j + 1}`, data: [] });
        }
      }

      for (let j = 0; j < Math.min(values.length, signals.length); j++) {
        signals[j].data.push(values[j]);
      }
    }
  }

  return { signals, timeData };
}

function downsample(arr, factor = 10) {
  return arr.filter((_, i) => i % factor === 0);
}

async function plotEDFSignals(edfData, fileName) {
  try {
    const traces = [];
    const numSignals = Math.min(edfData.getNumberOfSignals(), 6);

    const sampleRate = edfData.getSignalSamplingFrequency(0);
    const durationSeconds = 10;
    const totalSamples = durationSeconds * sampleRate;

    const timeAxis = Array.from({ length: totalSamples }, (_, i) => i / sampleRate);

    for (let i = 0; i < numSignals; i++) {
      const rawData = edfData.getPhysicalSignalConcatRecords(i).slice(0, totalSamples);
      const label = edfData.getSignalLabel(i);
      const downFactor = Math.max(1, Math.floor(rawData.length / 1000));

      traces.push({
        x: downsample(timeAxis, downFactor),
        y: downsample(rawData, downFactor),
        type: 'scatter',
        mode: 'lines',
        name: label,
        yaxis: `y${i + 1}`
      });
    }

    await createPlot(traces, `EDF File: ${fileName}`, true);
  } catch (error) {
    console.error('❌ EDF plotting failed:', error);
    throw error;
  }
}

async function plotTextSignals(parsedData, fileName) {
  try {
    const traces = [];
    const maxSignals = Math.min(parsedData.signals.length, 6);

    for (let i = 0; i < maxSignals; i++) {
      const signal = parsedData.signals[i];
      if (signal.data.length > 0) {
        traces.push({
          x: parsedData.timeData.slice(0, signal.data.length),
          y: signal.data,
          type: 'scatter',
          mode: 'lines',
          name: signal.label,
          yaxis: `y${i + 1}`
        });
      }
    }

    await createPlot(traces, `Text File: ${fileName}`, true);
  } catch (error) {
    console.error('❌ Text plotting failed:', error);
    throw error;
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
    throw error;
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
        - Try with a smaller test file first<br>
        - Ensure edfdecoder.js is loaded properly
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
