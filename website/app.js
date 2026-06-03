document.addEventListener('DOMContentLoaded', () => {

  // GitHub Release configuration
  const githubUser = "23f2004548";
  const githubRepo = "PDF-Studio";
  const releaseVersion = "v1.0.0";
  const releaseBaseUrl = `https://github.com/${githubUser}/${githubRepo}/releases/download/${releaseVersion}/`;

  // Download file mappings per platform
  const downloadFiles = {
    windows: {
      name: releaseBaseUrl + "PDF%20Studio%20Setup%201.0.0.exe",
      text: "Download for Windows",
      helpText: "How to Install (SmartScreen guide)"
    },
    macos: {
      name: releaseBaseUrl + "PDF%20Studio-1.0.0-arm64.dmg",
      text: "Download for macOS (Apple Silicon)",
      helpText: "How to Install & Open"
    },
    "macos-intel": {
      name: releaseBaseUrl + "PDF%20Studio-1.0.0.dmg",
      text: "Download for macOS (Intel)",
      helpText: "How to Install & Open"
    },
    linux: {
      name: releaseBaseUrl + "PDF%20Studio-1.0.0.AppImage",
      text: "Download for Linux",
      helpText: "How to Setup & Run"
    }
  };

  // Installation instructions per platform
  const installInstructions = {
    windows: {
      title: "Installing PDF Studio on Windows",
      description: "Because PDF Studio is distributed directly, Windows SmartScreen will show a warning when running the installer. This is completely normal for independent software. Please follow these steps:",
      steps: [
        { num: "Step 1", text: "Double-click the downloaded <strong>PDF Studio Setup 1.0.0.exe</strong> file." },
        { num: "Step 2", text: "When the SmartScreen prompt pops up (\"Windows protected your PC\"), click on the <strong>\"More Info\"</strong> link under the warning." },
        { num: "Step 3", text: "Click the <strong>\"Run Anyway\"</strong> button that appears at the bottom right to launch the installer safely." }
      ]
    },
    macos: {
      title: "Installing PDF Studio on macOS (Apple Silicon)",
      description: "Because PDF Studio is not downloaded from the App Store, macOS Gatekeeper may show a warning when launching the app. Please follow these steps to open it:",
      steps: [
        { num: "Step 1", text: "Double-click the downloaded <strong>PDF Studio-1.0.0-arm64.dmg</strong> file, and drag the PDF Studio icon into your <strong>Applications</strong> folder." },
        { num: "Step 2", text: "If you see a security warning on launch, open <strong>System Settings > Privacy & Security</strong>." },
        { num: "Step 3", text: "Scroll down to the <strong>Security</strong> section, and click <strong>'Open Anyway'</strong> next to PDF Studio to verify and launch it." }
      ]
    },
    "macos-intel": {
      title: "Installing PDF Studio on macOS (Intel)",
      description: "Because PDF Studio is not downloaded from the App Store, macOS Gatekeeper may show a warning when launching the app. Please follow these steps to open it:",
      steps: [
        { num: "Step 1", text: "Double-click the downloaded <strong>PDF Studio-1.0.0.dmg</strong> file, and drag the PDF Studio icon into your <strong>Applications</strong> folder." },
        { num: "Step 2", text: "If you see a security warning on launch, open <strong>System Settings > Privacy & Security</strong>." },
        { num: "Step 3", text: "Scroll down to the <strong>Security</strong> section, and click <strong>'Open Anyway'</strong> next to PDF Studio to verify and launch it." }
      ]
    },
    linux: {
      title: "Running PDF Studio on Linux",
      description: "PDF Studio is distributed as a portable AppImage. To launch it, you just need to allow executable permissions. Please follow these steps:",
      steps: [
        { num: "Step 1", text: "Locate the downloaded <strong>PDF Studio-1.0.0.AppImage</strong> file and right-click it to open <strong>Properties</strong>." },
        { num: "Step 2", text: "Navigate to the <strong>Permissions</strong> tab and check the box that says <strong>'Allow executing file as program'</strong>." },
        { num: "Step 3", text: "Close the properties window and double-click the file to open. Alternatively, run <code>chmod +x</code> via terminal." }
      ]
    }
  };

  // 1. HELP MODAL CONTROLLER & PLATFORM SWITCHER
  const helpTrigger = document.getElementById('help-trigger-btn');
  const downloadBtn = document.getElementById('download-btn');
  const helpModal = document.getElementById('help-modal');
  const modalClose = document.getElementById('modal-close-btn');
  const modalAck = document.getElementById('modal-ack-btn');

  // DOM elements to control dynamically
  const downloadBtnText = document.getElementById('download-btn-text');
  const footerDownloadBtn = document.getElementById('footer-download-btn');
  const footerDownloadBtnText = document.getElementById('footer-download-btn-text');
  const headerDownloadBtn = document.getElementById('header-download-btn');
  const helpBtnText = document.getElementById('help-btn-text');
  
  const modalTitle = document.getElementById('modal-title');
  const modalDescription = document.getElementById('modal-description');
  const modalStepsContainer = document.getElementById('modal-steps-container');

  let currentPlatform = 'windows'; // fallback default

  // OS detection
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platformStr = window.navigator.platform.toLowerCase();
  
  if (userAgent.indexOf('mac') !== -1 || platformStr.indexOf('mac') !== -1) {
    currentPlatform = 'macos';
  } else if (userAgent.indexOf('linux') !== -1 || platformStr.indexOf('linux') !== -1) {
    currentPlatform = 'linux';
  }

  function updatePlatformUI(platform) {
    currentPlatform = platform;
    const fileData = downloadFiles[platform];
    if (!fileData) return;

    // Update main buttons href
    if (downloadBtn) downloadBtn.setAttribute('href', fileData.name);
    if (footerDownloadBtn) footerDownloadBtn.setAttribute('href', fileData.name);
    if (headerDownloadBtn) headerDownloadBtn.setAttribute('href', fileData.name);

    // Update main buttons text
    if (downloadBtnText) downloadBtnText.textContent = fileData.text;
    if (footerDownloadBtnText) footerDownloadBtnText.textContent = fileData.text;
    if (helpBtnText) helpBtnText.textContent = fileData.helpText;

    // Toggle active platform class for links
    document.querySelectorAll('.alt-link').forEach(link => {
      if (link.getAttribute('data-platform') === platform) {
        link.classList.add('active-platform');
      } else {
        link.classList.remove('active-platform');
      }
    });

    // Populate modal contents
    const info = installInstructions[platform];
    if (info) {
      if (modalTitle) modalTitle.textContent = info.title;
      if (modalDescription) modalDescription.innerHTML = info.description;
      if (modalStepsContainer) {
        modalStepsContainer.innerHTML = info.steps.map(step => `
          <div class="step-card">
            <div class="step-num">${step.num}</div>
            <p>${step.text}</p>
          </div>
        `).join('');
      }
    }
  }

  // Run initial setup based on detected user OS
  updatePlatformUI(currentPlatform);

  // Setup click listeners for manual switcher links
  document.querySelectorAll('.alt-link').forEach(link => {
    link.addEventListener('click', (e) => {
      // Update UI state (href is followed naturally to trigger download)
      const platformSelected = link.getAttribute('data-platform');
      updatePlatformUI(platformSelected);
    });
  });

  function openHelpModal(e) {
    if (e) e.preventDefault();
    helpModal.classList.add('active');
  }

  function closeHelpModal() {
    helpModal.classList.remove('active');
  }

  if (helpTrigger) helpTrigger.addEventListener('click', openHelpModal);
  if (modalClose) modalClose.addEventListener('click', closeHelpModal);
  
  if (modalAck) {
    modalAck.addEventListener('click', () => {
      closeHelpModal();
      // Start download for the current platform
      window.location.href = downloadFiles[currentPlatform].name;
    });
  }

  // Close modal on clicking overlay background
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        closeHelpModal();
      }
    });
  }

  // 2. INTERACTIVE DEMO CONTROLLER
  const zoomIndicator = document.querySelector('.demo-zoom-indicator');
  const pdfPage = document.querySelector('.demo-pdf-page');
  const zoomControls = document.querySelectorAll('.btn-ctrl');
  const colorDots = document.querySelectorAll('.color-dot');
  const demoHighlight = document.querySelector('.demo-highlight');

  // Zoom control interaction
  zoomControls.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active states
      zoomControls.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const scale = btn.getAttribute('data-zoom');
      zoomIndicator.textContent = `${scale}%`;

      // Update zoom classes
      pdfPage.classList.remove('zoom-100', 'zoom-125', 'zoom-150');
      pdfPage.classList.add(`zoom-${scale}`);
    });
  });

  // Color picker highlight interaction
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');

      const color = dot.getAttribute('data-color');
      
      // Update highlight colors
      demoHighlight.classList.remove('yellow', 'green', 'blue', 'pink');
      demoHighlight.classList.add(color);
    });
  });

  // Click on the highlight directly changes color sequentially
  if (demoHighlight) {
    demoHighlight.addEventListener('click', () => {
      const colors = ['yellow', 'green', 'blue', 'pink'];
      let currentIdx = colors.findIndex(c => demoHighlight.classList.contains(c));
      let nextIdx = (currentIdx + 1) % colors.length;
      
      // Update dot active state
      colorDots.forEach(d => {
        d.classList.remove('active');
        if (d.getAttribute('data-color') === colors[nextIdx]) {
          d.classList.add('active');
        }
      });

      // Update highlight
      demoHighlight.classList.remove(...colors);
      demoHighlight.classList.add(colors[nextIdx]);
    });
  }

  // 3. BACKGROUND BLOB MOUSE PARALLAX
  const blobs = document.querySelectorAll('.blob');
  window.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX / window.innerWidth - 0.5;
    const mouseY = e.clientY / window.innerHeight - 0.5;
    
    blobs.forEach((blob, idx) => {
      const factor = (idx + 1) * 30; // parallax sensitivity
      const x = mouseX * factor;
      const y = mouseY * factor;
      blob.style.transform = `translate(${x}px, ${y}px)`;
    });
  });

  // 4. SCROLL REVEAL OBSERVER
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // Reveal only once
      }
    });
  }, {
    threshold: 0.15
  });

  revealElements.forEach(el => revealObserver.observe(el));
});
