// content.js
// Playlist ID'yi URL'den al
function getPlaylistId() {
  try {
    const url = new URL(location.href);
    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

// Video ID'yi URL'den, video elementinden, JS API'den veya arka plan servisinden almaya çalışır
async function getVideoId() {
  try {
    const url = new URL(location.href);
    const vParam = url.searchParams.get("v");
    if (vParam) {
      return vParam;
    }

    const pathSegments = url.pathname.split('/');
    if (pathSegments.length > 1) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/i; // 'i' flag for case-insensitive
      if (youtubeIdRegex.test(lastSegment)) {
        return lastSegment;
      }
    }

    const videoElement = document.querySelector("video");
    if (videoElement && videoElement.dataset.videoId) {
      return videoElement.dataset.videoId;
    }

    if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && window.ytplayer.config.args.video_id) {
        return window.ytplayer.config.args.video_id;
    }

    const data = await chrome.storage.local.get('activeVideoId');
    if (data.activeVideoId) {
        return data.activeVideoId;
    }

    return null;
  } catch (e) {
    console.error("Error getting video ID in getVideoId:", e);
    const data = await chrome.storage.local.get('activeVideoId');
    if (data.activeVideoId) {
        return data.activeVideoId;
    }
    return null;
  }
}

// Video elementi hazır olunca callback
async function withVideo(cb, retries = 20) {
  const video = document.querySelector("video");
  if (video) return await cb(video);
  if (retries === 0) return;
  setTimeout(() => withVideo(cb, retries - 1), 300);
}

// Paneli güncelle (slider ve hız metni)
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) güncellenmesi için korunmuştur.
function controlById(id) {
  if (speedPanel && speedPanel.isConnected) {
    const el = speedPanel.querySelector("#" + id);
    if (el) return el;
  }
  return document.getElementById(id);
}

function updateControlPanel(speed, remember) {
  speed = clampSpeed(speed);
  const slider = controlById("ytm-speed-slider");
  const rateTxt = controlById("ytm-speed-value");
  const sliderRateTxt = controlById("ytm-speed-value-in-slider");
  const filledIcon = controlById("ytm-bookmark-filled-icon");
  const emptyIcon = controlById("ytm-bookmark-empty-icon");

  if (slider) {
    slider.value = speed;
    updateSliderFill(slider); // Slider elementini parametre olarak geç
  }
  if (rateTxt) {
    rateTxt.textContent = speed.toFixed(2) + "×";
  }
  if (sliderRateTxt) {
    sliderRateTxt.textContent = speed.toFixed(2) + "×";
  }
  if (filledIcon && emptyIcon) {
    if (remember) {
      filledIcon.style.opacity = '1';
      emptyIcon.style.opacity = '0';
      filledIcon.style.pointerEvents = 'auto';
      emptyIcon.style.pointerEvents = 'none';
    } else {
      filledIcon.style.opacity = '0';
      emptyIcon.style.opacity = '1';
      filledIcon.style.pointerEvents = 'none';
      emptyIcon.style.pointerEvents = 'auto';
    }
  }
}

// Slider'ın görsel doldurma yüzdesini güncelleyen fonksiyon
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) güncellenmesi için korunmuştur.
function updateSliderFill(sliderElement) {
    if (!sliderElement) return;
    const value = parseFloat(sliderElement.value); // Doğru sliderElement'i kullan
    const min = parseFloat(sliderElement.min);
    const max = parseFloat(sliderElement.max);
    // Yüzdeyi yatay için hesapla
    const percentage = ((value - min) / (max - min)) * 100;
    sliderElement.style.setProperty('--slider-fill-percentage', `${percentage}%`);
}

let currentManualSpeed = null;
let currentActivePlaylistId = null;
let currentActiveVideoId = null;
let lastAppliedRememberedSpeed = null;
let speedPanel = null;

const SPEED_MIN = 0.1;
const SPEED_MAX = 1.6;
const SPEED_STEP = 0.01;

