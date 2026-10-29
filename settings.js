document.addEventListener('DOMContentLoaded', () => {
  const imageUpload = document.getElementById('imageUpload');
  const imageUrlInput = document.getElementById('imageUrl');
  const applyFileBtn = document.getElementById('applyFileBtn');
  const applyUrlBtn = document.getElementById('applyUrlBtn');
  const clearBackgroundBtn = document.getElementById('clearBackgroundBtn');
  const previewImage = document.getElementById('previewImage');
  const messageElement = document.getElementById('message');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessValueSpan = document.getElementById('brightnessValue');

  chrome.storage.local.get(['popup_background_image', 'popup_background_brightness'], (data) => {
    const savedImage = data.popup_background_image;
    const savedBrightness = data.popup_background_brightness ?? 100; // Default to 100%

    if (savedImage) {
      previewImage.src = savedImage;
      previewImage.style.display = 'block';
      if (savedImage.startsWith('data:')) {
        // Bu bir base64 veri URL'si, dosya yükleme alanını sıfırla
        imageUpload.value = '';
        imageUrlInput.value = '';
      } else {
        // Bu bir URL
        imageUrlInput.value = savedImage;
        imageUpload.value = '';
      }
    } else {
      previewImage.style.display = 'none';
    }

    brightnessSlider.value = savedBrightness;
    brightnessValueSpan.textContent = `${savedBrightness}%`;
    previewImage.style.filter = `brightness(${savedBrightness}%)`;
  });

  // Mesaj gösterici
  function showMessage(msg, isError = false) {
    messageElement.textContent = msg;
    messageElement.style.color = isError ? '#ff0000' : '#4CAF50';
    setTimeout(() => {
      messageElement.textContent = '';
    }, 3000);
  }

  applyFileBtn.addEventListener('click', () => {
    const file = imageUpload.files[0];
    if (file) {
      if (file.type === 'image/jpeg' || file.type === 'image/png') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const imageDataUrl = e.target.result;
          chrome.storage.local.set({ popup_background_image: imageDataUrl }, () => {
            showMessage('Background set succesfully!');
            previewImage.src = imageDataUrl;
            previewImage.style.display = 'block';
            imageUrlInput.value = '';
            previewImage.style.filter = `brightness(${brightnessSlider.value}%)`;
          });
        };
        reader.readAsDataURL(file);
      } else {
        showMessage('Please upload a JPG / PNG file.', true);
      }
    } else {
      showMessage('Please upload a file.', true);
    }
  });

  applyUrlBtn.addEventListener('click', () => {
    const imageUrl = imageUrlInput.value.trim();
    if (imageUrl) {
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        showMessage('Please insert URL (http://... ).', true);
        return;
      }

      chrome.storage.local.set({ popup_background_image: imageUrl }, () => {
        showMessage('Background set succesfully!');
        previewImage.src = imageUrl;
        previewImage.style.display = 'block';
        imageUpload.value = '';
        previewImage.style.filter = `brightness(${brightnessSlider.value}%)`;
      });
    } else {
      showMessage('Please insert URL (http://... ).', true);
    }
  });

  clearBackgroundBtn.addEventListener('click', () => {
    chrome.storage.local.remove('popup_background_image', () => {
      showMessage('Arka plan temizlendi!');
      previewImage.src = '';
      previewImage.style.display = 'none';
      imageUpload.value = '';
      imageUrlInput.value = '';
      brightnessSlider.value = 100;
      brightnessValueSpan.textContent = '100%';
      previewImage.style.filter = 'brightness(100%)';
      chrome.storage.local.set({ popup_background_brightness: 100 });
    });
  });

  imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.style.display = 'block';
        previewImage.style.filter = `brightness(${brightnessSlider.value}%)`;
      };
      reader.readAsDataURL(file);
    } else {
      previewImage.src = '';
      previewImage.style.display = 'none';
    }
  });

  imageUrlInput.addEventListener('input', () => {
    const url = imageUrlInput.value.trim();
    if (url) {
      previewImage.src = url;
      previewImage.style.display = 'block';
      previewImage.style.filter = `brightness(${brightnessSlider.value}%)`;
    } else {
      previewImage.src = '';
      previewImage.style.display = 'none';
    }
  });

  brightnessSlider.addEventListener('input', (event) => {
    const brightness = event.target.value;
    brightnessValueSpan.textContent = `${brightness}%`;
    previewImage.style.filter = `brightness(${brightness}%)`;
    chrome.storage.local.set({ popup_background_brightness: brightness }).catch(error => {
      console.error("Error saving brightness:", error);
    });
  });
});