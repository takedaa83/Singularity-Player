"use strict";
async function testProxy() {
    const instance = 'https://inv.thepixora.com';
    const videoId = 'M2CZaOwOeQo';
    const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats`;
    try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        if (data.adaptiveFormats && data.adaptiveFormats.length > 0) {
            const audioStreams = data.adaptiveFormats.filter((s) => s.type && s.type.startsWith('audio/'));
            const directUrl = audioStreams[0].url;
            console.log("Direct URL:", directUrl.substring(0, 100) + "...");
            const directUrlObj = new URL(directUrl);
            const instanceUrlObj = new URL(instance);
            directUrlObj.host = instanceUrlObj.host;
            directUrlObj.protocol = instanceUrlObj.protocol;
            const proxiedUrl = directUrlObj.toString();
            console.log("Proxied URL:", proxiedUrl.substring(0, 100) + "...");
            console.log("Fetching range from proxied URL...");
            const rangeRes = await fetch(proxiedUrl, {
                headers: {
                    "Range": "bytes=0-100"
                }
            });
            console.log("Status:", rangeRes.status);
            console.log("Headers:", JSON.stringify(Object.fromEntries(rangeRes.headers.entries()), null, 2));
        }
    }
    catch (err) {
        console.error("Proxy test failed:", err.message);
    }
}
testProxy().catch(console.error);
