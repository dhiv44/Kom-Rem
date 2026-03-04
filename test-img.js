async function test() {
  try {
    const url = 'https://warungkomikcdn.icu/kakarotto/KOMIKDEWASA.ART_Little-Miss-Delinquent-Chapter-0110.jpg';
    console.log("Fetching:", url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://komikremaja.art/'
      }
    });
    console.log("Status:", res.status, res.statusText);
    console.log("Content-Type:", res.headers.get('content-type'));
    
    // Test without referer
    const res2 = await fetch(url);
    console.log("Status without headers:", res2.status, res2.statusText);
  } catch (e) {
    console.error(e);
  }
}
test();
