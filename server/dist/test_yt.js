"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const youtubei_js_1 = __importDefault(require("youtubei.js"));
async function test() {
    try {
        console.log('Initializing Innertube client...');
        const yt = await youtubei_js_1.default.create();
        console.log('Searching for "Katchi Sera"...');
        const searchResults = await yt.music.search('Katchi Sera', { type: 'song' });
        const songs = searchResults.songs?.contents;
        if (!songs || songs.length === 0) {
            console.log('No songs found in search.');
            return;
        }
        const firstSong = songs[0];
        const videoId = firstSong.id;
        console.log(`Fetching related tracks for videoId: ${videoId}...`);
        try {
            const related = await yt.music.getRelated(videoId);
            console.log('music.getRelated success!');
            console.log('Contents type:', typeof related.contents);
            if (Array.isArray(related.contents)) {
                console.log(`Found ${related.contents.length} items in contents.`);
                related.contents.forEach((sec, idx) => {
                    console.log(`Item ${idx} keys:`, Object.keys(sec || {}));
                    console.log(`Item ${idx} type:`, sec.type);
                    if (sec.contents) {
                        console.log(`  Sub-contents count: ${sec.contents.length}`);
                        sec.contents.slice(0, 5).forEach((item, itemIdx) => {
                            console.log(`    [${itemIdx}] Type: ${item.type}, Title: ${item.title || item.name}, ID: ${item.id || item.videoId}, Artist: ${item.artists?.map((a) => a.name).join(', ') || item.author?.name || 'unknown'}`);
                        });
                    }
                });
            }
            else {
                console.log('related.contents preview:', JSON.stringify(related.contents, null, 2).slice(0, 1500));
            }
        }
        catch (e) {
            console.warn('music.getRelated failed:', e.message || e);
        }
    }
    catch (error) {
        console.error('Test failed:', error);
    }
}
test();
