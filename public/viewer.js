document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['eegData', 'timeData'], (result) => {
    if (result.eegData && result.timeData) {
      Plotly.newPlot('plot', [{
        x: result.timeData,
        y: result.eegData,
        type: 'scatter',
        mode: 'lines',
        line: { color: 'royalblue' }
      }], {
        title: 'EEG Signal - EXG Channel 0',
        xaxis: { title: 'Time (s)' },
        yaxis: { title: 'Amplitude (µV)' },
        height: 600
      });
    } else {
      document.getElementById('plot').innerHTML = '❌ No EEG data found.';
    }
  });
});
