// Cache untuk AutoPlay Mix agar hemat request API
let cache = {};

module.exports = {
    set(guildId, playlist) {
        cache[guildId] = {
            playlist,
            currentIndex: 0
        };
    },

    getNext(guildId) {
        if (!cache[guildId] || cache[guildId].currentIndex >= cache[guildId].playlist.length) {
            return null;
        }
        const nextSong = cache[guildId].playlist[cache[guildId].currentIndex];
        cache[guildId].currentIndex++;
        return nextSong;
    },

    has(guildId) {
        return !!cache[guildId];
    },

    clear(guildId) {
        delete cache[guildId];
    },

    getAll(guildId) {
        return cache[guildId] ? cache[guildId].playlist : [];
    },

    skipTo(guildId, index) {
        if (!cache[guildId] || index < 0 || index >= cache[guildId].playlist.length) return null;
        cache[guildId].currentIndex = index;
        return cache[guildId].playlist[index];
    }
};
