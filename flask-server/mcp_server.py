from flask import Flask, request, jsonify
from flask_cors import CORS
import mne
import pandas as pd
import numpy as np
import io
import os
import struct
import tempfile
import logging
from mne.time_frequency import psd_array_welch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

def load_edf_from_file(file):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".edf") as tmp:
        tmp.write(file.read())
        tmp_path = tmp.name

    raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
    os.remove(tmp_path)
    return raw

def extract_signals(raw):
    sample_rate = int(raw.info['sfreq'])
    channels = raw.ch_names
    signals, _ = raw[:, :]
    signals = np.nan_to_num(signals, nan=0.0, posinf=0.0, neginf=0.0)
    return sample_rate, channels, signals

def clean_signals(signals):
    return np.nan_to_num(signals, nan=0.0, posinf=0.0, neginf=0.0)

@app.route('/')
def home():
    return 'EEG MCP Server is running.'

@app.route('/ping')
def ping():
    return jsonify({"status": "alive"})

@app.route('/edf-preview', methods=['POST'])
def edf_preview():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'No file uploaded'}), 400

    try:
        raw = load_edf_from_file(file)
        sample_rate, channels, signals = extract_signals(raw)

        return jsonify({
            'channel_names': channels,
            'sample_rate': sample_rate,
            'signals': [s[:5000].tolist() for s in signals]
        })

    except Exception as e:
        logger.exception("EDF preview failed")
        return jsonify({'error': str(e)}), 500

@app.route('/edf-channel-data', methods=['POST'])
def get_channel_data():
    file = request.files.get('file')
    channel = request.form.get('channel')

    if not file or not channel:
        return jsonify({'error': 'Missing EDF file or channel name'}), 400

    try:
        raw = load_edf_from_file(file)

        if channel not in raw.ch_names:
            return jsonify({'error': f'Invalid channel name: {channel}'}), 400

        idx = raw.ch_names.index(channel)
        signal, _ = raw[idx, :]
        signal = clean_signals(signal[0])

        return jsonify({
            'channel': channel,
            'sample_rate': int(raw.info['sfreq']),
            'signal': signal.tolist()
        })

    except Exception as e:
        logger.exception("edf-channel-data failed")
        return jsonify({'error': str(e)}), 500

@app.route("/filter-signal", methods=["POST"])
def filter_signal():
    try:
        data = request.get_json()
        required = ["signals", "sample_rate", "filter_type"]
        if not all(k in data for k in required):
            return jsonify({"error": "Missing required keys."}), 400

        signals = np.array(data["signals"])
        sfreq = float(data["sample_rate"])
        filter_type = data["filter_type"]
        l_freq = data.get("l_freq")
        h_freq = data.get("h_freq")

        if filter_type == "notch":
            freqs = l_freq if isinstance(l_freq, list) else [l_freq]
            filtered = mne.filter.notch_filter(signals, sfreq, freqs=freqs)
        else:
            filtered = mne.filter.filter_data(signals, sfreq, l_freq, h_freq, method="iir")

        filtered = clean_signals(filtered)
        return jsonify({"filtered": filtered.tolist()})

    except Exception as e:
        logger.exception("Filter signal failed")
        return jsonify({"error": str(e)}), 500

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
        with open(file_path, 'rb') as f:
            header_bytes = f.read(4096)

        try:
            header_text = header_bytes.decode('ascii', errors='ignore')
            lines = header_text.splitlines()
            sample_rate = 160

            for line in lines:
                if 'sampling rate' in line.lower():
                    try:
                        sample_rate = int(''.join(filter(str.isdigit, line)))
                    except:
                        pass

            data_df = pd.read_csv(io.BytesIO(file_bytes), sep=None, engine="python")

            valid_keywords = ['eeg', 'exg', 'channel', 'fp', 'fz', 'cz', 'oz', 't3', 't4', 'accel']
            channel_names = [
                col for col in data_df.columns
                if any(kw in col.lower() for kw in valid_keywords)
            ]

            if not channel_names:
                channel_names = [
                    col for col in data_df.columns
                    if pd.api.types.is_numeric_dtype(data_df[col]) and data_df[col].nunique() > 1
                ]

            if not channel_names:
                raise ValueError("No valid EEG signal columns found.")

            data = data_df[channel_names].replace([np.nan, np.inf, -np.inf], 0.0)
            sample_limit = min(sample_rate * 10, len(data))
            data = data.iloc[:sample_limit]
            signals = data.to_numpy().T
            signals = clean_signals(signals)

            return jsonify({
                "sample_rate": sample_rate,
                "channel_names": channel_names,
                "duration": 10,
                "signals": [ch.tolist() for ch in signals]
            })

        except Exception:
            with open(file_path, 'rb') as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(0)
                raw_data = f.read()
                num_ints = size // 2
                data = struct.unpack('<' + 'h' * num_ints, raw_data[:num_ints * 2])
                data = np.array(data, dtype=np.float32)

                channels = 8
                data = data[: (len(data) // channels) * channels]
                data = data.reshape((-1, channels)).T

                sample_rate = 160
                sample_limit = min(10 * sample_rate, data.shape[1])
                signals = clean_signals(data[:, :sample_limit])

                return jsonify({
                    "sample_rate": sample_rate,
                    "channel_names": [f"Ch-{i+1}" for i in range(data.shape[0])],
                    "duration": 10,
                    "signals": [ch.tolist() for ch in signals]
                })

    except Exception as e:
        logger.exception("TXT preview failed")
        return jsonify({"error": str(e)}), 500
    finally:
        os.remove(file_path)

@app.route("/psd", methods=["POST"])
def compute_psd():
    try:
        data = request.get_json()
        if not data or "signals" not in data or "sample_rate" not in data:
            return jsonify({"error": "Missing keys in request"}), 400

        signals = np.array(data["signals"])
        sfreq = float(data["sample_rate"])

        if signals.size == 0 or signals.shape[0] == 0:
            return jsonify({"error": "No channels selected for PSD."}), 400

        n_samples = signals.shape[1]
        safe_n_fft = min(2048, n_samples)

        psd, freqs = psd_array_welch(
            signals,
            sfreq=sfreq,
            fmin=0.5,
            fmax=50.0,
            n_fft=safe_n_fft,
            n_per_seg=safe_n_fft
        )

        return jsonify({
            "freqs": freqs.tolist(),
            "psd": psd.tolist()
        })
    except Exception as e:
        logger.exception("PSD computation failed")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
