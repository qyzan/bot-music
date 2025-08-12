const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const QueueManager = require('./QueueManager');
const Logger = require('../utils/Logger');

const disconnectTimers = new Map();

module.exports = {
    joinChannel(guild, voiceChannel) {
        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator
            });
            Logger.info(`Joined voice channel: ${voiceChannel.name}`);
            return connection;
        } catch (err) {
            Logger.error(`Join Voice Error: ${err.message}`);
            return null;
        }
    },

    leaveChannel(guildId) {
        const connection = getVoiceConnection(guildId);
        if (connection) {
            connection.destroy();
            Logger.info(`Disconnected from voice in guild: ${guildId}`);
        }
        QueueManager.clearQueue(guildId);
        this.clearDisconnectTimer(guildId);
    },

    setDisconnectTimer(guildId) {
        this.clearDisconnectTimer(guildId);
        disconnectTimers.set(
            guildId,
            setTimeout(() => {
                Logger.info(`Auto-disconnect triggered for guild: ${guildId}`);
                this.leaveChannel(guildId);
            }, 60 * 5000) // 1 menit
        );
    },

    clearDisconnectTimer(guildId) {
        if (disconnectTimers.has(guildId)) {
            clearTimeout(disconnectTimers.get(guildId));
            disconnectTimers.delete(guildId);
        }
    }
};
