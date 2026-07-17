async function testInvidiousLocal() {
  const instance = 'https://inv.thepixora.com';
  const videoId = 'M2CZaOwOeQo';
  const apiUrl = `${instance}/api/v1/videos/${videoId}?local=true&fields=title,author,lengthSeconds,adaptiveFormats`;
  
  try {
    const res = await fetch(apiUrl);
    const data = await res.json() as any;
    if (data.adaptiveFormats && data.adaptiveFormats.length > 0) {
      const audioStreams = data.adaptiveFormats.filter((s: any) => s.type && s.type.startsWith('audio/'));
      console.log("Returned URL sample:", audioStreams[0].url.substring(0, 150) + "...");
      
      console.log("Fetching range from returned URL...");
      const rangeRes = await fetch(audioStreams[0].url, {
        headers: {
          "Range": "bytes=0-100"
        }
      });
      console.log("Status:", rangeRes.status);
      console.log("Headers:", JSON.stringify(Object.fromEntries(rangeRes.headers.entries()), null, 2));
    }
  } catch (err: any) {
    console.error("Invidious local test failed:", err.message);
  }
}

testInvidiousLocal().catch(console.error);