function clampSpeed(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
  return Math.round(clamped * 100) / 100;
}

function playbackApi() {
  return globalThis.ytmAudio || null;
}

async function rememberTempo(speed, remember) {
  let storageKey = null;
  const videoId = await getVideoId();

  if (videoId) {
    storageKey = `track_${videoId}`;
  } else {
    const playlistId = getPlaylistId();
    if (playlistId) storageKey = `list_${playlistId}`;
  }

  if (storageKey) {
    if (remember) {
      await chrome.storage.sync.set({ [storageKey]: speed });
      currentManualSpeed = null;
      lastAppliedRememberedSpeed = speed;
    } else {
      await chrome.storage.sync.remove(storageKey);
      currentManualSpeed = speed;
      lastAppliedRememberedSpeed = null;
    }
  } else {
    currentManualSpeed = speed;
    lastAppliedRememberedSpeed = null;
  }
  return storageKey;
}

async function setPlaybackTempo(speed, remember) {
  speed = clampSpeed(speed);
  const api = playbackApi();
  if (api) api.setTempo(speed);
  updateControlPanel(speed, remember);
  await withVideo(async (video) => {
    if (api) api.apply(video);
    else video.playbackRate = speed;
  });
  await rememberTempo(speed, remember);
}

const observedRoots = new WeakSet();

function deepQuery(root, selector) {
  if (!root) return null;
  const found = root.querySelector(selector);
  if (found) return found;
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) {
      const nested = deepQuery(el.shadowRoot, selector);
      if (nested) return nested;
    }
  }
  return null;
}

function findNextButton() {
  const playerBar = document.querySelector("ytmusic-player-bar");
  if (!playerBar) return null;
  return deepQuery(playerBar, "yt-icon-button.next-button")
    || deepQuery(playerBar.shadowRoot, "yt-icon-button.next-button");
}

function watchRoot(root) {
  if (!root || observedRoots.has(root)) return;
  observedRoots.add(root);
  const observer = new MutationObserver(() => schedulePlaceSpeedControl());
  observer.observe(root, { childList: true, subtree: true });
}

function ensureSpeedStyles(parent) {
  const target = parent || document.head;
  if (target.querySelector("#ytm-speed-style")) return;

  const styleSheet = document.createElement("style");
  styleSheet.id = "ytm-speed-style";
  styleSheet.textContent = `
    #ytm-speed-control {
      display: inline-flex !important;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      margin-right: 8px;
      align-self: center;
      flex: 0 0 auto !important;
      min-width: 230px;
      vertical-align: middle;
      font-family: Roboto, Arial, sans-serif;
      color: #fff;
      position: relative;
      z-index: 5;
    }

    #ytm-speed-slider {
      width: 180px !important;
      min-width: 180px !important;
      height: 18px;
      margin: 0;
      accent-color: #fff;
      cursor: pointer;
    }

    #ytm-speed-value {
      min-width: 46px;
      font-size: 13px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      text-align: left;
      color: #fff !important;
    }

    .ytm-bookmark-icon-wrapper {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 50%;
      overflow: hidden;
      flex: 0 0 auto;
    }

    .ytm-bookmark-icon-wrapper img {
      position: absolute;
      width: 22px;
      height: 22px;
      transition: opacity 0.3s ease-in-out;
    }

    .ytm-ripple {
      position: absolute;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.3);
      transform: scale(0);
      animation: ytm-ripple-effect 0.6s linear;
    }

    @keyframes ytm-ripple-effect {
      to {
        transform: scale(2.5);
        opacity: 0;
      }
    }

    ytmusic-player-bar.ytm-speed-expanded {
      grid-template-columns: auto minmax(0, 1fr) auto !important;
    }

    ytmusic-player-bar.ytm-speed-expanded #left-controls,
    ytmusic-player-bar.ytm-speed-expanded .left-controls-buttons {
      width: auto !important;
      max-width: none !important;
      flex: 0 0 auto !important;
      overflow: visible !important;
    }
  `;
  target.appendChild(styleSheet);
}

