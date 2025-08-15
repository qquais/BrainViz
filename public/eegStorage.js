/**
 * EEG Storage Manager
 * Handles large file storage using IndexedDB
 */

class EEGStorage {
  constructor() {
    this.dbName = "EEGReaderDB";
    this.version = 1;
    this.storeName = "eegFiles";
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      console.log("Opening IndexedDB...");
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error("IndexedDB open failed:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log("IndexedDB opened successfully");
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        console.log("Creating/upgrading IndexedDB schema...");
        const db = event.target.result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          console.log("Created eegFiles object store");
        }
      };
    });
  }

  async storeEDFFile(arrayBuffer, filename = "uploaded.edf") {
    try {
      console.log(
        "Storing EDF file in IndexedDB:",
        filename,
        arrayBuffer.byteLength,
        "bytes"
      );

      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore("eegFiles");

      const fileData = {
        id: "current_edf",
        data: arrayBuffer,
        filename: filename,
        timestamp: Date.now(),
        type: "edf",
        size: arrayBuffer.byteLength,
      };

      await new Promise((resolve, reject) => {
        const request = store.put(fileData);
        request.onsuccess = () => {
          console.log("EDF file stored successfully");
          resolve();
        };
        request.onerror = () => {
          console.error("Failed to store EDF file:", request.error);
          reject(request.error);
        };
      });

      db.close();
    } catch (error) {
      console.error("Error storing EDF file:", error);
      throw error;
    }
  }

  async getEDFFile() {
    try {
      console.log("Retrieving EDF file from IndexedDB...");

      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore("eegFiles");

      const result = await new Promise((resolve, reject) => {
        const request = store.get("current_edf");
        request.onsuccess = () => {
          if (request.result) {
            console.log(
              "EDF file retrieved:",
              request.result.filename,
              request.result.size,
              "bytes"
            );
          } else {
            console.log("No EDF file found in IndexedDB");
          }
          resolve(request.result);
        };
        request.onerror = () => {
          console.error("Failed to retrieve EDF file:", request.error);
          reject(request.error);
        };
      });

      db.close();
      return result;
    } catch (error) {
      console.error("Error retrieving EDF file:", error);
      return null;
    }
  }

  async storeTextFile(textData, filename = "uploaded.txt") {
    try {
      console.log(
        "Storing text file:",
        filename,
        textData.length,
        "characters"
      );

      if (textData.length < 5000000) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set(
            {
              eegDataText: textData,
              eegDataType: "text",
              eegDataSource: "chrome_storage",
            },
            () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                console.log("Text file stored in Chrome storage");
                resolve();
              }
            }
          );
        });
      } else {
        // Large text files go to IndexedDB
        const db = await this.openDB();
        const transaction = db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore("eegFiles");

        const fileData = {
          id: "current_text",
          data: textData,
          filename: filename,
          timestamp: Date.now(),
          type: "text",
          size: textData.length,
        };

        await new Promise((resolve, reject) => {
          const request = store.put(fileData);
          request.onsuccess = () => {
            console.log("Large text file stored in IndexedDB");
            resolve();
          };
          request.onerror = () => reject(request.error);
        });

        db.close();
      }
    } catch (error) {
      console.error("Error storing text file:", error);
      throw error;
    }
  }

  async clearAllData() {
    try {
      console.log("Clearing all EEG data...");

      // Clear Chrome storage
      await new Promise((resolve) => {
        chrome.storage.local.remove(
          [
            "eegDataText",
            "eegDataBuffer",
            "eegDataType",
            "eegDataSource",
            "eegFileName",
          ],
          resolve
        );
      });

      // Clear IndexedDB
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore("eegFiles");

      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => {
          console.log("All data cleared successfully");
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      db.close();
    } catch (error) {
      console.error("Error clearing data:", error);
      throw error;
    }
  }

  async getStorageInfo() {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore("eegFiles");

      const files = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      db.close();

      const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

      return {
        fileCount: files.length,
        totalSize: totalSize,
        files: files.map((f) => ({
          id: f.id,
          filename: f.filename,
          size: f.size,
          type: f.type,
        })),
      };
    } catch (error) {
      console.error("Error getting storage info:", error);
      return { fileCount: 0, totalSize: 0, files: [] };
    }
  }
}

// Making EEGStorage available globally
if (typeof window !== "undefined") {
  window.EEGStorage = EEGStorage;
}
