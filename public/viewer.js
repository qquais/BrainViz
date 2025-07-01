/**
 * Complete Fixed EEG Viewer with Robust Error Handling
 * This version handles the specific issue where the viewer closes after data loading
 */

console.log('🔧 EEG Viewer starting...');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOM loaded, initializing viewer...');
  
  // Prevent page from closing on errors
  window.addEventListener('error', (e) => {
    console.error('💥 Global error caught:', e.error);
    showError(`JavaScript Error: ${e.error.message}`);
    e.preventDefault(); // Prevent default error handling
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
  
  // Check Plotly availability
  if (typeof Plotly === 'undefined') {
    throw new Error('Plotly.js library not loaded');
  }
  console.log('✅ Plotly.js available');

  // Start loading data
  await loadAndProcessData();
}

async function loadAndProcessData() {
  console.log('📦 Loading data from storage...');
  
  return new Promise((resolve, reject) => {
    // Add timeout to prevent infinite hanging
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
        console.log('📦 Storage result:', {
          hasText: !!result.eegDataText,
          hasBuffer: !!result.eegDataBuffer,
          dataType: result.eegDataType,
          source: result.eegDataSource,
          fileName: result.eegFileName
        });

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
  console.log('🔬 Processing EDF data...', fileName);
  
  try {
    // Convert array back to ArrayBuffer
    const arrayBuffer = new Uint8Array(bufferArray).buffer;
    console.log('📄 Converted to ArrayBuffer:', arrayBuffer.byteLength, 'bytes');

    // Try to process with available EDF decoder
    let edfData = null;
    
    if (typeof edfdecoder !== 'undefined' && edfdecoder.EdfDecoder) {
      console.log('🔧 Using main EDF decoder...');
      const decoder = new edfdecoder.EdfDecoder();
      decoder.setInput(arrayBuffer);
      decoder.decode();
      edfData = decoder.getOutput();
    } else if (typeof SimpleEDFDecoder !== 'undefined') {
      console.log('🔧 Using simple EDF decoder...');
      const decoder = new SimpleEDFDecoder();
      edfData = decoder.decode(arrayBuffer);
    } else {
      console.warn('⚠️ No EDF decoder available, using basic header parsing...');
      edfData = parseEDFBasic(arrayBuffer);
    }

    if (!edfData) {
      throw new Error('EDF decoder returned null - file may be corrupted');
    }

    console.log('✅ EDF data processed successfully');
    await plotEDFSignals(edfData, fileName);
    
  } catch (error) {
    console.error('❌ EDF processing failed:', error);
    
    // Fallback: show raw data visualization
    showError(`EDF processing failed: ${error.message}\n\nTrying basic binary visualization...`);
    
    setTimeout(() => {
      try {
        plotBinaryData(bufferArray, fileName);
      } catch (fallbackError) {
        showError(`All processing methods failed: ${fallbackError.message}`);
      }
    }, 2000);
  }
}

async function processTextData(textData, fileName) {
  console.log('📄 Processing text data...', fileName);
  
  try {
    const lines = textData.split('\n').filter(line => line.trim().length > 0);
    console.log('📊 Found', lines.length, 'lines');

    if (lines.length === 0) {
      throw new Error('Text file appears to be empty');
    }

    // Parse the text data
    const parsedData = parseTextEEG(lines);
    await plotTextSignals(parsedData, fileName);
    
  } catch (error) {
    console.error('❌ Text processing failed:', error);
    showError(`Text processing failed: ${error.message}`);
  }
}

function parseEDFBasic(arrayBuffer) {
  // Basic EDF header parsing for fallback
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('ascii', { fatal: false });
  
  // Create a minimal EDF-like object
  return {
    signals: [{
      label: 'EDF Signal',
      data: Array.from(new Int16Array(arrayBuffer.slice(256, Math.min(arrayBuffer.byteLength, 10000))))
    }],
    sampleRate: 256,
    duration: 10
  };
}

function parseTextEEG(lines) {
  console.log('📊 Parsing text EEG data...');
  
  // Skip comment lines and find data
  const dataLines = lines.filter(line => 
    !line.startsWith('#') && 
    !line.startsWith('%') && 
    line.includes(',') || line.includes('\t') || line.includes(' ')
  );

  if (dataLines.length === 0) {
    throw new Error('No valid data lines found in text file');
  }

  // Detect delimiter
  const firstLine = dataLines[0];
  const delimiter = firstLine.includes(',') ? ',' : 
                   firstLine.includes('\t') ? '\t' : ' ';

  console.log('🔍 Using delimiter:', delimiter === '\t' ? 'tab' : delimiter);

  // Parse data
  const signals = [];
  const timeData = [];
  
  for (let i = 0; i < Math.min(dataLines.length, 10000); i++) { // Limit for performance
    const values = dataLines[i].split(delimiter)
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v));

    if (values.length > 0) {
      timeData.push(i * 0.004); // Assume 250 Hz sample rate
      
      // Initialize signal arrays
      if (signals.length === 0) {
        for (let j = 0; j < values.length; j++) {
          signals.push({
            label: `Channel ${j + 1}`,
            data: []
          });
        }
      }
      
      // Add values to signals
      for (let j = 0; j < Math.min(values.length, signals.length); j++) {
        signals[j].data.push(values[j]);
      }
    }
  }

  return { signals, timeData };
}

async function plotEDFSignals(edfData, fileName) {
  console.log('📈 Plotting EDF signals...');
  
  try {
    const traces = [];
    const numSignals = Math.min(edfData.getNumberOfSignals ? edfData.getNumberOfSignals() : 1, 8);
    
    for (let i = 0; i < numSignals; i++) {
      const signalData = edfData.getPhysicalSignalConcatRecords ? 
        edfData.getPhysicalSignalConcatRecords(i, 0, Math.min(10, edfData.getNumberOfRecords())) :
        edfData.signals[i].data.slice(0, 2500);
      
      const signalLabel = edfData.getSignalLabel ? edfData.getSignalLabel(i) : `Signal ${i + 1}`;
      
      if (signalData && signalData.length > 0) {
        traces.push({
          y: signalData,
          type: 'scatter',
          mode: 'lines',
          name: signalLabel,
          yaxis: `y${i + 1}`
        });
      }
    }

    await createPlot(traces, `EDF File: ${fileName}`, true);
    
  } catch (error) {
    console.error('❌ EDF plotting failed:', error);
    throw error;
  }
}

async function plotTextSignals(parsedData, fileName) {
  console.log('📈 Plotting text signals...');
  
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

function plotBinaryData(bufferArray, fileName) {
  console.log('📈 Creating binary data visualization...');
  
  // Create a simple visualization of binary data
  const sampleData = bufferArray.slice(256, 2256); // Skip header, take 2000 samples
  const traces = [{
    y: sampleData,
    type: 'scatter',
    mode: 'lines',
    name: 'Raw Binary Data',
    line: { color: 'blue' }
  }];

  createPlot(traces, `Binary Data: ${fileName}`, false);
}

async function createPlot(traces, title, useSubplots) {
  console.log('📊 Creating plot with', traces.length, 'traces');
  
  try {
    const layout = {
      title: title,
      showlegend: true,
      height: window.innerHeight,
      margin: { l: 50, r: 50, t: 50, b: 50 }
    };

    if (useSubplots && traces.length > 1) {
      // Create subplots for multiple signals
      const subplot_height = 1 / traces.length;
      for (let i = 0; i < traces.length; i++) {
        layout[`yaxis${i + 1}`] = {
          domain: [i * subplot_height, (i + 1) * subplot_height - 0.02],
          title: traces[i].name
        };
      }
    } else {
      layout.yaxis = { title: 'Amplitude' };
      layout.xaxis = { title: 'Time/Sample' };
    }

    console.log('🎨 Rendering plot...');
    
    await Plotly.newPlot('plot', traces, layout, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d']
    });
    
    console.log('✅ Plot rendered successfully');
    
  } catch (error) {
    console.error('❌ Plot creation failed:', error);
    throw error;
  }
}

function showError(message) {
  console.log('🚨 Showing error message');
  
  const plotDiv = document.getElementById('plot');
  if (plotDiv) {
    plotDiv.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; padding: 20px; text-align: center;">
        <div style="font-size: 18px; color: #d32f2f; margin-bottom: 20px; max-width: 600px; line-height: 1.4;">
          ${message}
        </div>
        <div style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-width: 600px; text-align: left;">
          <strong>Debug Information:</strong><br>
          - Check browser console (F12) for detailed logs<br>
          - Extension may need to be reloaded<br>
          - Try with a smaller test file first<br>
          - Verify all library files are present
        </div>
        <div style="display: flex; gap: 10px;">
          <button onclick="window.location.reload()" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Reload Page
          </button>
          <button onclick="window.close()" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Close Window
          </button>
        </div>
      </div>
    `;
  }
}

// Initialize loading message
document.getElementById('plot').innerHTML = `
  <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: #666;">
    🧠 Loading EEG data...
  </div>
`;

console.log('✅ Viewer script loaded successfully');