let placeScheduled = false;

function schedulePlaceSpeedControl() {
  if (placeScheduled) return;
  placeScheduled = true;
  requestAnimationFrame(() => {
    placeScheduled = false;
    placeSpeedControl();
  });
}

function ensureControlLayout(nextButton) {
  const playerBar = nextButton.closest("ytmusic-player-bar");
  const buttonRow = nextButton.parentElement;
  const leftControls = buttonRow && buttonRow.closest("#left-controls, .left-controls");

  if (playerBar) {
    playerBar.classList.add("ytm-speed-expanded");
    playerBar.style.setProperty("grid-template-columns", "auto minmax(0, 1fr) auto", "important");
  }
  for (const el of [buttonRow, leftControls]) {
    if (!el) continue;
    el.style.setProperty("width", "max-content", "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("flex", "0 0 auto", "important");
    el.style.setProperty("overflow", "visible", "important");
  }
}

function placeSpeedControl() {
  if (!window.location.hostname.includes("music.youtube.com")) return;

  const nextButton = findNextButton();
  if (!nextButton) return;

  try {
    ensureSpeedStyles(document.head);
    const rootNode = nextButton.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      ensureSpeedStyles(rootNode);
      watchRoot(rootNode);
    }
    ensureControlLayout(nextButton);

    if (speedPanel && speedPanel.isConnected && nextButton.nextElementSibling === speedPanel) {
      return;
    }

    if (!speedPanel || !speedPanel.isConnected) {
      speedPanel = buildControlPanel();
    }
    nextButton.insertAdjacentElement("afterend", speedPanel);
  } catch (error) {
    console.error("YouTube Music speed slider failed to attach:", error);
  }
}

// Hız kontrol panelini oluşturan fonksiyon
function createControlPanel() {
  if (!window.location.hostname.includes("music.youtube.com")) {
    return;
  }

  placeSpeedControl();
  watchRoot(document.documentElement);
  document.addEventListener("yt-navigate-finish", schedulePlaceSpeedControl);
  setInterval(placeSpeedControl, 1000);
}

