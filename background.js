// Ağ isteklerini dinle ve şu anda çalmakta olan video ID'sini belirle
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const url = new URL(details.url);
    const videoId = url.searchParams.get("v") || url.searchParams.get("video_id");

    // Sadece YouTube Music URL'lerini dinle
    if (url.hostname.includes('music.youtube.com') && videoId) {
      // Sadece video ID değişirse depolamaya yaz, kota sorununu önlemek için
      chrome.storage.local.get('activeVideoId', (data) => {
        if (data.activeVideoId !== videoId) {
          chrome.storage.local.set({ activeVideoId: videoId }).catch(error => {
            console.error("Background: Error storing activeVideoId:", error);
          });
        }
      });
    }
  },
  {
    // Dinlenecek URL'ler: Sadece YouTube Music ve Googlevideo (video akışları)
    urls: [
      "*://music.youtube.com/*",
      "*://*.googlevideo.com/*"
    ],
    // Dinlenecek istek tipleri: Ana sayfa yüklemeleri ve API çağrıları
    types: ["main_frame", "xmlhttprequest"]
  },
  []
);

// İsteğe bağlı: YouTube Music sekmesinden ayrıldığında veya sekme kapandığında activeVideoId'yi temizle
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // Sekme URL'si değişmeye başladığında ve YouTube Music sayfası değilse, kaydedilen ID'yi temizle
  if (changeInfo.status === 'loading' && tab.url && !tab.url.includes('music.youtube.com')) {
    chrome.storage.local.remove('activeVideoId').catch(error => {
      console.error("Background: Error clearing activeVideoId on tab update:", error);
    });
  }
});
