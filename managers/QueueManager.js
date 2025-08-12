// managers/QueueManager.js
const Logger = require('../utils/Logger');

class QueueManager {
    constructor() {
        this.queues = new Map();
    }

    createQueue(guildId, initialData = {}) {
        if (!this.queues.has(guildId)) {
            const newQueue = {
                songs: [], // [{ title, url }]
                loop: false,
                playing: false,
                connection: null,
                player: null,
                voiceChannel: null,
                ...initialData
            };
            this.queues.set(guildId, newQueue);
            Logger.info(`Queue dibuat untuk guild: ${guildId}`);
        }
        return this.queues.get(guildId);
    }

    getQueue(guildId) {
        return this.queues.get(guildId) || null;
    }

    clearQueue(guildId) {
        if (this.queues.has(guildId)) {
            this.queues.delete(guildId);
            Logger.info(`Queue dihapus untuk guild: ${guildId}`);
        }
    }

    addSong(guildId, song) {
        const queue = this.getQueue(guildId);
        if (!queue) return;

        // song harus object { title, url }
        queue.songs.push(song);
        Logger.info(`Lagu ditambahkan ke queue [${guildId}]: ${song.title}`);
    }

    removeSong(guildId, index) {
        const queue = this.getQueue(guildId);
        if (queue && queue.songs[index]) {
            const removed = queue.songs.splice(index, 1);
            Logger.info(`Lagu dihapus dari queue [${guildId}]: ${removed[0].title}`);
        }
    }

    clearSongs(guildId) {
        const queue = this.getQueue(guildId);
        if (queue) {
            queue.songs = [];
            Logger.info(`Semua lagu dihapus dari queue [${guildId}]`);
        }
    }

    /**
     * Skip lagu
     * @param {string} guildId 
     * @param {number} [number] - Nomor lagu tujuan (1 = lagu sekarang, 2 = lagu berikutnya, dst.)
     * @returns {boolean} true jika sukses, false jika gagal
     */
    skip(guildId, number) {
        const queue = this.getQueue(guildId);
        if (!queue || queue.songs.length === 0) return false;

        if (!number) {
            queue.songs.shift(); // hapus lagu sekarang
            return true;
        }

        if (number < 1 || number > queue.songs.length) return false;

        queue.songs = queue.songs.slice(number - 1);
        return true;
    }
}

module.exports = new QueueManager();
