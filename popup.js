const albumCover = document.getElementById("albumCover");
const trackTitle = document.getElementById("trackTitle");
const albumName = document.getElementById("albumName");
const trackArtist = document.getElementById("trackArtist");
const currentProgress = document.getElementById("currentProgress");
const progressBarFill = document.getElementById("progressBarFill");
const totalDuration = document.getElementById("totalDuration");

const previousButton = document.getElementById("previousButton");
const playPauseButton = document.getElementById("playPauseButton");
const nextButton = document.getElementById("nextButton");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");

// Hız kontrol elementleri
const slider = document.getElementById("rateSlider");
const rateTxt = document.getElementById("rateValue");
const speedIconWrapper = document.getElementById("speedIconWrapper");
const speedSliderPopup = document.getElementById("speedSliderPopup"); // Yeni slider popup container'ı
const bookmarkIconWrapper = document.getElementById("bookmarkIconWrapper");
const emptyBookmarkIcon = document.getElementById("emptyBookmarkIcon");
const filledBookmarkIcon = document.getElementById("filledBookmarkIcon");

// Ayarlar simgesi
const settingsIconContainer = document.getElementById("settingsIconContainer");

// Arka plan katmanı referansı
const backgroundLayer = document.getElementById("backgroundLayer");


// Zamanı MM:SS formatına dönüştüren yardımcı fonksiyon
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

// Slider'ın görsel doldurma yüzdesini güncelleyen fonksiyon (popup için)
function updateSliderFill() {
  const value = parseFloat(slider.value);
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const percentage = ((value - min) / (max - min)) * 100;
  slider.style.setProperty('--slider-fill-percentage', `${percentage}%`);
}

// Hızı content script'e gönderen fonksiyon
function updateSpeed(speed, remember) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // !tab veya !tab.url kontrolü eklendi
    if (!tab || !tab.url || !tab.url.includes('music.youtube.com')) {
      console.warn("Not on a YouTube Music page. Speed change not applied.");
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "SET_SPEED", speed, remember });
  });
}

// Şarkı bilgilerini ve ilerleme çubuğunu güncelleyen fonksiyon
function updateNowPlayingInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // !tab veya !tab.url kontrolü eklendi
    if (!tab || !tab.url || !tab.url.includes('music.youtube.com')) {
      // YouTube Music sayfası değilse veya sekme bilgisi yoksa varsayılan değerleri göster
      console.warn("Not on a YouTube Music page or tab info is unavailable. Default values shown.");
      albumCover.src = "default_cover.png";
      trackTitle.textContent = "Song Title";
      albumName.textContent = "Album Title";
      trackArtist.textContent = "Artist";
      currentProgress.textContent = "0:00";
      totalDuration.textContent = "0:00";
      progressBarFill.style.width = "0%";
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_NOW_PLAYING_INFO" }, (info) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message:", chrome.runtime.lastError.message);
        // Hata durumunda varsayılan değerleri göster
        albumCover.src = "default_cover.png";
        trackTitle.textContent = "Song Title";
        albumName.textContent = "Album Title";
        trackArtist.textContent = "Artist";
        currentProgress.textContent = "0:00";
        totalDuration.textContent = "0:00";
        progressBarFill.style.width = "0%";
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        return;
      }

      if (info) {
        albumCover.src = info.albumCover || "https://placehold.co/120x120/5a5a5a/ffffff?text=No+Cover";
        trackTitle.textContent = info.title;
        albumName.textContent = info.albumName || "Albüm Adı";
        trackArtist.textContent = info.artist;

        currentProgress.textContent = formatTime(info.currentTime);
        totalDuration.textContent = formatTime(info.duration);

        if (info.duration > 0) {
          const progressPercentage = (info.currentTime / info.duration) * 100;
          progressBarFill.style.width = `${progressPercentage}%`;
        } else {
          progressBarFill.style.width = "0%";
        }

        // Oynat/Duraklat ikonunu güncelle
        if (info.isPlaying) {
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
        } else {
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
        }

      } else {
        // Bilgi alınamazsa varsayılan değerleri göster
        albumCover.src = "https://placehold.co/120x120/5a5a5a/ffffff?text=No+Cover";
        trackTitle.textContent = "Şarkı Başlığı";
        albumName.textContent = "Albüm Adı";
        trackArtist.textContent = "Sanatçı";
        currentProgress.textContent = "0:00";
        totalDuration.textContent = "0:00";
        progressBarFill.style.width = "0%";
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    });
  });
}