function buildControlPanel() {
  const panel = document.createElement("div");
  panel.id = "ytm-speed-control";
  panel.style.setProperty("display", "inline-flex", "important");
  panel.style.setProperty("align-items", "center");
  panel.style.setProperty("gap", "6px");
  panel.style.setProperty("margin-left", "8px");
  panel.style.setProperty("flex", "0 0 auto", "important");
  panel.style.setProperty("position", "relative");
  panel.style.setProperty("z-index", "5");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(SPEED_MIN);
  slider.max = String(SPEED_MAX);
  slider.step = String(SPEED_STEP);
  slider.value = "1";
  slider.id = "ytm-speed-slider";
  slider.setAttribute("aria-label", "Playback speed");
  slider.style.setProperty("width", "180px", "important");
  slider.style.setProperty("min-width", "180px", "important");
  slider.style.setProperty("accent-color", "#ffffff");
  slider.style.setProperty("margin", "0");

  const rateTxt = document.createElement("span");
  rateTxt.id = "ytm-speed-value";
  rateTxt.textContent = "1.00×";
  rateTxt.style.setProperty("color", "#ffffff", "important");
  rateTxt.style.setProperty("font", "13px Roboto, Arial, sans-serif");
  rateTxt.style.setProperty("min-width", "46px");

  const bookmarkIconWrapper = document.createElement("div");
  bookmarkIconWrapper.className = "ytm-bookmark-icon-wrapper";

  const emptyBookmarkIcon = document.createElement("img");
  emptyBookmarkIcon.id = "ytm-bookmark-empty-icon";
  emptyBookmarkIcon.src = chrome.runtime.getURL("bookmark_empty.png");
  emptyBookmarkIcon.alt = "Bookmark Empty";
  emptyBookmarkIcon.style.opacity = "1";

  const filledBookmarkIcon = document.createElement("img");
  filledBookmarkIcon.id = "ytm-bookmark-filled-icon";
  filledBookmarkIcon.src = chrome.runtime.getURL("bookmark_filled.png");
  filledBookmarkIcon.alt = "Bookmark Filled";
  filledBookmarkIcon.style.opacity = "0";

  bookmarkIconWrapper.appendChild(emptyBookmarkIcon);
  bookmarkIconWrapper.appendChild(filledBookmarkIcon);

  panel.appendChild(slider);
  panel.appendChild(rateTxt);
  panel.appendChild(bookmarkIconWrapper);

  slider.addEventListener("input", async () => {
    const remember = filledBookmarkIcon.style.opacity === "1";
    await setPlaybackTempo(slider.value, remember);
  });

  bookmarkIconWrapper.addEventListener("click", async (event) => {
    const currentRemember = filledBookmarkIcon.style.opacity === "1";
    const newRemember = !currentRemember;
    const speed = clampSpeed(slider.value);

    const ripple = document.createElement("span");
    ripple.className = "ytm-ripple";
    const rect = bookmarkIconWrapper.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    bookmarkIconWrapper.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());

    updateControlPanel(speed, newRemember);

    let storageKey = null;
    const videoId = await getVideoId();

    if (videoId) {
      storageKey = `track_${videoId}`;
    } else {
      const playlistId = getPlaylistId();
      if (playlistId) {
        storageKey = `list_${playlistId}`;
      }
    }

    if (storageKey) {
      if (newRemember) {
        await chrome.storage.sync.set({ [storageKey]: speed });
        currentManualSpeed = null;
        lastAppliedRememberedSpeed = speed;
      } else {
        await chrome.storage.sync.remove(storageKey);
        currentManualSpeed = speed;
        lastAppliedRememberedSpeed = null;
      }
    } else {
      currentManualSpeed = speed;
      lastAppliedRememberedSpeed = null;
    }
  });

  withVideo(async (video) => {
    let storageKey = null;
    const videoId = await getVideoId();

    if (videoId) {
      storageKey = `track_${videoId}`;
    } else {
      const playlistId = getPlaylistId();
      if (playlistId) {
        storageKey = `list_${playlistId}`;
      }
    }

    if (!storageKey) {
      const displaySpeed = currentManualSpeed !== null ? currentManualSpeed : video.playbackRate;
      updateControlPanel(displaySpeed, false);
      return;
    }

    chrome.storage.sync.get(storageKey, (data) => {
      const isSpeedSaved = Object.prototype.hasOwnProperty.call(data, storageKey);
      let speedToDisplay;
      let rememberChecked;

      if (isSpeedSaved) {
        speedToDisplay = data[storageKey];
        rememberChecked = true;
      } else if (currentManualSpeed !== null) {
        speedToDisplay = currentManualSpeed;
        rememberChecked = false;
      } else {
        speedToDisplay = video.playbackRate;
        rememberChecked = false;
      }
      updateControlPanel(speedToDisplay, rememberChecked);
    });
  });

  updateSliderFill(slider);
  return panel;
}


