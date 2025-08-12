const fetch = require("node-fetch");
const config = require("../config.json");
const Logger = require("./Logger");

module.exports = {
    async searchVideo(query) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${config.youtubeApiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
            }
            return null;
        } catch (err) {
            Logger.error(`YouTube Search Error: ${err.message}`);
            return null;
        }
    },

    async getRelated(videoId) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&relatedToVideoId=${videoId}&type=video&maxResults=1&key=${config.youtubeApiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
            }
            return null;
        } catch (err) {
            Logger.error(`YouTube Related Error: ${err.message}`);
            return null;
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
                return data.items.map(item => `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`);
            }
            return [];
        } catch (err) {
            Logger.error(`❌ Gagal ambil Mix Playlist RapidAPI: ${err.message}`);
            return [];
        }
    }
};
