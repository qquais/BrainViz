from flask import Flask, request, jsonify
from flask_cors import CORS
import mne
import tempfile
import os

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



if __name__ == '__main__':
    app.run(debug=True, port=5000)
