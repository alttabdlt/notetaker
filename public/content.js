console.log("Content script loaded");

// Check if the script is already running
if (window.webSnipperContentScriptLoaded) {
  console.log("Web Snipper content script already loaded. Exiting.");
} else {
  window.webSnipperContentScriptLoaded = true;

  console.log("Content script loaded");

  function captureImage(img) {
    if (!img) {
      console.error("Image element not found");
      return "[Image: Not found]";
    }

    const src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(' ')[0] || 'No source';

    // For YouTube images, we'll use a special format
    if (window.location.hostname.includes('youtube.com')) {
      return `[YouTubeImage: ${src}]`;
    }

    // For other images, try to convert to data URL
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const dataUrl = canvas.toDataURL('image/png');
      return `[Image: ${dataUrl}]`;
    } catch (e) {
      console.error("Error converting image to data URL:", e);
      return `[Image: ${src}]`;
    }
  }

  function notifyBackgroundScript() {
    console.log("Attempting to notify background script");
    chrome.runtime.sendMessage({ action: "contentScriptReady" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Error notifying background script:", chrome.runtime.lastError.message);
        // Retry after a short delay
        setTimeout(notifyBackgroundScript, 1000);
      } else {
        console.log("Background script notified successfully");
      }
    });
  }

  notifyBackgroundScript();

  function captureElement(element) {
    if (element.nodeType === Node.TEXT_NODE) {
      return element.textContent;
    }

    switch (element.tagName.toLowerCase()) {
      case 'table':
        return captureTable(element);
      case 'video':
        return captureVideo(element);
      case 'audio':
        return captureAudio(element);
      case 'a':
        return captureHyperlink(element);
      case 'pre':
      case 'code':
        return captureCodeSnippet(element);
      case 'form':
      case 'button':
        return captureInteractiveElement(element);
      case 'ol':
      case 'ul':
        return captureList(element);
      case 'svg':
        return captureSVG(element);
      case 'iframe':
        return captureIframe(element);
      case 'cite':
      case 'blockquote':
        return captureCitation(element);
      default:
        if (element.querySelector('script[type="math/tex"]')) {
          return captureMathJax(element);
        }
        if (element.querySelector('img')) {
          return captureImage(element.querySelector('img'));
        }
        return element.innerText;
    }
  }

  function captureTable(table) {
    const rows = Array.from(table.rows).map(row => 
      Array.from(row.cells).map(cell => cell.innerText.trim()).join(' | ')
    );
    return `[Table:\n${rows.join('\n')}\n]`;
  }

  function captureVideo(video) {
    const src = video.src || video.querySelector('source')?.src || '';
    return `[Video: ${src}]`;
  }

  function captureAudio(audio) {
    const src = audio.src || audio.querySelector('source')?.src || '';
    return `[Audio: ${src}]`;
  }

  function captureHyperlink(link) {
    return `[Link: ${link.textContent.trim()} (${link.href})]`;
  }

  function captureCodeSnippet(code) {
    return `[Code Snippet:\n${code.innerText.trim()}\n]`;
  }

  function captureInteractiveElement(element) {
    return `[Interactive Element: ${element.tagName.toLowerCase()}]`;
  }

  function captureList(list) {
    const items = Array.from(list.querySelectorAll('li')).map(li => li.innerText.trim());
    return `[${list.tagName === 'OL' ? 'Ordered' : 'Unordered'} List:\n${items.join('\n')}\n]`;
  }

  function captureSVG(svg) {
    return `[SVG Graphic: ${svg.outerHTML}]`;
  }

  function captureIframe(iframe) {
    return `[Embedded content: ${iframe.src}]`;
  }

  function captureCitation(cite) {
    return `[Citation: ${cite.innerText.trim()}]`;
  }

  function captureMathJax(element) {
    const math = element.querySelector('script[type="math/tex"]')?.textContent || '';
    return `[Math: ${math}]`;
  }

  function captureMetadata() {
    const metadata = {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content,
      author: document.querySelector('meta[name="author"]')?.content,
      publishedDate: document.querySelector('meta[name="published_date"]')?.content,
    };
    return JSON.stringify(metadata);
  }

  let highlightedContent = "";

  document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    
    highlightedContent = Array.from(fragment.childNodes)
      .map(node => captureElement(node))
      .join('\n');

    console.log("Highlighted content:", highlightedContent);
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    if (request.action === "snip") {
      console.log("Snip action received in content script");
      let snippedContent;

      try {
        if (request.info.selectionText) {
          snippedContent = request.info.selectionText;
        } else if (request.info.mediaType === "image") {
          // Try to find the image using multiple selectors
          const img = document.querySelector(`img[src="${request.info.srcUrl}"]`) ||
                      document.querySelector(`img[data-src="${request.info.srcUrl}"]`) ||
                      Array.from(document.images).find(img => img.src === request.info.srcUrl || img.currentSrc === request.info.srcUrl);
          
          if (!img) {
            console.error("Image not found with src:", request.info.srcUrl);
            snippedContent = "[Image: Not found]";
          } else {
            snippedContent = captureImage(img);
          }
        } else if (request.info.x != null && request.info.y != null && 
                   isFinite(request.info.x) && isFinite(request.info.y)) {
          const element = document.elementFromPoint(request.info.x, request.info.y);
          if (element) {
            snippedContent = captureElement(element);
          } else {
            throw new Error("No element found at the specified coordinates");
          }
        } else {
          // If no coordinates or selection, try to capture the clicked element
          const clickedElement = document.activeElement || document.body;
          snippedContent = captureElement(clickedElement);
        }

        if (!snippedContent) {
          throw new Error("Failed to capture content");
        }

        const snip = {
          content: snippedContent,
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
          metadata: captureMetadata(),
        };
        console.log("Sending snip to background:", snip);
        sendResponse({ success: true, snip: snip });
      } catch (error) {
        console.error("Error creating snip:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Indicates that the response is asynchronous
    }
  });

  console.log("Content script setup complete");

  // Add testSnip function to window object
  window.testSnip = function() {
    const snip = {
      content: "Test snip",
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      metadata: captureMetadata(),
    };
    console.log("Sending test snip to background:", snip);
    chrome.runtime.sendMessage({ action: "saveSnip", snip: snip }, (response) => {
      console.log("Response from background:", response);
    });
  };

  console.log("testSnip function added to window object");

  // Notify the background script that the content script is ready
  chrome.runtime.sendMessage({ action: "contentScriptReady" }, (response) => {
    console.log("Background script acknowledged content script is ready:", response);
  });
}