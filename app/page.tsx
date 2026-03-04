'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, AlertCircle, BookOpen, List, ArrowLeft, ArrowRight, Image as ImageIcon } from 'lucide-react';

interface Comic {
  title: string;
  link: string;
  image?: string;
  chapter?: string;
}

interface ComicDetail {
  title: string;
  image?: string;
  synopsis?: string;
  chapters: { title: string; link: string; date?: string }[];
}

interface ChapterDetail {
  title: string;
  images: string[];
  pdfUrl?: string | null;
}

const clientCache = {
  update: null as Comic[] | null,
  list: null as Comic[] | null,
  details: {} as Record<string, ComicDetail>,
  chapters: {} as Record<string, ChapterDetail>
};

const LazyImage = ({ src, alt, className, imgClassName }: { src: string, alt: string, className?: string, imgClassName?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px' } // Load well before it comes into view
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={`relative bg-slate-100 overflow-hidden ${className || ''}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center animate-pulse">
          <ImageIcon className="w-8 h-8 text-slate-300 opacity-50" />
        </div>
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-full transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${imgClassName || ''}`}
        />
      )}
    </div>
  );
};

export default function Page() {
  const [view, setView] = useState<'home' | 'detail' | 'chapter'>('home');
  const [activeTab, setActiveTab] = useState<'update' | 'list'>('update');
  
  const [comics, setComics] = useState<Comic[]>([]);
  const [comicDetail, setComicDetail] = useState<ComicDetail | null>(null);
  const [chapterDetail, setChapterDetail] = useState<ChapterDetail | null>(null);
  
  const [selectedComicUrl, setSelectedComicUrl] = useState<string | null>(null);
  const [selectedChapterUrl, setSelectedChapterUrl] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('komikState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.view) setView(parsed.view);
        if (parsed.activeTab) setActiveTab(parsed.activeTab);
        if (parsed.selectedComicUrl) setSelectedComicUrl(parsed.selectedComicUrl);
        if (parsed.selectedChapterUrl) setSelectedChapterUrl(parsed.selectedChapterUrl);
      }
    } catch (e) {
      console.error('Failed to load state from localStorage', e);
    }
    setIsInitialized(true);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem('komikState', JSON.stringify({
        view,
        activeTab,
        selectedComicUrl,
        selectedChapterUrl
      }));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }, [view, activeTab, selectedComicUrl, selectedChapterUrl, isInitialized]);

  const fetchComics = async (type: 'update' | 'list', forceRefresh = false) => {
    if (!forceRefresh && clientCache[type]) {
      setComics(clientCache[type]!);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    setComics([]);
    try {
      const res = await fetch(`/api/komik?type=${type}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch data');
      }
      
      setComics(data.comics || []);
      clientCache[type] = data.comics || [];
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchComicDetail = async (url: string, forceRefresh = false, silent = false) => {
    if (!silent) {
      setSelectedComicUrl(url);
      setView('detail');
    }
    
    if (!forceRefresh && clientCache.details[url]) {
      setComicDetail(clientCache.details[url]);
      if (!silent) setError(null);
      return;
    }
    
    if (!silent) {
      setLoading(true);
      setError(null);
      setComicDetail(null);
    }
    try {
      const res = await fetch(`/api/komik?type=detail&url=${encodeURIComponent(url)}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch detail');
      }
      
      setComicDetail(data);
      clientCache.details[url] = data;
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchChapterDetail = async (url: string, forceRefresh = false) => {
    setSelectedChapterUrl(url);
    setView('chapter');
    
    if (!forceRefresh && clientCache.chapters[url]) {
      setChapterDetail(clientCache.chapters[url]);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    setChapterDetail(null);
    try {
      const res = await fetch(`/api/komik?type=chapter&url=${encodeURIComponent(url)}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch chapter');
      }
      
      setChapterDetail(data);
      clientCache.chapters[url] = data;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitialized) return;

    if (view === 'home') {
      fetchComics(activeTab);
    } else if (view === 'detail' && selectedComicUrl) {
      fetchComicDetail(selectedComicUrl);
    } else if (view === 'chapter' && selectedChapterUrl) {
      fetchChapterDetail(selectedChapterUrl);
      if (selectedComicUrl && !comicDetail) {
        fetchComicDetail(selectedComicUrl, false, true);
      }
    }
  }, [view, activeTab, isInitialized]); // Only trigger on view/tab change or initialization

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {view !== 'home' && (
              <button 
                onClick={() => {
                  if (view === 'chapter') setView('detail');
                  else if (view === 'detail') setView('home');
                }}
                className="p-2 -ml-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight text-indigo-600 flex items-center gap-2 truncate">
              {view === 'home' && <BookOpen className="w-6 h-6 shrink-0" />}
              <span className="truncate">
                {view === 'home' ? 'Komik Iclik' : 
                 view === 'detail' ? (comicDetail?.title || 'Loading...') : 
                 (chapterDetail?.title || 'Loading...')}
              </span>
            </h1>
          </div>
          
          {view === 'home' && (
            <button 
              onClick={() => fetchComics(activeTab, true)}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        
        {/* Tabs for Home View */}
        {view === 'home' && (
          <div className="max-w-4xl mx-auto px-4 flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('update')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'update' 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Latest Updates
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'list' 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <List className="w-4 h-4" />
              List Mode
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 py-6">
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 mb-6 border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Error fetching data</h3>
              <p className="text-sm mt-1 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
            <p className="text-sm font-medium">Loading...</p>
          </div>
        ) : (
          <>
            {/* Home View */}
            {view === 'home' && comics.length > 0 && (
              <div className={
                activeTab === 'update' 
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" 
                  : "flex flex-col gap-2"
              }>
                {comics.map((comic, i) => (
                  <button 
                    key={i} 
                    onClick={() => fetchComicDetail(comic.link)}
                    className={
                      activeTab === 'update'
                        ? "text-left group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-slate-100 flex flex-col"
                        : "text-left group bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all border border-slate-100 flex items-center justify-between gap-4"
                    }
                  >
                    {activeTab === 'update' && (
                      <div className="aspect-[3/4] w-full bg-slate-100 relative overflow-hidden">
                        {comic.image ? (
                          <LazyImage 
                            src={`/api/image?url=${encodeURIComponent(comic.image)}`} 
                            alt={comic.title}
                            className="w-full h-full"
                            imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <BookOpen className="w-8 h-8" />
                          </div>
                        )}
                        {comic.chapter && (
                          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-md">
                            {comic.chapter}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className={activeTab === 'update' ? "p-3 flex-1 flex flex-col justify-between w-full" : "flex-1 min-w-0"}>
                      <h3 className={`font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors ${
                        activeTab === 'update' ? "text-sm line-clamp-2" : "text-base truncate"
                      }`}>
                        {comic.title}
                      </h3>
                      
                      {activeTab === 'list' && comic.chapter && comic.chapter !== 'N/A' && (
                        <span className="text-xs font-medium text-slate-500 mt-1 block">
                          {comic.chapter}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Detail View */}
            {view === 'detail' && comicDetail && (
              <div className="flex flex-col gap-6">
                <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-6">
                  {comicDetail.image && (
                    <div className="w-32 sm:w-48 shrink-0 mx-auto sm:mx-0 rounded-xl overflow-hidden shadow-sm">
                      <LazyImage 
                        src={`/api/image?url=${encodeURIComponent(comicDetail.image)}`} 
                        alt={comicDetail.title} 
                        className="w-full aspect-[3/4]"
                        imgClassName="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">{comicDetail.title}</h2>
                    {comicDetail.synopsis && (
                      <div className="text-sm text-slate-600 leading-relaxed">
                        <h3 className="font-semibold text-slate-900 mb-2">Synopsis</h3>
                        <p>{comicDetail.synopsis}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <List className="w-5 h-5 text-indigo-500" />
                      Chapters ({comicDetail.chapters.length})
                    </h3>
                  </div>
                  <div className="flex flex-col max-h-[60vh] overflow-y-auto">
                    {comicDetail.chapters.map((chapter, i) => (
                      <button
                        key={i}
                        onClick={() => fetchChapterDetail(chapter.link)}
                        className="text-left p-4 border-b border-slate-50 hover:bg-indigo-50 transition-colors flex items-center justify-between group"
                      >
                        <span className="font-medium text-slate-700 group-hover:text-indigo-700">{chapter.title}</span>
                        {chapter.date && (
                          <span className="text-xs text-slate-400">{chapter.date}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chapter View */}
            {view === 'chapter' && chapterDetail && (() => {
              const currentIndex = comicDetail?.chapters.findIndex(c => c.link === selectedChapterUrl) ?? -1;
              const nextChapter = currentIndex > 0 ? comicDetail?.chapters[currentIndex - 1] : null;
              const prevChapter = currentIndex !== -1 && currentIndex < (comicDetail?.chapters.length || 0) - 1 ? comicDetail?.chapters[currentIndex + 1] : null;

              const NavButtons = () => (
                <div className="p-4 w-full flex flex-row justify-between items-center gap-2 bg-slate-900 border-y border-slate-800">
                  <button
                    onClick={() => {
                      if (prevChapter) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        fetchChapterDetail(prevChapter.link);
                      }
                    }}
                    disabled={!prevChapter}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white font-medium rounded-lg transition-colors flex items-center gap-2 flex-1 justify-center sm:flex-none"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Prev Chapter</span>
                  </button>

                  <button
                    onClick={() => setView('detail')}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 flex-[2] justify-center truncate mx-2 max-w-xs"
                  >
                    <List className="w-4 h-4 shrink-0" />
                    <span className="truncate text-sm hidden sm:inline">All Chapters</span>
                  </button>

                  <button
                    onClick={() => {
                      if (nextChapter) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        fetchChapterDetail(nextChapter.link);
                      }
                    }}
                    disabled={!nextChapter}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white font-medium rounded-lg transition-colors flex items-center gap-2 flex-1 justify-center sm:flex-none"
                  >
                    <span className="hidden sm:inline">Next Chapter</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );

              return (
                <div className="flex flex-col items-center bg-black rounded-xl overflow-hidden w-full">
                  <NavButtons />
                  
                  {chapterDetail.pdfUrl ? (
                    <div className="w-full h-[80vh] flex flex-col">
                      <iframe 
                        src={chapterDetail.pdfUrl} 
                        className="w-full h-full border-0"
                        title="PDF Viewer"
                        allowFullScreen
                      />
                      <div className="p-4 bg-slate-800 text-center">
                        <a 
                          href={chapterDetail.pdfUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                        >
                          Buka PDF di tab baru jika tidak muncul
                        </a>
                      </div>
                    </div>
                  ) : chapterDetail.images.length > 0 ? (
                    chapterDetail.images.map((img, i) => (
                      <LazyImage 
                        key={i} 
                        src={`/api/image?url=${encodeURIComponent(img)}`} 
                        alt={`Page ${i + 1}`} 
                        className="w-full max-w-3xl min-h-[50vh] sm:min-h-[80vh] bg-slate-900"
                        imgClassName="h-auto block"
                      />
                    ))
                  ) : (
                    <div className="py-20 flex flex-col items-center text-slate-400 w-full px-4 text-center">
                      <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
                      <p className="mb-2">No images or PDF found for this chapter.</p>
                    </div>
                  )}
                  
                  {chapterDetail.images.length > 0 && <NavButtons />}
                </div>
              );
            })()}

            {/* Empty State */}
            {view === 'home' && comics.length === 0 && !error && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No comics found.</p>
                <p className="text-xs mt-1 opacity-70">The HTML structure might have changed or the scrape failed.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
