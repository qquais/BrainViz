from flask import Flask, request, jsonify
from flask_cors import CORS
import mne
import tempfile
import os
import numpy as np
import struct
import pandas as pd
import io

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return "🧠 EEG Flask API is running"

@app.route('/edf-preview', methods=['POST'])
def edf_preview():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']

    # Save EDF temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".edf") as tmp:
        tmp.write(file.read())
        tmp.flush()
        file_path = tmp.name

    try:
        # Load header only
        raw = mne.io.read_raw_edf(file_path, preload=False, verbose=False)

        # Limit to preview duration
        preview_seconds = 10
        sfreq = int(raw.info['sfreq'])
        sample_limit = min(preview_seconds * sfreq, raw.n_times)

        raw.crop(tmin=0, tmax=preview_seconds, include_tmax=False)
        raw.load_data()

        data, _ = raw[:, :sample_limit]

        return jsonify({
            "sample_rate": sfreq,
            "channel_names": raw.ch_names,
            "duration": preview_seconds,
            "signals": [d.tolist() for d in data]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        os.remove(file_path)

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
    app.run(debug=True, port=5000)