// Oynatma kontrol butonları olay dinleyicileri
previousButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // !tab veya !tab.url kontrolü eklendi
    if (tab && tab.url && tab.url.includes('music.youtube.com')) {
      chrome.tabs.sendMessage(tab.id, { type: "PREVIOUS_TRACK" });
    } else {
      console.warn("Not on a YouTube Music page or tab info is unavailable. Action not performed.");
    }
  });
});

playPauseButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // !tab veya !tab.url kontrolü eklendi
    if (tab && tab.url && tab.url.includes('music.youtube.com')) {
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PLAY_PAUSE" });
      // Buraya eklenecek: İkonun hemen güncellenmesi için bilgileri yeniden yükle
      updateNowPlayingInfo();
    } else {
      console.warn("Not on a YouTube Music page or tab info is unavailable. Action not performed.");
    }
  });
});

nextButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // !tab veya !tab.url kontrolü eklendi
    if (tab && tab.url && tab.url.includes('music.youtube.com')) {
      chrome.tabs.sendMessage(tab.id, { type: "NEXT_TRACK" });
    } else {
      console.warn("Not on a YouTube Music page or tab info is unavailable. Action not performed.");
    }
  });
});

// Hız slider'ı olay dinleyicisi
slider.addEventListener("input", () => {
  const speed = Math.round(parseFloat(slider.value) * 100) / 100;
  rateTxt.textContent = speed.toFixed(2) + "x";
  // Hızın hatırlanıp hatırlanmayacağı bookmark ikonunun durumuna bağlı
  const remember = filledBookmarkIcon.style.opacity === '1';
  updateSpeed(speed, remember);
  updateSliderFill();
});

// Bookmark ikonuna tıklama olayı
bookmarkIconWrapper.addEventListener("click", (event) => {
  const currentRemember = filledBookmarkIcon.style.opacity === '1';
  const newRemember = !currentRemember;

  // Ripple efekti
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  const rect = bookmarkIconWrapper.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  bookmarkIconWrapper.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());

  // Görseli ve storage'ı güncelle
  updateSpeed(parseFloat(slider.value), newRemember);
  // Bookmark ikonlarının görünürlüğünü güncelle
  if (newRemember) {
    filledBookmarkIcon.style.opacity = '1';
    emptyBookmarkIcon.style.opacity = '0';
  } else {
    filledBookmarkIcon.style.opacity = '0';
    emptyBookmarkIcon.style.opacity = '1';
  }
});

// Speed icon ve slider popup'ın görünürlüğünü yöneten fonksiyonlar
let sliderHoverTimeout; // Fare ayrıldığında gizleme gecikmesi için
let isSliderOpenByClick = false; // Slider'ın tıklama ile açılıp açılmadığını takip eder

const showSlider = () => {
  clearTimeout(sliderHoverTimeout);
  speedSliderPopup.style.display = 'flex'; // Animasyondan önce display'i ayarla
  setTimeout(() => { // Kısa bir gecikme ile opaklık ve görünürlüğü ayarla
    speedSliderPopup.style.opacity = '1';
    speedSliderPopup.style.visibility = 'visible';
  }, 10); // Küçük bir gecikme, tarayıcının display değişikliğini işlemesi için
};

const hideSlider = () => {
  sliderHoverTimeout = setTimeout(() => {
    if (!isSliderOpenByClick) {
      speedSliderPopup.style.opacity = '0';
      speedSliderPopup.style.visibility = 'hidden';
      // Animasyon bittikten sonra display: none yap
      speedSliderPopup.addEventListener('transitionend', function handler() {
        if (speedSliderPopup.style.opacity === '0') {
          speedSliderPopup.style.display = 'none';
        }
        speedSliderPopup.removeEventListener('transitionend', handler);
      });
    }
  }, 300); // Küçük bir gecikme ile kapanma
};

