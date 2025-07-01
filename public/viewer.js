/**
 * EEG Data Visualization Module - Fallback Version
 * Handles loading, parsing, and plotting of EEG signal data using Plotly.js
 * With fallback for missing EDF decoder
 * 
 * @fileoverview Main viewer script that processes EEG data and creates interactive plots
 * @author EEG Reader Extension
 * @version 1.4.2 - Fallback
 */

/**
 * Initializes the EEG viewer when the DOM is loaded
 * Retrieves stored EEG data and begins the visualization process
 * 
 * @listens document.DOMContentLoaded
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 EEG Viewer loaded');
  
  // Check if required libraries are loaded
  console.log('📚 Checking libraries...');
  console.log('Plotly available:', typeof Plotly !== 'undefined');
  console.log('edfdecoder available:', typeof edfdecoder !== 'undefined');
  
  chrome.storage.local.get(['eegDataText', 'eegDataBuffer', 'eegDataType'], (result) => {
    console.log('📦 Storage contents:', result);
    
    if (!result.eegDataText && !result.eegDataBuffer) {
      showError('❌ No EEG data found');
      return;
    }

    try {
      if (result.eegDataType === 'edf') {
        console.log('🔬 Processing EDF data...');
        
        // Check if EDF decoder is available
        if (typeof edfdecoder === 'undefined') {
          console.error('❌ EDF decoder library not loaded!');
          showError('❌ EDF decoder library not found. Please add edfdecoder.js to your libs/ folder and reload the extension.');
          return;
        }
        
        plotEDFData(result.eegDataBuffer);
      } else {
        console.log('📄 Processing text data...');
        plotEEGData(result.eegDataText);
      }
    } catch (error) {
      console.error('💥 Critical error:', error);
      showError('❌ Error processing data: ' + error.message);
    }
  });
});

/**
 * Parses and visualizes EDF (European Data Format) binary data using Plotly.js interactive charts.
 * Enhanced with extensive error handling and debugging
 * 
 * @param {number[]} bufferArray - Array of integers representing the binary EDF file data
 * @returns {void}
 */
function plotEDFData(bufferArray) {
  console.log('🔬 plotEDFData called with buffer length:', bufferArray ? bufferArray.length : 'undefined');
  
  // Clear loading message immediately
  document.getElementById('plot').innerHTML = 'Processing EDF file...';
  
  try {
    // Validate input
    if (!bufferArray || !Array.isArray(bufferArray)) {
      throw new Error('Invalid buffer array provided');
    }
    
    if (bufferArray.length === 0) {
      throw new Error('Empty buffer array');
    }
    
    console.log('✅ Buffer validation passed');
    
    // Convert array back to ArrayBuffer
    console.log('🔄 Converting to ArrayBuffer...');
    const buffer = new Uint8Array(bufferArray).buffer;
    console.log('📏 ArrayBuffer size:', buffer.byteLength, 'bytes');
    
    // Check if edfdecoder is available
    if (typeof edfdecoder === 'undefined') {
      throw new Error('EDF decoder library not available. Please add edfdecoder.js to your libs/ folder.');
    }
    
    // Use EDF decoder
    console.log('🔧 Initializing EDF decoder...');
    const decoder = new edfdecoder.EdfDecoder();
    
    console.log('📥 Setting input buffer...');
    decoder.setInput(buffer);
    
    console.log('⚙️ Decoding EDF data...');
    decoder.decode();
    
    console.log('📤 Getting decoded output...');
    const edfData = decoder.getOutput();
    
    if (!edfData) {
      throw new Error('EDF decoder returned null/undefined');
    }
    
    console.log('✅ EDF decoded successfully');
    console.log('📊 EDF Data object:', edfData);
    
    // Get signal information
    const numSignals = edfData.getNumberOfSignals();
    const numRecords = edfData.getNumberOfRecords();
    
    console.log('📈 Number of signals:', numSignals);
    console.log('📈 Number of records:', numRecords);
    
    if (numSignals === 0 || numRecords === 0) {
      throw new Error(`No valid signals found in EDF file (signals: ${numSignals}, records: ${numRecords})`);
    }
    
    // For now, plot the first signal
    const signalIndex = 0;
    console.log(`🎯 Processing signal ${signalIndex}...`);
    
    // Get signal metadata
    const signalLabel = edfData.getSignalLabel(signalIndex);
    const sampleRate = edfData.getSampleRate(signalIndex);
    
    // Try to get physical unit (some versions might not have this method)
    let physicalUnit = 'Amplitude';
    try {
      if (edfData.getPhysicalUnit) {
        physicalUnit = edfData.getPhysicalUnit(signalIndex) || 'Amplitude';
      }
    } catch (e) {
      console.log('⚠️ getPhysicalUnit not available, using default');
    }
    
    console.log(`📊 Signal: "${signalLabel}", Sample rate: ${sampleRate} Hz, Unit: ${physicalUnit}`);
    
    // Concatenate all records for this signal
    console.log('🔗 Concatenating signal records...');
    const allSignalData = edfData.getPhysicalSignalConcatRecords(signalIndex, 0, numRecords);
    
    if (!allSignalData || allSignalData.length === 0) {
      throw new Error('No signal data extracted from EDF file');
    }
    
    console.log('📏 Total signal data points:', allSignalData.length);
    
    // Create time array based on sample rate
    console.log('⏱️ Creating time array...');
    const timeArray = allSignalData.map((_, index) => index / sampleRate);
    
    // Limit data for performance (same as text files)
    const maxPoints = 5000;
    const step = Math.max(1, Math.floor(allSignalData.length / maxPoints));
    
    console.log(`🎛️ Decimation: ${allSignalData.length} -> ~${Math.floor(allSignalData.length / step)} points (step: ${step})`);
    
    const decimatedTime = timeArray.filter((_, index) => index % step === 0);
    const decimatedSignal = allSignalData.filter((_, index) => index % step === 0);
    
    console.log('📊 Final data points:', decimatedTime.length);
    
    // Create Plotly trace
    const trace = {
      x: decimatedTime,
      y: decimatedSignal,
      type: 'scatter',
      mode: 'lines',
      name: signalLabel || 'EDF Signal',
      line: { color: '#1f77b4', width: 1 }
    };

    const layout = {
      title: `EDF Signal: ${signalLabel || 'Unknown'} (${numSignals} total signals)`,
      xaxis: { title: 'Time (s)' },
      yaxis: { title: physicalUnit },
      margin: { l: 60, r: 60, t: 60, b: 50 }
    };

    const config = {
      displayModeBar: true,
      displaylogo: false
    };

    console.log('🎨 Creating Plotly chart...');
    Plotly.newPlot('plot', [trace], layout, config).then(() => {
      console.log('✅ EDF Plot created successfully');
    }).catch((plotError) => {
      console.error('❌ Plotly error:', plotError);
      throw new Error('Failed to create plot: ' + plotError.message);
    });
    
  } catch (error) {
    console.error('💥 EDF processing error:', error);
    console.error('📍 Error stack:', error.stack);
    
    // Provide specific error messages
    let errorMessage = error.message;
    if (error.message.includes('edfdecoder')) {
      errorMessage = 'EDF decoder library missing. Please download edfdecoder.js and add it to your libs/ folder.';
    } else if (error.message.includes('EdfDecoder')) {
      errorMessage = 'EDF decoder failed to initialize. Make sure the file is a valid EDF format.';
    }
    
    showError('❌ Error processing EDF file: ' + errorMessage);
  }
}

