from flask import Flask, request, jsonify
from flask_cors import CORS
import mne
import pandas as pd
import numpy as np
import io, os, struct, tempfile


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
    
@app.route('/txt-preview', methods=['POST'])
def txt_preview():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']

    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as tmp:
        file_bytes = file.read()
        tmp.write(file_bytes)
        tmp.flush()
        file_path = tmp.name

    try:
        # Try decoding first part of file as ASCII to find header
        with open(file_path, 'rb') as f:
            header_bytes = f.read(4096)  # Read first 4KB for header
        try:
            header_text = header_bytes.decode('ascii', errors='ignore')
            lines = header_text.splitlines()
            eeg_cols = []
            sample_rate = 160  # Default fallback
            for line in lines:
                if 'sampling rate' in line.lower():
                    try:
                        sample_rate = int(''.join(filter(str.isdigit, line)))
                    except:
                        pass
                if 'channel' in line.lower() and 'label' in line.lower():
                    eeg_cols.append(line.strip())

            # If channel names aren't found, fallback to CSV
            data_df = pd.read_csv(io.BytesIO(file_bytes), sep=None, engine="python")
            channel_candidates = [col for col in data_df.columns if any(key in col.lower() for key in ['eeg', 'exg', 'channel'])]
            if not channel_candidates:
                raise ValueError("No valid EEG channel columns found.")
            data = data_df[channel_candidates].replace([np.nan, np.inf, -np.inf], 0.0)
            sample_limit = min(sample_rate * 10, len(data))
            data = data.iloc[:sample_limit]
            signals = data.to_numpy().T
            return jsonify({
                "sample_rate": sample_rate,
                "channel_names": channel_candidates,
                "duration": 10,
                "signals": [ch.tolist() for ch in signals]
            })
        except Exception as ascii_err:
            # If ASCII + pandas fails, try binary interpretation
            with open(file_path, 'rb') as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(0)
                raw_data = f.read()
                num_ints = size // 2
                data = struct.unpack('<' + 'h' * num_ints, raw_data[:num_ints * 2])
                data = np.array(data, dtype=np.float32)

                # Assume 8 channels (adjust if known)
                channels = 8
                data = data[: (len(data) // channels) * channels]
                data = data.reshape((-1, channels)).T

                sample_rate = 160
                sample_limit = min(10 * sample_rate, data.shape[1])
                return jsonify({
                    "sample_rate": sample_rate,
                    "channel_names": [f"Ch-{i+1}" for i in range(data.shape[0])],
                    "duration": 10,
                    "signals": [np.nan_to_num(ch[:sample_limit], nan=0.0).tolist() for ch in data]
                })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.remove(file_path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
