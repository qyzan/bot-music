const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");

const QueueManager = require("./managers/QueueManager");
const StaticMode = require("./services/StaticMode");
const playSearch = require("./services/SearchMode");
const playAuto = require("./services/AutoPlayMode");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`🎧 Bot online sebagai ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(config.prefix) || message.author.bot) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ===== HELP =====
    if (command === "help") {
        return message.channel.send(`
🎵 **Panduan Penggunaan Bot Musik**
\`${config.prefix}play\` → Mainkan playlist default (Static Mode)
\`${config.prefix}play <link video YouTube>\` → AutoPlay mode (Mix)
\`${config.prefix}play <judul lagu>\` → Cari & mainkan lagu (Search Mode)
\`${config.prefix}skip\` → Lewati lagu
\`${config.prefix}clear\` → Kosongkan queue
\`${config.prefix}pause\` → Jeda lagu
\`${config.prefix}resume\` → Lanjutkan lagu
\`${config.prefix}queue\` → Lihat daftar antrian
\`${config.prefix}skip <nomor>\` → Lompat ke lagu di queue
\`${config.prefix}loop\` → Aktif/Nonaktifkan loop
        `);
    }

    // ===== PLAY =====
    if (command === "play") {
        const input = args.join(" ");
        if (!input) {
            await StaticMode.start(message, config.defaultPlaylist); // Static Mode
        } else if (/^(https?:\/\/)/.test(input)) {
            await playAuto.start(message, input); // AutoPlay mode
        } else {
            await playSearch.start(message, input); // Search mode
        }
    }

    // ===== QUEUE =====
    if (command === "queue") {
        const serverQueue = QueueManager.getQueue(message.guild.id);
        if (!serverQueue) return message.channel.send("📭 Queue kosong.");

        const queueLines = serverQueue.songs.map((s, i) => `${i + 1}. ${s.title}`);
        const chunkSize = 20; // biar gak lebih dari 2000 char
        for (let i = 0; i < queueLines.length; i += chunkSize) {
            const chunk = queueLines.slice(i, i + chunkSize).join("\n");
            await message.channel.send(`📜 **Queue:**\n${chunk}`);
        }
    }


    // ===== SKIP =====
    if (command === "skip") {
        const serverQueue = QueueManager.getQueue(message.guild.id);
        if (!serverQueue) return message.channel.send("❌ Tidak ada lagu yang sedang diputar.");

        if (!args[0]) {
            serverQueue.songs.shift();
            serverQueue.player.stop();
            return message.channel.send(`⏭ Lagu dilewati.`);
        }

        const skipTo = parseInt(args[0]);
        if (isNaN(skipTo) || skipTo < 1 || skipTo > serverQueue.songs.length) {
            return message.channel.send("⚠️ Masukkan nomor lagu yang valid dari queue.");
        }

        serverQueue.songs = serverQueue.songs.slice(skipTo - 1);
        serverQueue.player.stop();
        message.channel.send(`⏭ Skip ke lagu nomor **${skipTo}**: **${serverQueue.songs[0].title}**`);
    }

    // ===== STOP =====
    if (command === "clear") {
        QueueManager.clearQueue(message.guild.id);
        message.channel.send("⏹ Queue dikosongkan.");
        // Disconnect dari voice channel kalau perlu
    }

    // ===== LOOP =====
    if (command === "loop") {
        const loopState = QueueManager.toggleLoop(message.guild.id);
        message.channel.send(loopState ? "🔁 Loop diaktifkan." : "🚫 Loop dimatikan.");
    }

    // ===== LEAVE ====
    if (command === "leave") {
    const serverQueue = QueueManager.getQueue(message.guild.id);

    if (!message.member.voice.channel) {
        return message.channel.send("❌ Kamu harus berada di voice channel untuk memerintah bot keluar.");
    }

    if (!serverQueue || !serverQueue.connection) {
        return message.channel.send("⚠️ Bot tidak sedang berada di voice channel.");
    }

    // Hentikan player
    if (serverQueue.player) {
        serverQueue.player.stop();
    }

    // Disconnect bot
    serverQueue.connection.destroy();

    // Hapus queue dari manager
    QueueManager.clearQueue(message.guild.id);

    message.channel.send("👋 Bot telah keluar dari voice channel.");
    }
});

client.login(config.token);
