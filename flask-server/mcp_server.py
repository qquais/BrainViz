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

@app.route("/debug-channels", methods=["POST"])
def debug_channels():
    try:
        edf_file = request.files.get('file')
        if not edf_file:
            return jsonify({"error": "No file uploaded"}), 400

        raw = load_edf_from_file(edf_file)
        
        channel_info = []
        for i, ch in enumerate(raw.ch_names):
            clean_ch = ch.replace(".", "").replace(" ", "").replace("-", "").upper()
            channel_info.append({
                "original": ch,
                "cleaned": clean_ch,
                "type": raw.get_channel_types()[i] if i < len(raw.get_channel_types()) else "unknown"
            })
        
        # Try montage setup and see what happens
        raw_copy = raw.copy()
        try:
            raw_copy.set_montage("standard_1020", on_missing="warn")
            montage_success = True
            
            # Fix NaN issue by filtering out invalid positions
            positions_3d = []
            positions_2d = []
            for ch in raw_copy.info['chs']:
                pos_3d = ch['loc'][:3].tolist()
                pos_2d = ch['loc'][:2].tolist()
                
                # Replace NaN with 0
                pos_3d = [0.0 if np.isnan(x) else float(x) for x in pos_3d]
                pos_2d = [0.0 if np.isnan(x) else float(x) for x in pos_2d]
                
                positions_3d.append(pos_3d)
                positions_2d.append(pos_2d)
            
            # Check for duplicates
            duplicates = []
            for i, pos in enumerate(positions_2d):
                for j, other_pos in enumerate(positions_2d[i+1:], i+1):
                    if np.allclose(pos, other_pos, atol=1e-3):
                        duplicates.append((raw_copy.ch_names[i], raw_copy.ch_names[j], pos))
                        
        except Exception as e:
            montage_success = False
            positions_3d = []
            positions_2d = []
            duplicates = []
            
        return jsonify({
            "channels": channel_info,
            "montage_success": montage_success,
            "positions_3d": positions_3d,
            "positions_2d": positions_2d,
            "duplicates": duplicates,
            "total_channels": len(raw.ch_names)
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/psd-topomap", methods=["POST"])
def psd_topomap():
    """Fixed implementation with 3D positions and better duplicate handling"""
    try:
        edf_file = request.files.get('file')
        freq = float(request.form.get("freq", 10))

        if not edf_file:
            return jsonify({"error": "No file uploaded"}), 400

        raw = load_edf_from_file(edf_file)
        
        # Map your actual channel names to standard names
        channel_mapping = {}
        for ch in raw.ch_names:
            clean_ch = ch.replace(".", "").replace(" ", "").replace("-", "").upper()
            # Your channels already look standard, so minimal cleaning
            channel_mapping[ch] = clean_ch

        logger.info(f"Original channels: {raw.ch_names}")
        logger.info(f"Channel mapping: {channel_mapping}")

        # Pick and rename channels
        raw_subset = raw.copy()
        raw_subset.rename_channels(channel_mapping)
        
        # Create 3D positions for standard 10-20 electrodes (X, Y, Z coordinates)
        # These are approximate positions on a unit sphere
        standard_positions_3d = {
            'FP1': [-0.06, 0.08, 0.05], 'FP2': [0.06, 0.08, 0.05],
            'F7': [-0.08, 0.03, 0.02], 'F3': [-0.05, 0.05, 0.04], 
            'FZ': [0.0, 0.05, 0.06], 'F4': [0.05, 0.05, 0.04], 'F8': [0.08, 0.03, 0.02],
            'FC5': [-0.07, 0.02, 0.03], 'FC1': [-0.03, 0.02, 0.05], 'FC2': [0.03, 0.02, 0.05], 'FC6': [0.07, 0.02, 0.03],
            'T7': [-0.08, 0.0, 0.0], 'C3': [-0.05, 0.0, 0.04], 'CZ': [0.0, 0.0, 0.06], 
            'C4': [0.05, 0.0, 0.04], 'T8': [0.08, 0.0, 0.0],
            'CP5': [-0.07, -0.02, 0.03], 'CP1': [-0.03, -0.02, 0.05], 'CP2': [0.03, -0.02, 0.05], 'CP6': [0.07, -0.02, 0.03],
            'P7': [-0.08, -0.03, 0.02], 'P3': [-0.05, -0.05, 0.04], 'PZ': [0.0, -0.05, 0.06], 
            'P4': [0.05, -0.05, 0.04], 'P8': [0.08, -0.03, 0.02],
            'O1': [-0.03, -0.08, 0.02], 'OZ': [0.0, -0.08, 0.04], 'O2': [0.03, -0.08, 0.02],
            
            # Add some common variants
            'FCZ': [0.0, 0.02, 0.06], 'CPZ': [0.0, -0.02, 0.06],
            'AFZ': [0.0, 0.07, 0.05], 'POZ': [0.0, -0.07, 0.05],
            'C1': [-0.025, 0.0, 0.05], 'C2': [0.025, 0.0, 0.05],
            'C5': [-0.07, 0.0, 0.02], 'C6': [0.07, 0.0, 0.02]
        }
        
        # Only use channels that we have positions for AND exist in the data
        final_channels = []
        final_positions = {}
        
        for ch in raw_subset.ch_names:
            if ch in standard_positions_3d:
                final_channels.append(ch)
                final_positions[ch] = standard_positions_3d[ch]
        
        logger.info(f"Final channels with positions: {final_channels}")
        
        if len(final_channels) < 4:
            return jsonify({"error": f"Not enough positionable channels (only {len(final_channels)} found)"}), 400
        
        # Pick final channels and set custom 3D montage
        raw_final = raw_subset.copy().pick(final_channels)
        
        # Create montage with 3D positions
        custom_montage = mne.channels.make_dig_montage(
            ch_pos=final_positions, 
            coord_frame='head'
        )
        raw_final.set_montage(custom_montage)
        
        # Compute PSD
        psd = raw_final.compute_psd(
            method='welch',
            fmin=1, 
            fmax=40, 
            tmax=10.0,
            verbose=False
        )
        psds, freqs = psd.get_data(return_freqs=True)
        
        # Get data for the target frequency
        freq_idx = np.abs(freqs - freq).argmin()
        topo_data = psds[:, freq_idx]
        
        logger.info(f"PSD shape: {psds.shape}, topo_data shape: {topo_data.shape}")
        
        # Plot with better error handling
        fig, ax = plt.subplots(figsize=(10, 8))
        
        try:
            im, _ = mne.viz.plot_topomap(
                topo_data,
                raw_final.info,
                axes=ax,
                show=False,
                cmap="RdBu_r",
                contours=6,
                outlines='head',
                sphere='auto',  # Let MNE auto-detect sphere
                image_interp='cubic'
            )
            
            # Add colorbar and title
            cbar = plt.colorbar(im, ax=ax, shrink=0.6, aspect=20)
            cbar.set_label('Power (µV²/Hz)', rotation=270, labelpad=20)
            ax.set_title(f'PSD Topography at {freq} Hz\n({len(final_channels)} channels)', 
                        fontsize=16, pad=20)
            
        except Exception as plot_error:
            logger.error(f"Topography plotting error: {plot_error}")
            plt.close(fig)
            return jsonify({"error": f"Plotting failed: {str(plot_error)}"}), 500
        
        # Save to buffer
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
