/**
 * Simple EDF Decoder - Fallback Implementation
 * Save this as libs/edf-simple.js in your extension
 */

class SimpleEDFDecoder {
  constructor() {
    this.header = null;
    this.signals = [];
  }

  decode(arrayBuffer) {
    console.log('🔧 SimpleEDFDecoder: Starting decode...');
    
    try {
      const view = new DataView(arrayBuffer);
      const decoder = new TextDecoder('ascii', { fatal: false });
      
      // Parse EDF header (first 256 bytes)
      this.header = this.parseHeader(view, decoder);
      console.log('📄 Header parsed:', this.header);
      
      // Parse signal data
      this.parseSignals(view, arrayBuffer);
      console.log('📊 Signals parsed:', this.signals.length);
      
      return this.createEDFObject();
      
    } catch (error) {
      console.error('❌ SimpleEDFDecoder failed:', error);
      throw error;
    }
  }

  parseHeader(view, decoder) {
    const header = {
      version: decoder.decode(view.buffer.slice(0, 8)).trim(),
      patient: decoder.decode(view.buffer.slice(8, 88)).trim(),
      recording: decoder.decode(view.buffer.slice(88, 168)).trim(),
      startDate: decoder.decode(view.buffer.slice(168, 176)).trim(),
      startTime: decoder.decode(view.buffer.slice(176, 184)).trim(),
      headerBytes: parseInt(decoder.decode(view.buffer.slice(184, 192)).trim()),
      dataFormat: decoder.decode(view.buffer.slice(192, 236)).trim(),
      numRecords: parseInt(decoder.decode(view.buffer.slice(236, 244)).trim()),
      recordDuration: parseFloat(decoder.decode(view.buffer.slice(244, 252)).trim()),
      numSignals: parseInt(decoder.decode(view.buffer.slice(252, 256)).trim())
    };

    console.log('📋 EDF Header:', {
      signals: header.numSignals,
      records: header.numRecords,
      duration: header.recordDuration
    });

    return header;
  }

  parseSignals(view, arrayBuffer) {
    const numSignals = this.header.numSignals;
    const headerBytes = this.header.headerBytes;
    
    // Signal information starts at byte 256
    const signalInfoStart = 256;
    
    // Each signal has 16-byte fields for each attribute
    const fieldSize = 16;
    
    for (let i = 0; i < numSignals; i++) {
      const signal = {
        label: this.readField(arrayBuffer, signalInfoStart + i * fieldSize, fieldSize).trim(),
        transducerType: this.readField(arrayBuffer, signalInfoStart + (numSignals + i) * fieldSize, fieldSize).trim(),
        physicalUnit: this.readField(arrayBuffer, signalInfoStart + (2 * numSignals + i) * fieldSize, fieldSize).trim(),
        physicalMin: parseFloat(this.readField(arrayBuffer, signalInfoStart + (3 * numSignals + i) * fieldSize, fieldSize).trim()),
        physicalMax: parseFloat(this.readField(arrayBuffer, signalInfoStart + (4 * numSignals + i) * fieldSize, fieldSize).trim()),
        digitalMin: parseInt(this.readField(arrayBuffer, signalInfoStart + (5 * numSignals + i) * fieldSize, fieldSize).trim()),
        digitalMax: parseInt(this.readField(arrayBuffer, signalInfoStart + (6 * numSignals + i) * fieldSize, fieldSize).trim()),
        filtering: this.readField(arrayBuffer, signalInfoStart + (7 * numSignals + i) * fieldSize, fieldSize).trim(),
        samplesPerRecord: parseInt(this.readField(arrayBuffer, signalInfoStart + (8 * numSignals + i) * fieldSize, fieldSize).trim()),
        data: []
      };

      // Calculate sampling frequency
      signal.samplingFrequency = signal.samplesPerRecord / this.header.recordDuration;
      
      console.log(`📊 Signal ${i}:`, {
        label: signal.label,
        unit: signal.physicalUnit,
        samplingFreq: signal.samplingFrequency,
        samplesPerRecord: signal.samplesPerRecord
      });

      this.signals.push(signal);
    }

    // Extract signal data
    this.extractSignalData(arrayBuffer, headerBytes);
  }

  readField(arrayBuffer, start, length) {
    const decoder = new TextDecoder('ascii', { fatal: false });
    return decoder.decode(arrayBuffer.slice(start, start + length));
  }

  extractSignalData(arrayBuffer, headerBytes) {
    const numRecords = this.header.numRecords;
    const recordDuration = this.header.recordDuration;
    
    // Calculate total samples per record
    const totalSamplesPerRecord = this.signals.reduce((sum, signal) => sum + signal.samplesPerRecord, 0);
    const bytesPerRecord = totalSamplesPerRecord * 2; // 2 bytes per sample (16-bit)
    
    console.log('📊 Data extraction:', {
      numRecords,
      totalSamplesPerRecord,
      bytesPerRecord
    });

    let dataOffset = headerBytes;
    
    // Limit to first few records for performance
    const maxRecords = Math.min(numRecords, 10);
    
    for (let record = 0; record < maxRecords; record++) {
      let sampleOffset = 0;
      
      for (let signalIndex = 0; signalIndex < this.signals.length; signalIndex++) {
        const signal = this.signals[signalIndex];
        const samplesInThisRecord = signal.samplesPerRecord;
        
        // Extract samples for this signal in this record
        for (let sample = 0; sample < samplesInThisRecord; sample++) {
          const byteIndex = dataOffset + (sampleOffset + sample) * 2;
          
          if (byteIndex + 1 < arrayBuffer.byteLength) {
            const view = new DataView(arrayBuffer);
            const digitalValue = view.getInt16(byteIndex, true); // little-endian
            
            // Convert digital to physical value
            const physicalValue = this.digitalToPhysical(digitalValue, signal);
            signal.data.push(physicalValue);
          }
        }
        
        sampleOffset += samplesInThisRecord;
      }
      
      dataOffset += bytesPerRecord;
    }

    console.log('✅ Signal data extracted');
  }

  digitalToPhysical(digitalValue, signal) {
    const digitalRange = signal.digitalMax - signal.digitalMin;
    const physicalRange = signal.physicalMax - signal.physicalMin;
    
    if (digitalRange === 0) return digitalValue;
    
    return signal.physicalMin + (digitalValue - signal.digitalMin) * (physicalRange / digitalRange);
  }

  createEDFObject() {
    // Create an object that mimics the main EDF decoder interface
    const edfData = {
      getNumberOfSignals: () => this.signals.length,
      getNumberOfRecords: () => this.header.numRecords,
      getSignalLabel: (index) => this.signals[index]?.label || `Signal ${index}`,
      getSignalSamplingFrequency: (index) => this.signals[index]?.samplingFrequency || 256,
      getSignalPhysicalUnit: (index) => this.signals[index]?.physicalUnit || 'µV',
      getPhysicalSignalConcatRecords: (signalIndex, startRecord, numRecords) => {
        const signal = this.signals[signalIndex];
        if (!signal) return [];
        
        // Return available data (already limited to first few records)
        return signal.data.slice(0, Math.min(signal.data.length, 2500));
      }
    };

    return edfData;
  }
}

// Make available globally
window.SimpleEDFDecoder = SimpleEDFDecoder;
console.log('✅ SimpleEDFDecoder loaded');