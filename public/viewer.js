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

function plotEEGData(text) {
  // Clear loading message immediately
  document.getElementById('plot').innerHTML = '';
  
  const lines = text.trim().split('\n');
  
  if (lines.length < 2) {
    showError('❌ File needs header and data rows');
    return;
  }

  // Parse headers
  const headers = lines[0].split(/[,\t;]/).map(h => h.trim());
  console.log('Headers:', headers);

  // Parse data
  const time = [];
  const signal = [];
  
  for (let i = 1; i < Math.min(lines.length, 5000); i++) { // Limit for performance
    const row = lines[i].split(/[,\t;]/);
    
    if (row.length >= 2) {
      const t = parseFloat(row[0]);
      const s = parseFloat(row[1]);
      
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

  // Create plot
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

  Plotly.newPlot('plot', [trace], layout, config).then(() => {
    console.log('✅ Plot created successfully');
  });
}

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