const toggleSliderVisibility = () => {
  if (speedSliderPopup.style.opacity === '1') {
    speedSliderPopup.style.opacity = '0';
    speedSliderPopup.style.visibility = 'hidden';
    // Animasyon bittikten sonra display: none yap
    speedSliderPopup.addEventListener('transitionend', function handler() {
      if (speedSliderPopup.style.opacity === '0') {
        speedSliderPopup.style.display = 'none';
      }
      speedSliderPopup.removeEventListener('transitionend', handler);
    });
    isSliderOpenByClick = false;
  } else {
    speedSliderPopup.style.display = 'flex'; // Animasyondan önce display'i ayarla
    setTimeout(() => { // Kısa bir gecikme ile opaklık ve görünürlüğü ayarla
      speedSliderPopup.style.opacity = '1';
      speedSliderPopup.style.visibility = 'visible';
    }, 10); // Küçük bir gecikme
    isSliderOpenByClick = true;
  }
};

// Event Listeners for Speed Slider
speedIconWrapper.addEventListener("click", toggleSliderVisibility); // Tıklama ile açma/kapatma
speedIconWrapper.addEventListener("mouseenter", showSlider); // Üzerine gelince aç
speedIconWrapper.addEventListener("mouseleave", hideSlider); // Üzerinden ayrılınca gizle (gecikmeli)
speedSliderPopup.addEventListener("mouseenter", showSlider); // Slider üzerine gelince açık kal
speedSliderPopup.addEventListener("mouseleave", hideSlider); // Slider üzerinden ayrılınca gizle (gecikmeli)

// Ayarlar simgesine tıklama olayı
settingsIconContainer.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
});

// Popup açıldığında her zaman arka plan resmini ve parlaklığını yükle
chrome.storage.local.get(['popup_background_image', 'popup_background_brightness'], (data) => {
  const imageUrl = data.popup_background_image;
  const brightness = data.popup_background_brightness ?? 100; // Default to 100% if not set

  // Arka planı backgroundLayer div'ine uygula
  if (imageUrl) {
    backgroundLayer.style.backgroundImage = `url('${imageUrl}')`;
  } else {
    // Eğer kaydedilmiş bir resim yoksa varsayılanı kullan (background.jpg)
    backgroundLayer.style.backgroundImage = `url('${chrome.runtime.getURL("background.jpg")}')`;
  }
  // Parlaklık filtresini backgroundLayer div'ine uygula
  backgroundLayer.style.filter = `brightness(${brightness}%)`;
});


// Popup açıldığında mevcut hızı, şarkı bilgilerini ve arka planı al ve ayarla
// Bu blok artık sadece hız ve şarkı bilgileri ile ilgili işlemleri yapacak.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url || !tab.url.includes('music.youtube.com')) {
    console.log("Not on a YouTube Music page or tab info is unavailable. Popup will show default values.");
    slider.value = 1;
    rateTxt.textContent = "1.00x";
    updateSliderFill();
    updateNowPlayingInfo(); // Şarkı bilgilerini de varsayılan yap
    // Bookmark ikonlarını varsayılan yap
    filledBookmarkIcon.style.opacity = '0';
    emptyBookmarkIcon.style.opacity = '1';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "GET_INFO" }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error("Error sending GET_INFO message:", chrome.runtime.lastError.message);
      slider.value = 1;
      rateTxt.textContent = "1.00x";
      updateSliderFill();
      updateNowPlayingInfo();
      filledBookmarkIcon.style.opacity = '0';
      emptyBookmarkIcon.style.opacity = '1';
      return;
    }

    if (!resp) {
      console.error("No response from content script for GET_INFO.");
      slider.value = 1;
      rateTxt.textContent = "1.00x";
      updateSliderFill();
      updateNowPlayingInfo();
      filledBookmarkIcon.style.opacity = '0';
      emptyBookmarkIcon.style.opacity = '1';
      return;
    }
    const currentSpeed = Math.min(1.6, Math.max(0.1, Number(resp.speed) || 1));
    const rememberState = resp.remember ?? false;

    slider.value = currentSpeed;
    rateTxt.textContent = currentSpeed.toFixed(2) + "x";
    updateSliderFill();
    if (rememberState) {
      filledBookmarkIcon.style.opacity = '1';
      emptyBookmarkIcon.style.opacity = '0';
    } else {
      filledBookmarkIcon.style.opacity = '0';
      emptyBookmarkIcon.style.opacity = '1';
    }
  });

  updateNowPlayingInfo();
  setInterval(updateNowPlayingInfo, 1000);
});