// Kaydedilen hızı videoya uygulayan fonksiyon
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) çalışması için korunmuştur.
async function applySavedSpeedToVideo(video) {
  let storageKey = null;
  const videoId = await getVideoId();

  if (videoId) {
    storageKey = `track_${videoId}`;
  } else {
    const playlistId = getPlaylistId();
    if (playlistId) {
      storageKey = `list_${playlistId}`;
    }
  }

  let targetSpeed = video.playbackRate; // Başlangıçta videonun mevcut hızı
  let rememberState = false;

  if (!storageKey) {
    targetSpeed = clampSpeed(currentManualSpeed !== null ? currentManualSpeed : 1);
    rememberState = false;
  } else {
    const data = await new Promise(resolve => {
      chrome.storage.sync.get(storageKey, resolve);
    });

    const savedSpeed = data[storageKey];

    if (savedSpeed !== undefined) {
      targetSpeed = clampSpeed(savedSpeed);
      rememberState = true;
      currentManualSpeed = null;
      if (targetSpeed !== savedSpeed) {
        chrome.storage.sync.set({ [storageKey]: targetSpeed });
      }
    } else {
      if (currentManualSpeed !== null) {
        targetSpeed = clampSpeed(currentManualSpeed);
        rememberState = false;
      } else {
        targetSpeed = 1; // Kaydedilen veya manuel hız yoksa varsayılan 1x
        rememberState = false;
      }
    }
  }

  targetSpeed = clampSpeed(targetSpeed);

  // Sadece hız değişmişse veya kaydedilmiş hız durumu farklıysa hızı uygula
  const shouldApplySpeed = (video.playbackRate !== targetSpeed) ||
                         (rememberState && lastAppliedRememberedSpeed !== targetSpeed) ||
                         (!rememberState && lastAppliedRememberedSpeed !== null); // Manuelde iken hatırlanan hızın değişmesi

  if (shouldApplySpeed) {
    const api = playbackApi();
    if (api) {
      api.setTempo(targetSpeed);
      api.apply(video);
    } else {
      video.playbackRate = targetSpeed;
    }
  }

  if (rememberState) {
      lastAppliedRememberedSpeed = targetSpeed;
  } else {
      lastAppliedRememberedSpeed = null;
  }

  updateControlPanel(targetSpeed, rememberState); // Hesaplanan targetSpeed'i panelde göster
}

// Video hız işleyicisini ayarlayan fonksiyon
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) çalışması için korunmuştur.
function setupVideoSpeedHandler() {
  withVideo(async (video) => {
    video.removeEventListener("loadedmetadata", onVideoLoad);
    video.removeEventListener("play", onVideoLoad);
    video.removeEventListener("ratechange", onRateChange);

    video.addEventListener("loadedmetadata", onVideoLoad);
    video.addEventListener("play", onVideoLoad);
    video.addEventListener("ratechange", onRateChange);

    await applySavedSpeedToVideo(video);
  });
}

// Video yüklendiğinde hız uygulayan fonksiyon
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) çalışması için korunmuştur.
async function onVideoLoad(event) {
  await applySavedSpeedToVideo(event.target);
}

// Hız değiştiğinde çağrılan fonksiyon
// Bu fonksiyon, hız kontrol panelinin (popup dışındaki) çalışması için korunmuştur.
function onRateChange(event) {
    // Bu fonksiyon şu an için boş bırakılmıştır, ancak gelecekte kullanılabilir.
}

const obs = new MutationObserver(async () => {
  // Sadece YouTube Music sayfasında çalışmasını sağla
  if (!window.location.hostname.includes('music.youtube.com')) {
    return;
  }

  const url = new URL(location.href);
  let newActivePlaylistId = null;
  let newActiveVideoId = null;

  newActiveVideoId = await getVideoId();

  if (!newActiveVideoId) {
      newActivePlaylistId = getPlaylistId();
  } else {
      newActivePlaylistId = null;
  }

  if (newActivePlaylistId !== currentActivePlaylistId || newActiveVideoId !== currentActiveVideoId) {
    currentActivePlaylistId = newActivePlaylistId;
    currentActiveVideoId = newActiveVideoId;

    currentManualSpeed = null; // Her yeni URL veya video/playlist değiştiğinde manuel hızı sıfırla

    await withVideo(async (video) => {
        await applySavedSpeedToVideo(video); // Hız kontrolü korunduğu için çağrı bırakıldı.
    });
  }
});
obs.observe(document.documentElement, { childList: true, subtree: true });

// Sadece YouTube Music sayfasında hız işleyicisini kur
if (window.location.hostname.includes('music.youtube.com')) {
  setupVideoSpeedHandler(); // Hız kontrolü korunduğu için çağrı bırakıldı.
}


chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    // Sadece YouTube Music URL'lerini kontrol et
    if (!window.location.hostname.includes('music.youtube.com')) {
      sendResponse({ status: "ignored" });
      return false; // Mesajı işlemeden çık
    }

    // SET_SPEED ve GET_INFO mesaj tipleri, hız kontrol panelinin çalışması için korunmuştur.
    if (msg.type === "SET_SPEED") {
      await setPlaybackTempo(msg.speed, !!msg.remember);
      sendResponse({ status: "success" });
      return true;
    }
    if (msg.type === "GET_INFO") {
      let storageKey = null;
      const videoId = await getVideoId();

      if (videoId) {
          storageKey = `track_${videoId}`;
      } else {
          const playlistId = getPlaylistId();
          if (playlistId) {
              storageKey = `list_${playlistId}`;
          }
      }

      let resp = {};
      await withVideo(async (video) => {
          let speedToReport = playbackApi() ? playbackApi().getTempo() : (video.playbackRate ?? 1);
          let rememberToReport = false;

          if (storageKey) {
              const data = await new Promise(resolve => {
                chrome.storage.sync.get(storageKey, resolve);
              });

              if (data.hasOwnProperty(storageKey)) {
                  rememberToReport = true;
                  speedToReport = data[storageKey];
              } else if (currentManualSpeed !== null) {
                  speedToReport = currentManualSpeed;
                  rememberToReport = false;
              } else {
                  speedToReport = playbackApi() ? playbackApi().getTempo() : (video.playbackRate ?? 1);
                  rememberToReport = false;
              }
          } else {
             speedToReport = currentManualSpeed !== null ? currentManualSpeed : (playbackApi() ? playbackApi().getTempo() : (video.playbackRate ?? 1));
             rememberToReport = false;
          }

          resp = {
              speed: clampSpeed(speedToReport),
              remember: rememberToReport
          };
      });
      sendResponse(resp);
      return true;
    }
    if (msg.type === "GET_NOW_PLAYING_INFO") {
        const video = document.querySelector("video");
        const titleElement = document.querySelector(".title.ytmusic-player-bar");
        const albumCoverElement = document.querySelector("ytmusic-player-bar .thumbnail-image-wrapper img");

        let artist = "Unknown Artist";
        let albumName = "Unknown Album";

        const bylineElement = document.querySelector(".byline.ytmusic-player-bar");
        if (bylineElement) {
            // Sanatçı adını doğrudan ilk <a> etiketinden al
            const artistLink = bylineElement.querySelector("a:first-child");
            if (artistLink) {
                artist = artistLink.textContent.trim();
            } else {
                // Eğer <a> etiketi yoksa, byline elementinin tamamını sanatçı olarak al
                // Bu durumda, byline'da birden fazla sanatçı varsa hepsi gelecektir.
                artist = bylineElement.textContent.trim();
            }

            // Albüm adını byline elementinin textContent'inden parse et
            const fullBylineText = bylineElement.textContent;
            const parts = fullBylineText.split('•').map(p => p.trim()).filter(p => p !== '');

            // İlk kısım genellikle sanatçıdır, diğer kısımları albüm için kontrol et
            if (parts.length > 1) {
                for (let i = 1; i < parts.length; i++) {
                    const part = parts[i];
                    // Yıl gibi 4 haneli sayıları atla
                    if (!isNaN(parseInt(part)) && part.length === 4) {
                        continue;
                    }
                    // "Views" veya "görüntüleme" içeren kısmı bul ve kaldır
                    if (part.toLowerCase().includes("views") || part.toLowerCase().includes("görüntüleme")) {
                        // Bu kısım artık popup'ta gösterilmeyeceği için işlenmiyor
                        continue;
                    } else {
                        // Kalan kısmı albüm adı olarak kabul et (eğer daha önce bulunmadıysa ve boş değilse)
                        if (albumName === "Unknown Album" && part !== "") {
                            albumName = part;
                        }
                    }
                }
            }
        }

        let currentTime = 0;
        let duration = 0;
        let isPlaying = false;

        if (video) {
            currentTime = video.currentTime;
            duration = video.duration;
            isPlaying = !video.paused; // Videonun oynatma durumu
        }

        // Albüm kapağı URL'sini daha yüksek çözünürlüklü hale getirme
        let albumCoverSrc = albumCoverElement ? albumCoverElement.src : "";
        if (albumCoverSrc) {
            // URL'deki boyut parametrelerini değiştir veya kaldır
            // Örneğin, "=w120-h120" veya "=s120" gibi kısımları hedefle
            albumCoverSrc = albumCoverSrc.replace(/=w\d+-h\d+/, '=w300-h300'); // Genişlik ve yükseklik parametrelerini değiştir
            albumCoverSrc = albumCoverSrc.replace(/=s\d+/, '=s300'); // s parametresini değiştir
            // Eğer hala küçükse, boyut parametrelerini tamamen kaldırmayı dene (bazı durumlarda orijinal boyutu verir)
            albumCoverSrc = albumCoverSrc.replace(/=-rw/, ''); // Bazı durumlarda bu da boyutu etkiler
        }


        const info = {
            title: titleElement ? titleElement.textContent.trim() : "Unknown Title",
            artist: artist, // Parse edilmiş sanatçı
            albumCover: albumCoverSrc, // Yüksek çözünürlüklü albüm kapağı URL'si
            albumName: albumName, // Parse edilmiş albüm adı
            currentTime: currentTime,
            duration: duration,
            isPlaying: isPlaying // Oynatma durumu eklendi
        };
        sendResponse(info);
        return true;
    }
    // Beğeni ve beğenmeme butonları kaldırıldığı için bu mesaj tipleri de kaldırıldı.
    if (msg.type === "LIKE_TRACK" || msg.type === "DISLIKE_TRACK") {
        sendResponse({ status: "ignored" });
        return true;
    }
    if (msg.type === "PREVIOUS_TRACK") {
        const previousButton = document.querySelector("ytmusic-player-bar .previous-button") ||
                               document.querySelector("ytmusic-player-bar tp-yt-paper-icon-button[aria-label='Önceki']");
        if (previousButton) {
            previousButton.click();
        } else {
            console.warn("Previous button not found.");
        }
        sendResponse({ status: "success" });
        return true;
    }
    if (msg.type === "TOGGLE_PLAY_PAUSE") {
        const playPauseButton = document.querySelector("ytmusic-player-bar #play-pause-button") ||
                                document.querySelector("ytmusic-player-bar tp-yt-paper-icon-button[aria-label='Oynat']"); // Oynat veya duraklat olabilir
        if (playPauseButton) {
            playPauseButton.click();
        } else {
            console.warn("Play/Pause button not found.");
        }
        sendResponse({ status: "success" });
        return true;
    }
    if (msg.type === "NEXT_TRACK") {
        const nextButton = document.querySelector("ytmusic-player-bar .next-button") ||
                           document.querySelector("ytmusic-player-bar tp-yt-paper-icon-button[aria-label='Sonraki']");
        if (nextButton) {
            nextButton.click();
        } else {
            console.warn("Next button not found.");
        }
        sendResponse({ status: "success" });
        return true;
    }
  })();
  return true;
});

// Hız kontrol panelini oluşturan fonksiyonu çağır
// Sadece YouTube Music sayfasında çalışmasını sağla
if (window.location.hostname.includes('music.youtube.com')) {
  createControlPanel();
  if (playbackApi()) {
    playbackApi().onTempo((speed) => {
      const filled = controlById("ytm-bookmark-filled-icon");
      const remember = !!(filled && filled.style.opacity === "1");
      setPlaybackTempo(speed, remember);
    });
  }
}
