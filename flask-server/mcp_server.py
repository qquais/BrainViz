from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import mne
import pandas as pd
import numpy as np
import io
import os
import struct
import tempfile
import matplotlib
matplotlib.use('Agg')  
import matplotlib.pyplot as plt
import logging
from mne.time_frequency import psd_array_welch
from io import BytesIO

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

@app.route("/psd-topomap", methods=["POST"])
def psd_topomap():
    """Robust topomap with duplicate handling"""
    try:
        edf_file = request.files.get('file')
        freq = float(request.form.get("freq", 10))

        if not edf_file:
            return jsonify({"error": "No file uploaded"}), 400

        raw = load_edf_from_file(edf_file)
        logger.info(f"Original channels ({len(raw.ch_names)}): {raw.ch_names}")
        
        # Comprehensive electrode positions
        electrode_positions = {
            'FP1': [-0.06, 0.08, 0.05], 'FP2': [0.06, 0.08, 0.05], 'FPZ': [0.0, 0.08, 0.05],
            'AF3': [-0.04, 0.07, 0.05], 'AF4': [0.04, 0.07, 0.05], 'AFZ': [0.0, 0.07, 0.05],
            'F7': [-0.08, 0.03, 0.02], 'F3': [-0.05, 0.05, 0.04], 'FZ': [0.0, 0.05, 0.06],
            'F4': [0.05, 0.05, 0.04], 'F8': [0.08, 0.03, 0.02],
            'FC5': [-0.07, 0.02, 0.03], 'FC3': [-0.04, 0.03, 0.05], 'FC1': [-0.03, 0.02, 0.05],
            'FCZ': [0.0, 0.02, 0.06], 'FC2': [0.03, 0.02, 0.05], 'FC4': [0.04, 0.03, 0.05], 'FC6': [0.07, 0.02, 0.03],
            'T7': [-0.08, 0.0, 0.0], 'C5': [-0.07, 0.0, 0.02], 'C3': [-0.05, 0.0, 0.04], 'C1': [-0.025, 0.0, 0.05],
            'CZ': [0.0, 0.0, 0.06], 'C2': [0.025, 0.0, 0.05], 'C4': [0.05, 0.0, 0.04], 'C6': [0.07, 0.0, 0.02], 'T8': [0.08, 0.0, 0.0],
            'CP5': [-0.07, -0.02, 0.03], 'CP3': [-0.04, -0.03, 0.05], 'CP1': [-0.03, -0.02, 0.05],
            'CPZ': [0.0, -0.02, 0.06], 'CP2': [0.03, -0.02, 0.05], 'CP4': [0.04, -0.03, 0.05], 'CP6': [0.07, -0.02, 0.03],
            'P7': [-0.08, -0.03, 0.02], 'P5': [-0.06, -0.04, 0.03], 'P3': [-0.05, -0.05, 0.04], 'P1': [-0.03, -0.06, 0.05],
            'PZ': [0.0, -0.05, 0.06], 'P2': [0.03, -0.06, 0.05], 'P4': [0.05, -0.05, 0.04], 'P6': [0.06, -0.04, 0.03], 'P8': [0.08, -0.03, 0.02],
            'PO7': [-0.06, -0.06, 0.02], 'PO3': [-0.04, -0.07, 0.03], 'POZ': [0.0, -0.07, 0.05], 'PO4': [0.04, -0.07, 0.03], 'PO8': [0.06, -0.06, 0.02],
            'O1': [-0.03, -0.08, 0.02], 'OZ': [0.0, -0.08, 0.04], 'O2': [0.03, -0.08, 0.02], 'IZ': [0.0, -0.09, 0.01],
            'T3': [-0.08, 0.0, 0.0], 'T4': [0.08, 0.0, 0.0], 'T5': [-0.08, -0.03, 0.02], 'T6': [0.08, -0.03, 0.02],
            'FT7': [-0.08, 0.02, 0.01], 'FT8': [0.08, 0.02, 0.01], 'FT9': [-0.09, 0.01, 0.01], 'FT10': [0.09, 0.01, 0.01],
            'TP7': [-0.08, -0.02, 0.01], 'TP8': [0.08, -0.02, 0.01],
        }
        
        def clean_channel_name(ch_name):
            ch = str(ch_name).upper()
            ch = ch.replace("EEG ", "").replace("REF", "").replace(".", "").replace(" ", "").replace("-", "")
            ch = ch.replace("_", "").replace("CH", "").replace("CHANNEL", "")
            return ch
        
        # Ensure unique mapping
        channel_mapping = {}
        used_names = set()
        
        for ch in raw.ch_names:
            # Clean the channel name
            clean_ch = clean_channel_name(ch)
            
            # Find best match in electrode positions
            best_match = None
            
            # Direct match
            if clean_ch in electrode_positions and clean_ch not in used_names:
                best_match = clean_ch
            else:
                # Try partial matches (for differential montage)
                if '-' in ch:
                    # For differential, take first electrode
                    first_part = clean_channel_name(ch.split('-')[0])
                    if first_part in electrode_positions and first_part not in used_names:
                        best_match = first_part
                
                # Fuzzy matching
                if not best_match:
                    for standard_name in electrode_positions.keys():
                        if standard_name not in used_names:
                            if (clean_ch in standard_name or standard_name in clean_ch or
                                clean_ch.replace('Z', '') == standard_name.replace('Z', '')):
                                best_match = standard_name
                                break
            
            if best_match:
                channel_mapping[ch] = best_match
                used_names.add(best_match)
        
        logger.info(f"Channel mapping: {channel_mapping}")
        logger.info(f"Found {len(channel_mapping)} unique electrode matches")
        
        if len(channel_mapping) < 3:
            return jsonify({"error": f"Not enough mappable channels ({len(channel_mapping)} found)"}), 400
        
        # Pick only channels we can map
        channels_to_pick = list(channel_mapping.keys())
        raw_subset = raw.copy().pick(channels_to_pick)
        raw_subset.rename_channels(channel_mapping)
        
        # Get positions
        final_positions = {}
        for new_name in raw_subset.ch_names:
            if new_name in electrode_positions:
                final_positions[new_name] = electrode_positions[new_name]
        
        logger.info(f"Final channels with positions: {list(final_positions.keys())}")
        
        # Create montage and compute PSD (rest same as before)
        custom_montage = mne.channels.make_dig_montage(ch_pos=final_positions, coord_frame='head')
        raw_subset.set_montage(custom_montage)
        
        psd = raw_subset.compute_psd(method='welch', fmin=1, fmax=40, tmax=min(10.0, raw_subset.times[-1]), verbose=False)
        psds, freqs = psd.get_data(return_freqs=True)
        freq_idx = np.abs(freqs - freq).argmin()
        topo_data = psds[:, freq_idx]
        
        # Plot
        fig, ax = plt.subplots(figsize=(10, 8))
        im, _ = mne.viz.plot_topomap(topo_data, raw_subset.info, axes=ax, show=False, cmap="RdBu_r", contours=6, outlines='head', sphere='auto', image_interp='cubic')
        cbar = plt.colorbar(im, ax=ax, shrink=0.6, aspect=20)
        cbar.set_label('Power (µV²/Hz)', rotation=270, labelpad=20)
        ax.set_title(f'PSD Topography at {freq} Hz\n({len(final_positions)} electrodes)', fontsize=14, pad=20)
        
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=150)
        buf.seek(0)
        plt.close(fig)

        return send_file(buf, mimetype="image/png")

    except Exception as e:
        logger.exception("Topomap generation failed")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
