const ytdl = require('@distube/ytdl-core');
const ytpl = require('ytpl');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const QueueManager = require('../managers/QueueManager');
const VoiceManager = require('../managers/VoiceManager');
const Logger = require('../utils/Logger');
const config = require('../config.json');

module.exports = {
    async start(message, playlistUrl) {
        try {
            // Ambil daftar lagu dari playlist
            const playlist = await ytpl(playlistUrl || config.defaultPlaylist, { limit: 100 });
            const songList = playlist.items.map(item => ({
            title: item.title,
            url: item.shortUrl
            }));

            if (!songList.length) {
                return message.channel.send('📭 Playlist kosong atau tidak ditemukan.');
            }

            // Buat queue baru atau ambil queue existing
            const queueConstruct = QueueManager.createQueue(message.guild.id, {
                voiceChannel: message.member.voice.channel,
                connection: null,
                player: null,
                songs: [...songList],
                mode: 'static',
                loop: false
            });

            // Join voice
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

            // Mulai mainkan lagu pertama
            this.playNext(message.guild.id, message);

        } catch (err) {
            Logger.error(`Static Mode Start Error: ${err.stack}`);
            message.channel.send('❌ Gagal memulai Static Mode.');
        }
    },

    async playNext(guildId, message) {
        const serverQueue = QueueManager.getQueue(guildId);
        if (!serverQueue || serverQueue.songs.length === 0) {
            Logger.info(`Static queue empty for guild: ${guildId}`);
            VoiceManager.setDisconnectTimer(guildId);
            return;
        }

        try {
            const song = serverQueue.songs[0];

            // Stream YouTube audio
            const stream = ytdl(song.url, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });

            const resource = createAudioResource(stream, { inlineVolume: true });
            resource.volume.setVolume(0.3);
            serverQueue.player.play(resource);

            // Ambil info video
            message.channel.send({content:`🎶 Sekarang Memutar: **${song.title}**`, allowedMentions: { parse: [] }});

            // Bersihkan event lama biar tidak double trigger
            serverQueue.player.removeAllListeners(AudioPlayerStatus.Idle);
            serverQueue.player.removeAllListeners('error');

            // Event selesai lagu
            serverQueue.player.on(AudioPlayerStatus.Idle, () => {
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            // Error player
            serverQueue.player.on('error', err => {
                Logger.error(`Static Mode Player Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

            // Error stream
            stream.on('error', err => {
                Logger.error(`Static Mode Stream Error: ${err.message}`);
                if (!serverQueue.loop) serverQueue.songs.shift();
                this.playNext(guildId, message);
            });

        } catch (err) {
            Logger.error(`Static Mode Play Error: ${err.message}`);
            if (serverQueue && !serverQueue.loop) serverQueue.songs.shift();
            this.playNext(guildId, message);
        }
    }
};
