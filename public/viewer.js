/**
 * EEG Data Visualization Module
 * Handles loading, parsing, and plotting of EEG signal data using Plotly.js
 * 
 * @fileoverview Main viewer script that processes EEG data and creates interactive plots
 * @author EEG Reader Extension
 * @version 1.4
 * @since 1.0
 * @requires plotly.js - For creating interactive charts
 */

/**
 * Initializes the EEG viewer when the DOM is loaded
 * Retrieves stored EEG data and begins the visualization process
 * 
 * @listens document.DOMContentLoadedgit 
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['eegDataText'], (result) => {
    if (!result.eegDataText) {
      showError('❌ No EEG data found');
      return;
    }

    try {
      plotEEGData(result.eegDataText);
    } catch (error) {
      console.error('Error:', error);
      showError('❌ Error processing data: ' + error.message);
    }
  });
});

/**
 * Parses EEG text data and creates an interactive Plotly visualization
 * Handles CSV/TSV format detection, data parsing, and plot generation
 * 
 * @param {string} text - Raw EEG data as a string (CSV/TSV format)
 * @returns {void}
 * 
 * @throws {Error} When data parsing fails or plot creation fails
 * 
 * @example
 * // CSV format data
 * const eegData = "Time,Signal\n0.001,15.2\n0.002,16.1\n...";
 * plotEEGData(eegData);
 * 
 * @description
 * Expected data format:
 * - First row: Headers (Time, Signal, etc.)
 * - Subsequent rows: Numeric data separated by commas, tabs, or semicolons
 * - First column: Time values (seconds)
 * - Second column: Signal amplitude values (microvolts)
 */
function plotEEGData(text) {
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
  console.log('Headers:', headers);

  // Initialize data arrays
  const time = [];
  const signal = [];
  
  /**
   * Parse data rows with performance limit
   * Processes up to 5000 rows for performance reasons
   */
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

  /**
   * Create Plotly trace configuration
   * @type {Object} Plotly trace object for line chart
   */
  const trace = {
    x: time,
    y: signal,
    type: 'scatter',
    mode: 'lines',
    name: headers[1] || 'EEG Signal',
    line: { color: '#1f77b4', width: 1 }
  };

  /**
   * Configure plot layout and styling
   * @type {Object} Plotly layout configuration
   */
  const layout = {
    title: 'EEG Signal Visualization',
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Amplitude (µV)' },
    margin: { l: 60, r: 60, t: 60, b: 50 }
  };

  /**
   * Configure plot options and controls
   * @type {Object} Plotly configuration options
   */
  const config = {
    displayModeBar: true,
    displaylogo: false
  };

  // Create the interactive plot
  Plotly.newPlot('plot', [trace], layout, config).then(() => {
    console.log('✅ Plot created successfully');
  });
}

/**
 * Displays error messages to the user with a friendly interface
 * Replaces the plot area with an error message and close button
 * 
 * @param {string} message - The error message to display to the user
 * @returns {void}
 * 
 * @example
 * showError('❌ No EEG data found');
 * showError('❌ File format not supported');
 * 
 * @description
 * Creates a centered error display with:
 * - Error message in red text
 * - Close button to exit the viewer
 * - Responsive flex layout
 */
function showError(message) {
  document.getElementById('plot').innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
      <div style="font-size: 18px; color: #d32f2f; margin-bottom: 10px;">${message}</div>
      <button onclick="window.close()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Close Window
      </button>
    </div>
  `;
}