/**
 * Parses EEG text data and creates an interactive Plotly visualization
 * Handles CSV/TSV format detection, data parsing, and plot generation
 * 
 * @param {string} text - Raw EEG data as a string (CSV/TSV format)
 * @returns {void}
 */
function plotEEGData(text) {
  console.log('📄 plotEEGData called with text length:', text ? text.length : 'undefined');
  
  // Clear loading message immediately
  document.getElementById('plot').innerHTML = '';
  
  // Split text into individual lines
  const lines = text.trim().split('\n');
  
  if (lines.length < 2) {
    showError('❌ File needs header and data rows');
    return;
  }

  // Parse headers from first line
  const headers = lines[0].split(/[,\t;]/).map(h => h.trim());
  console.log('📋 Headers:', headers);

  // Initialize data arrays
  const time = [];
  const signal = [];
  
  // Parse data rows with performance limit
  for (let i = 1; i < Math.min(lines.length, 5000); i++) { // Limit for performance
    const row = lines[i].split(/[,\t;]/);
    
    if (row.length >= 2) {
      const t = parseFloat(row[0]);
      const s = parseFloat(row[1]);
      
      // Only include valid numeric data points
      if (!isNaN(t) && !isNaN(s)) {
        time.push(t);
        signal.push(s);
      }
    }
  }

  if (time.length === 0) {
    showError('❌ No valid data found');
    return;
  }

  console.log('📊 Parsed data points:', time.length);

  // Create Plotly trace
  const trace = {
    x: time,
    y: signal,
    type: 'scatter',
    mode: 'lines',
    name: headers[1] || 'EEG Signal',
    line: { color: '#1f77b4', width: 1 }
  };

  const layout = {
    title: 'EEG Signal Visualization',
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Amplitude (µV)' },
    margin: { l: 60, r: 60, t: 60, b: 50 }
  };

  const config = {
    displayModeBar: true,
    displaylogo: false
  };

  // Create the interactive plot
  Plotly.newPlot('plot', [trace], layout, config).then(() => {
    console.log('✅ Text plot created successfully');
  });
}

/**
 * Displays error messages to the user with a friendly interface
 * Replaces the plot area with an error message and close button
 * 
 * @param {string} message - The error message to display to the user
 * @returns {void}
 */
function showError(message) {
  console.log('🚨 Showing error:', message);
  document.getElementById('plot').innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; padding: 20px;">
      <div style="font-size: 18px; color: #d32f2f; margin-bottom: 20px; text-align: center; max-width: 600px; line-height: 1.4;">
        ${message}
      </div>
      <div style="margin-bottom: 20px; padding: 15px; background: #f0f0f0; border-radius: 8px; font-size: 14px; max-width: 600px;">
        <strong>How to fix:</strong><br>
        1. Download edfdecoder.js from: https://github.com/Pixpipe/edfdecoder<br>
        2. Save it to your extension's libs/ folder<br>
        3. Reload the extension
      </div>
      <button onclick="window.close()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
        Close Window
      </button>
    </div>
  `;
}