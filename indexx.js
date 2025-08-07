const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const ytpl = require('ytpl');
const fetch = require('node-fetch');
const queue = require('./queue');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`🎧 Bot online sebagai ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(config.prefix) || message.author.bot) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const serverQueue = queue.get(message.guild.id);

    // === PLAY ===
    if (command === 'play') {
        if (!message.member.voice.channel) return message.reply('🔊 Join voice channel dulu!');
        const songArg = args.join(' ');

        // Dynamic Mix Mode → jika URL adalah video
        if (play.yt_validate(songArg) === 'video') {
            return startDynamicMixMode(message, songArg);
        }

        // Static Mode → Playlist default atau playlist custom
        let songList = [];
        if (songArg.includes('list=')) {
            const playlist = await ytpl(songArg, { limit: 100 });
            songList = playlist.items.map(item => item.shortUrl);
        } else if (!songArg) {
            const playlist = await ytpl(config.defaultPlaylist, { limit: 100 });
            songList = playlist.items.map(item => item.shortUrl);
        } else {
            return message.channel.send('❌ URL tidak valid atau tidak ada input.');
        }

        if (!serverQueue) {
            const queueContruct = {
                voiceChannel: message.member.voice.channel,
                connection: null,
                player: null,
                songs: [],
                playing: true,
                loop: false,
                mode: 'static',
                currentVideo: null
            };

            queue.set(message.guild.id, queueContruct);
            queueContruct.songs.push(...songList);

            try {
                const connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator
                });

                queueContruct.connection = connection;
                queueContruct.player = createAudioPlayer();
                connection.subscribe(queueContruct.player);

                playStaticSong(message.guild, queueContruct.songs[0], message);

            } catch (err) {
                console.error(err);
                queue.delete(message.guild.id);
                return message.channel.send('❌ Error saat join voice.');
            }
        } else {
            serverQueue.songs.push(...songList);
            return message.channel.send(`🎶 Ditambahkan ke antrian: ${songList.length} lagu`);
        }
    }

    // === SKIP ===
    if (command === 'skip') {
        if (!serverQueue) return message.reply('⛔ Tidak ada lagu.');
        serverQueue.player.stop();
        message.channel.send('⏭️ Lagu dilewati.');
    }

    // === STOP ===
    if (command === 'stop') {
        if (!serverQueue) return message.reply('⛔ Tidak ada lagu.');
        serverQueue.songs = [];
        serverQueue.player.stop();
        queue.delete(message.guild.id);
        message.channel.send('🛑 Pemutaran dihentikan.');
    }

    // === PAUSE ===
    if (command === 'pause') {
        if (!serverQueue) return;
        serverQueue.player.pause();
        message.channel.send('⏸️ Lagu dijeda.');
    }

    // === RESUME ===
    if (command === 'resume') {
        if (!serverQueue) return;
        serverQueue.player.unpause();
        message.channel.send('▶️ Lanjutkan lagu.');
    }

    // === QUEUE ===
    if (command === 'queue') {
        if (!serverQueue) return message.reply('Tidak ada antrian.');
        if (serverQueue.mode === 'static') {
            const nowPlaying = serverQueue.songs[0];
            const upcoming = serverQueue.songs.slice(1).map((s, i) => `${i + 1}. ${s}`).join('\n');
            message.channel.send(`🎵 **Now Playing:** ${nowPlaying}\n📜 **Queue:**\n${upcoming || 'Kosong'}`);
        } else {
            message.channel.send(`🎵 **Now Playing (Mix Mode):** ${serverQueue.currentVideo || 'Tidak ada'}`);
        }
    }

    // === LOOP ===
    if (command === 'loop') {
        if (!serverQueue) return;
        serverQueue.loop = !serverQueue.loop;
        message.channel.send(`🔁 Loop ${serverQueue.loop ? 'aktif' : 'nonaktif'}.`);
    }

    // === CLEAR ===
    if (command === 'clear') {
        if (!serverQueue) return;
        serverQueue.songs = [serverQueue.songs[0]];
        message.channel.send('🧹 Antrian dibersihkan.');
    }
});

// === STATIC PLAYLIST MODE ===
async function playStaticSong(guild, song, message) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        queue.delete(guild.id);
        return;
    }

    try {
        const stream = await play.stream(song);
        const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
        resource.volume.setVolume(0.3);
        serverQueue.player.play(resource);

        const videoInfo = await play.video_info(song);
        message.channel.send(`🎶 Sekarang Memutar: **${videoInfo.video_details.title}**`);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.loop) serverQueue.songs.shift();
            playStaticSong(guild, serverQueue.songs[0], message);
        });

        serverQueue.player.on('error', err => {
            console.error(`⚠️ Player error: ${err.message}`);
            if (!serverQueue.loop) serverQueue.songs.shift();
            playStaticSong(guild, serverQueue.songs[0], message);
        });

    } catch (err) {
        console.error(`❌ Gagal memutar lagu: ${err.message}`);
        if (!serverQueue.loop) serverQueue.songs.shift();
        playStaticSong(guild, serverQueue.songs[0], message);
    }
}

// === DYNAMIC MIX MODE ===
async function startDynamicMixMode(message, videoUrl) {
    const videoId = await play.get_video_basic_info(videoUrl).then(info => info.video_details.id);
    const mixList = await getMixPlaylist(videoId);

    if (!mixList || mixList.length === 0) {
        return message.channel.send('⚠️ Tidak bisa memuat Mix Playlist.');
    }

    const queueContruct = {
        voiceChannel: message.member.voice.channel,
        connection: null,
        player: null,
        songs: mixList,
        mixIndex: 0,
        playing: true,
        loop: false,
        mode: 'mix',
        currentVideo: null
    };

    queue.set(message.guild.id, queueContruct);

    const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
    });

    queueContruct.connection = connection;
    queueContruct.player = createAudioPlayer();
    connection.subscribe(queueContruct.player);

    playMixSong(message.guild, message);
}

async function playMixSong(guild, message) {
    const serverQueue = queue.get(guild.id);
    if (!serverQueue || serverQueue.mixIndex >= serverQueue.songs.length) {
        queue.delete(guild.id);
        return;
    }

    const songId = serverQueue.songs[serverQueue.mixIndex];
    const songUrl = `https://www.youtube.com/watch?v=${songId}`;
    serverQueue.currentVideo = songUrl;

    try {
        const stream = await play.stream(songUrl);
        const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
        resource.volume.setVolume(0.3);
        serverQueue.player.play(resource);

        const videoInfo = await play.video_info(songUrl);
        message.channel.send(`🎶 Sekarang AutoPlay: **${videoInfo.video_details.title}**`);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.loop) serverQueue.mixIndex++;
            playMixSong(guild, message);
        });

        serverQueue.player.on('error', err => {
            console.error(`⚠️ Player error (Mix Mode): ${err.message}`);
            if (!serverQueue.loop) serverQueue.mixIndex++;
            playMixSong(guild, message);
        });

    } catch (err) {
        console.error(`❌ Gagal memutar lagu (Mix Mode): ${err.message}`);
        if (!serverQueue.loop) serverQueue.mixIndex++;
        playMixSong(guild, message);
    }
}

// === RAPIDAPI GET MIX PLAYLIST ===
async function getMixPlaylist(videoId) {
    const playlistId = `RD${videoId}`;
    const url = `https://youtube-v31.p.rapidapi.com/playlistItems?playlistId=${playlistId}&part=snippet&maxResults=50`;

    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': config.rapidApiKey,
            'x-rapidapi-host': 'youtube-v31.p.rapidapi.com'
        }
    };

    try {
        const res = await fetch(url, options);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            return data.items.map(item => item.snippet.resourceId.videoId);
        }
        return [];
    } catch (err) {
        console.error(`❌ Gagal ambil Mix Playlist RapidAPI: ${err.message}`);
        return [];
    }
}

client.login(config.token);
