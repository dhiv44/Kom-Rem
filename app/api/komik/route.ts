import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const serverCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'update';
  const targetUrlParam = searchParams.get('url');
  const debug = searchParams.get('debug');
  const token = process.env.SCRAPE_DO_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: 'SCRAPE_DO_TOKEN is not set in environment variables. Please configure it in the Secrets panel.' },
      { status: 500 }
    );
  }

  let targetUrl = 'https://komikremaja.art/komik/?order=update';
  if (type === 'list') {
    targetUrl = 'https://komikremaja.art/komik/list-mode';
  } else if (type === 'detail' || type === 'chapter') {
    if (!targetUrlParam) {
      return NextResponse.json({ error: 'URL parameter is required for detail and chapter types' }, { status: 400 });
    }
    targetUrl = targetUrlParam;
  }

  const cacheKey = `${type}-${targetUrl}-${debug || 'false'}`;
  const cached = serverCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const scrapeUrl = `http://api.scrape.do/?token=${token}&url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(scrapeUrl);
    if (!response.ok) {
      throw new Error(`Scrape.do failed with status ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    if (type === 'detail') {
      const title = $('.infox h1').text().trim() || $('h1.entry-title').text().trim() || $('.ts-breadcrumb li:last-child span').text().trim();
      const image = $('.thumb img').attr('src') || $('.imgholder img').attr('src') || $('.seriestucontl img').attr('src');
      const synopsis = $('.entry-content').text().trim() || $('.desc').text().trim() || $('.summary').text().trim();
      
      const chapters: any[] = [];
      $('#chapterlist li').each((i, el) => {
        const chapTitle = $(el).find('.chapternum').text().trim() || $(el).find('.lchx a').text().trim() || $(el).find('a').text().trim();
        const chapLink = $(el).find('a').attr('href');
        const chapDate = $(el).find('.chapterdate').text().trim();
        if (chapTitle && chapLink) {
          chapters.push({ title: chapTitle, link: chapLink, date: chapDate });
        }
      });

      if (chapters.length === 0) {
        $('.clstyle li').each((i, el) => {
          const chapTitle = $(el).find('.chapternum').text().trim() || $(el).find('a').text().trim();
          const chapLink = $(el).find('a').attr('href');
          const chapDate = $(el).find('.chapterdate').text().trim();
          if (chapTitle && chapLink) {
            chapters.push({ title: chapTitle, link: chapLink, date: chapDate });
          }
        });
      }

      if (chapters.length === 0) {
        $('.eplister li').each((i, el) => {
          const chapTitle = $(el).find('.epl-num').text().trim() || $(el).find('.epl-title').text().trim() || $(el).find('a').text().trim();
          const chapLink = $(el).find('a').attr('href');
          const chapDate = $(el).find('.epl-date').text().trim();
          if (chapTitle && chapLink) {
            chapters.push({ title: chapTitle, link: chapLink, date: chapDate });
          }
        });
      }

      const result = { title, image, synopsis, chapters };
      serverCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    if (type === 'chapter') {
      const title = $('h1.entry-title').text().trim() || $('.entry-title').text().trim() || $('.ts-breadcrumb li:last-child span').text().trim();
      const images: string[] = [];
      let pdfUrl: string | null = null;

      // 1. Check for iframe with .pdf or google drive preview
      $('iframe').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src) {
          if (src.toLowerCase().includes('.pdf') || src.includes('drive.google.com/file/d/') || src.includes('pdfjs')) {
            pdfUrl = src;
          }
        }
      });

      // 2. Check for embed tag
      if (!pdfUrl) {
        $('embed[type="application/pdf"]').each((i, el) => {
          const src = $(el).attr('src');
          if (src) pdfUrl = src;
        });
      }

      // 3. Check for PDF Embedder plugin
      if (!pdfUrl) {
        $('.pdfemb-viewer').each((i, el) => {
          const src = $(el).attr('data-pdf-url');
          if (src) pdfUrl = src;
        });
      }

      // 4. Check for direct links to PDF
      if (!pdfUrl) {
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.toLowerCase().endsWith('.pdf')) {
            pdfUrl = href;
          }
        });
      }

      // 5. Check for object tag
      if (!pdfUrl) {
        $('object[type="application/pdf"]').each((i, el) => {
          const data = $(el).attr('data');
          if (data) pdfUrl = data;
        });
      }
      
      $('#readerarea img').each((i, el) => {
        const $img = $(el);
        const possibleAttrs = [
          'data-litespeed-src',
          'data-src', 
          'data-lazy-src', 
          'data-cfsrc', 
          'data-wpfc-original-src', 
          'data-original', 
          'data-altsrc', 
          'src'
        ];
        
        let imageUrl = null;
        for (const attr of possibleAttrs) {
          const val = $img.attr(attr);
          if (val && 
              !val.includes('readerarea.svg') && 
              !val.includes('data:image') && 
              !val.includes('placeholder')) {
            imageUrl = val;
            break; // Found the real image URL
          }
        }
        
        if (imageUrl) {
          images.push(imageUrl);
        }
      });

      // Fallback 1: Check inside <noscript> tags (common for lazy loaders like LiteSpeed)
      if (images.length === 0) {
        $('#readerarea noscript').each((i, el) => {
          const noscriptHtml = $(el).html();
          if (noscriptHtml) {
            // Extract src from img tag inside noscript
            const match = noscriptHtml.match(/src=["']([^"']+)["']/);
            if (match && match[1] && !match[1].includes('readerarea.svg')) {
              images.push(match[1]);
            }
          }
        });
      }
      
      // Fallback 2: if #readerarea img doesn't work, try .reading-content
      if (images.length === 0) {
        $('.reading-content img').each((i, el) => {
          const $img = $(el);
          const possibleAttrs = [
            'data-litespeed-src',
            'data-src', 
            'data-lazy-src', 
            'data-cfsrc', 
            'data-wpfc-original-src', 
            'data-original', 
            'src'
          ];
          
          let imageUrl = null;
          for (const attr of possibleAttrs) {
            const val = $img.attr(attr);
            if (val && !val.includes('readerarea.svg') && !val.includes('data:image') && !val.includes('placeholder')) {
              imageUrl = val;
              break;
            }
          }
          
          if (imageUrl) {
            images.push(imageUrl);
          }
        });
      }

      // Fallback 3: Extract from scripts (ts_reader or generic arrays)
      if (images.length === 0) {
        $('script').each((i, el) => {
          const scriptContent = $(el).html();
          if (scriptContent && (scriptContent.includes('ts_reader') || scriptContent.includes('images'))) {
            // Try exact ts_reader parsing first
            try {
              const match = scriptContent.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
              if (match && match[1]) {
                const jsonStr = match[1].replace(/!0/g, 'true').replace(/!1/g, 'false');
                const data = JSON.parse(jsonStr);
                if (data.sources && data.sources.length > 0 && data.sources[0].images) {
                  data.sources[0].images.forEach((img: string) => {
                    if (img && !img.includes('readerarea.svg') && !img.includes('data:image')) {
                      images.push(img);
                    }
                  });
                }
              }
            } catch (e) {
              // Ignore parse errors
            }

            // If still no images, use regex to find all image URLs in the script
            if (images.length === 0) {
              const urlRegex = /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi;
              let match;
              const scriptImages = [];
              while ((match = urlRegex.exec(scriptContent)) !== null) {
                const url = match[1].replace(/\\/g, ''); // Remove escape characters if any
                if (!url.includes('readerarea.svg') && !url.includes('avatar') && !url.includes('logo')) {
                  scriptImages.push(url);
                }
              }
              // If we found a reasonable number of images, assume they are the chapter pages
              if (scriptImages.length > 2) {
                images.push(...scriptImages);
              }
            }
          }
        });
      }

      // Fallback 4: Ultimate fallback, extract all images from the raw HTML that look like chapter pages
      if (images.length === 0) {
        // Look for any image URL that might be a chapter page (usually numbered or in a specific path)
        const urlRegex = /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi;
        let match;
        const allImages = new Set<string>();
        while ((match = urlRegex.exec(html)) !== null) {
          const url = match[1].replace(/\\/g, '');
          if (!url.includes('readerarea.svg') && 
              !url.includes('avatar') && 
              !url.includes('logo') && 
              !url.includes('thumb') &&
              !url.toLowerCase().includes('banner') &&
              !url.toLowerCase().includes('icon')) {
            allImages.add(url);
          }
        }
        
        // Filter heuristics: chapter images usually share a common path prefix
        const imgArray = Array.from(allImages);
        if (imgArray.length > 2) {
          // Try to find the most common directory path
          const pathCounts: Record<string, number> = {};
          imgArray.forEach(url => {
            try {
              const urlObj = new URL(url);
              const dirPath = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/'));
              pathCounts[dirPath] = (pathCounts[dirPath] || 0) + 1;
            } catch (e) {}
          });
          
          let mostCommonPath = '';
          let maxCount = 0;
          for (const [path, count] of Object.entries(pathCounts)) {
            if (count > maxCount) {
              maxCount = count;
              mostCommonPath = path;
            }
          }
          
          // If the most common path has more than 3 images, assume it's the chapter directory
          if (maxCount > 3) {
            images.push(...imgArray.filter(url => url.startsWith(mostCommonPath)));
          } else {
            images.push(...imgArray);
          }
        }
      }
      
      // Fallback 5: Explicitly look for warungkomikcdn.icu URLs
      if (images.length === 0) {
        const urlRegex = /["'](https?:\/\/warungkomikcdn\.icu\/[^"']+)["']/gi;
        let match;
        const allImages = new Set<string>();
        while ((match = urlRegex.exec(html)) !== null) {
          const url = match[1].replace(/\\/g, '');
          if (!url.includes('readerarea.svg') && 
              !url.includes('avatar') && 
              !url.includes('logo') && 
              !url.includes('thumb') &&
              !url.toLowerCase().includes('banner') &&
              !url.toLowerCase().includes('icon')) {
            allImages.add(url);
          }
        }
        if (allImages.size > 0) {
          images.push(...Array.from(allImages));
        }
      }
      
      let result;
      if (debug === 'true') {
        result = { title, images, pdfUrl, rawHtml: html };
      } else {
        result = { title, images, pdfUrl };
      }
      
      serverCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    }

    const comics: any[] = [];

    if (type === 'update') {
      // MangaStream style parsing
      $('.bsx').each((i, el) => {
        const title = $(el).find('.tt').text().trim() || $(el).find('h2[itemprop="headline"]').text().trim() || $(el).find('h4').text().trim();
        const link = $(el).find('a').attr('href');
        const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
        const chapter = $(el).find('.epxs').text().trim() || $(el).find('.ep').text().trim() || $(el).find('.chapter').text().trim();
        
        if (title && link) {
          comics.push({ title, link, image, chapter });
        }
      });

      // Madara style parsing fallback
      if (comics.length === 0) {
        $('.page-item-detail').each((i, el) => {
          const title = $(el).find('.post-title h3 a').text().trim();
          const link = $(el).find('.post-title h3 a').attr('href');
          const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
          const chapter = $(el).find('.chapter-item .chapter a').first().text().trim();
          if (title && link) {
            comics.push({ title, link, image, chapter });
          }
        });
      }

      // Generic fallback
      if (comics.length === 0) {
        $('.listupd .bs').each((i, el) => {
          const title = $(el).find('.tt').text().trim();
          const link = $(el).find('a').attr('href');
          const image = $(el).find('img').attr('src');
          const chapter = $(el).find('.epxs').text().trim();
          if (title && link) {
            comics.push({ title, link, image, chapter });
          }
        });
      }
    } else if (type === 'list') {
      // List mode parsing
      $('.soralist .series').each((i, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr('href');
        if (title && link) {
          comics.push({ title, link, chapter: 'N/A' });
        }
      });
      
      // Another list style
      if (comics.length === 0) {
        $('.manga-list-text li').each((i, el) => {
          const title = $(el).find('a.series').text().trim() || $(el).find('a').first().text().trim();
          const link = $(el).find('a.series').attr('href') || $(el).find('a').first().attr('href');
          const chapter = $(el).find('span').text().trim();
          if (title && link) {
            comics.push({ title, link, chapter });
          }
        });
      }
    }

    const result = { comics, rawHtmlLength: html.length };
    serverCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
