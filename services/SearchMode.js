const ytdl = require('@distube/ytdl-core');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const QueueManager = require('../managers/QueueManager');
const VoiceManager = require('../managers/VoiceManager');
const Logger = require('../utils/Logger');
const YouTubeAPI = require('../utils/YouTubeAPI');

module.exports = {
    async start(message, query) {
        try {
            const videoUrl = await YouTubeAPI.searchVideo(query);
            if (!videoUrl) {
                return message.channel.send(`❌ Lagu "${query}" tidak ditemukan.`);
            }

            const queueConstruct = QueueManager.getQueue(message.guild.id) || QueueManager.createQueue(message.guild.id, {
                voiceChannel: message.member.voice.channel,
                connection: null,
                player: null,
                songs: [],
                mode: 'search',
                loop: false
            });

            // Tambah lagu ke queue
            queueConstruct.songs.push(videoUrl);

            // Jika bot belum join, join dulu
            if (!queueConstruct.connection) {
                const connection = VoiceManager.joinChannel(message.guild, message.member.voice.channel);
                if (!connection) {
                    QueueManager.clearQueue(message.guild.id);
                    return message.channel.send('❌ Gagal join voice channel.');
                }
                queueConstruct.connection = connection;

                // Buat player
                const player = createAudioPlayer();
                queueConstruct.player = player;
                connection.subscribe(player);

                // Mulai putar
                this.playNext(message.guild.id, message);
            } else if (queueConstruct.songs.length > 1) {
                message.channel.send(`🎶 Ditambahkan ke antrian: **${query}**`);
            }

        } catch (err) {
            Logger.error(`Search Mode Start Error: ${err.message}`);
            message.channel.send('❌ Gagal memulai Search Mode.');
        }
    },

    async playNext(guildId, message) {
        const serverQueue = QueueManager.getQueue(guildId);
        if (!serverQueue || serverQueue.songs.length === 0) {
            Logger.info(`Search queue empty for guild: ${guildId}`);
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

            // Ambil info video
            const info = await ytdl.getInfo(song);
            message.channel.send(`🎶 Sekarang Memutar: **${info.videoDetails.title}**`);

            // Event selesai lagu
            serverQueue.player.once(AudioPlayerStatus.Idle, () => {
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            // Error player
            serverQueue.player.on('error', err => {
                Logger.error(`Search Mode Player Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            // Error stream
            stream.on('error', err => {
                Logger.error(`Search Mode Stream Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

        } catch (err) {
            Logger.error(`Search Mode Play Error: ${err.message}`);
            const serverQueue = QueueManager.getQueue(guildId);
            if (serverQueue && !serverQueue.loop) serverQueue.songs.shift();
            this.playNext(guildId, message);
        }
    }
};
