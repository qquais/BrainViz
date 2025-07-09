from flask import Flask, request, jsonify
from flask_cors import CORS
import mne
import tempfile
import os

app = Flask(__name__)
CORS(app)

# Global MNE object
mne_raw_obj = None

@app.route('/')
def home():
    return 'EEG MCP Server is running.'

@app.route('/edf-preview', methods=['POST'])
def edf_preview():
    global mne_raw_obj

    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file uploaded'}), 400

    try:
        # ✅ Save EDF to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".edf") as tmp:
            tmp.write(file.read())
            tmp_path = tmp.name

        # ✅ Read using MNE from file path
        mne_raw_obj = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)

        # Clean up temp file
        os.remove(tmp_path)

        sample_rate = int(mne_raw_obj.info['sfreq'])
        channels = mne_raw_obj.ch_names
        signals, _ = mne_raw_obj[:, :]

        return jsonify({
            'channel_names': channels,
            'sample_rate': sample_rate,
            'signals': [s[:5000].tolist() for s in signals]
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/edf-channel-data', methods=['POST'])
def get_channel_data():
    global mne_raw_obj

    if mne_raw_obj is None:
        return jsonify({'error': 'No EDF file loaded yet'}), 400

    req = request.get_json()
    if not req or 'channel' not in req:
        return jsonify({'error': 'Missing "channel" in request'}), 400

    channel = req['channel']
    if channel not in mne_raw_obj.ch_names:
        return jsonify({'error': f'Invalid channel name: {channel}'}), 400

    try:
        idx = mne_raw_obj.ch_names.index(channel)
        signal, _ = mne_raw_obj[idx, :]

        return jsonify({
            'channel': channel,
            'sample_rate': int(mne_raw_obj.info['sfreq']),
            'signal': signal[0].tolist()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
