import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
];

const REFERERS = [
  'https://komikremaja.art/',
  'https://www.google.com/',
  'https://www.bing.com/',
  'https://yandex.com/',
  'https://duckduckgo.com/',
  'https://komikcast.vip/',
  'https://komikindo.tv/'
];

const getRandomElement = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  let filename = '';

  try {
    if (hasBlobToken) {
      // Create a safe filename from the URL
      const extMatch = url.match(/\.(jpg|jpeg|png|webp|avif|gif)/i);
      const ext = extMatch ? extMatch[0] : '.jpg';
      const safeName = Buffer.from(url).toString('base64url').substring(0, 150);
      filename = `komik/${safeName}${ext}`;

      // Check if it already exists in Vercel Blob
      const { blobs } = await list({ prefix: filename, limit: 1 });
      if (blobs.length > 0) {
        // Redirect to the existing blob URL
        return NextResponse.redirect(blobs[0].url);
      }
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomElement(USER_AGENTS),
        'Referer': getRandomElement(REFERERS),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    if (hasBlobToken) {
      // Upload to Vercel Blob
      const blob = await put(filename, arrayBuffer, {
        access: 'public',
        contentType: contentType,
      });
      // Redirect to the new blob URL
      return NextResponse.redirect(blob.url);
    }

    // Fallback: return the image directly if no blob token
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
