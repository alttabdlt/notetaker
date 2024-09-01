let messageQueue = {};
let tabsWithContentScript = new Set();

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
  chrome.contextMenus.create({
    id: "snip",
    title: "Snip this content",
    contexts: ["all"]
  });
});

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    if (tabsWithContentScript.has(tabId)) {
      console.log("Content script already injected for tab:", tabId);
      resolve();
    } else {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Error injecting content script:", chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log("Content script injected successfully for tab:", tabId);
          tabsWithContentScript.add(tabId);
          resolve();
        }
      });
    }
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Message response timeout"));
    }, 5000); // 5 second timeout

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        console.error("Error sending message:", chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.log("Message sent successfully, response:", response);
        resolve(response);
      }
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "snip") {
    console.log("Context menu item clicked for tab:", tab.id);
    injectContentScript(tab.id)
      .then(() => {
        const message = { 
          action: "snip", 
          info: {
            ...info,
            x: info.x,
            y: info.y
          }
        };
        return sendMessageToTab(tab.id, message);
      })
      .then((response) => {
        console.log("Snip action completed, response:", response);
        if (response && response.success && response.snip) {
          return saveSnip(response.snip);
        } else {
          throw new Error(response.error || "Failed to create snip");
        }
      })
      .catch((error) => {
        console.error("Error during snip action:", error.message, error.stack);
        // Here you might want to show an error notification to the user
      });
  }
});

function saveSnip(snip) {
  return new Promise((resolve, reject) => {
    if (!snip) {
      reject(new Error("Snip object is null or undefined"));
      return;
    }
    if (!snip.content) {
      reject(new Error("Snip content is missing"));
      return;
    }
    chrome.storage.local.get({ snips: [] }, (result) => {
      const snips = result.snips.filter(s => s && s.content); // Filter out invalid snips
      snips.push(snip);
      chrome.storage.local.set({ snips: snips }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log("Snip saved. Total snips:", snips.length);
          resolve();
        }
      });
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);
  if (request.action === "saveSnip") {
    saveSnip(request.snip)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Indicates that the response is asynchronous
  } else if (request.action === "contentScriptReady") {
    console.log("Content script ready in tab:", sender.tab.id);
    tabsWithContentScript.add(sender.tab.id);
    sendResponse({ received: true });
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log("Tab closed:", tabId);
  tabsWithContentScript.delete(tabId);
  delete messageQueue[tabId];
});

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked for tab:", tab.id);
  chrome.action.openPopup();
});