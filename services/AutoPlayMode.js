const ytdl = require('@distube/ytdl-core');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const QueueManager = require('../managers/QueueManager');
const VoiceManager = require('../managers/VoiceManager');
const Logger = require('../utils/Logger');
const fetch = require('node-fetch');
const config = require('../config.json');
const autoplayCache = require('../cache/autoplayCache');

module.exports = {
    async start(message, videoUrl) {
        try {
            const videoId = ytdl.getURLVideoID(videoUrl);

            // Ambil cache kalau ada
            let playlist = autoplayCache.get();
            if (!playlist || playlist.length === 0) {
                playlist = await this.getMixPlaylist(videoId);
                autoplayCache.set(playlist);
            }

            if (!playlist || playlist.length === 0) {
                return message.channel.send('❌ Gagal ambil Mix Playlist.');
            }

            const queueConstruct = QueueManager.getQueue(message.guild.id) || QueueManager.createQueue(message.guild.id, {
                voiceChannel: message.member.voice.channel,
                connection: null,
                player: null,
                songs: [],
                mode: 'autoplay',
                loop: false
            });

            // Masukkan semua lagu dari playlist ke queue
            queueConstruct.songs.push(...playlist.map(id => `https://www.youtube.com/watch?v=${id}`));

            // Kalau belum join VC, join sekarang
            if (!queueConstruct.connection) {
                const connection = VoiceManager.joinChannel(message.guild, message.member.voice.channel);
                if (!connection) {
                    QueueManager.clearQueue(message.guild.id);
                    return message.channel.send('❌ Gagal join voice channel.');
                }
                queueConstruct.connection = connection;

                const player = createAudioPlayer();
                queueConstruct.player = player;
                connection.subscribe(player);

                // Mulai play
                this.playNext(message.guild.id, message);
            } else if (queueConstruct.songs.length > 1) {
                message.channel.send(`🎶 Ditambahkan ke autoplay queue: ${playlist.length} lagu`);
            }

        } catch (err) {
            Logger.error(`AutoPlay Start Error: ${err.message}`);
            message.channel.send('❌ Gagal memulai AutoPlay Mode.');
        }
    },

    async getMixPlaylist(videoId) {
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
            Logger.error(`RapidAPI Mix Error: ${err.message}`);
            return [];
        }
    },

    async playNext(guildId, message) {
        const serverQueue = QueueManager.getQueue(guildId);
        if (!serverQueue || serverQueue.songs.length === 0) {
            Logger.info(`Autoplay queue empty for guild: ${guildId}`);
            VoiceManager.setDisconnectTimer(guildId);
            return;
        }

        try {
            const song = serverQueue.songs[0];
            const stream = ytdl(song, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });

            const resource = createAudioResource(stream, { inlineVolume: true });
            resource.volume.setVolume(0.3);
            serverQueue.player.play(resource);

            const info = await ytdl.getInfo(song);
            message.channel.send(`🎶 Sekarang Memutar: **${info.videoDetails.title}**`);

            serverQueue.player.once(AudioPlayerStatus.Idle, () => {
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            serverQueue.player.on('error', err => {
                Logger.error(`Autoplay Player Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            stream.on('error', err => {
                Logger.error(`Autoplay Stream Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

        } catch (err) {
            Logger.error(`Autoplay Play Error: ${err.message}`);
            if (serverQueue && !serverQueue.loop) serverQueue.songs.shift();
            this.playNext(guildId, message);
        }
    }
};
