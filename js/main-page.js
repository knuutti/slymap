async function setModalAspectRatio(modalContainer, mapUrl) {
    try {
        const urlParts = mapUrl.split('/');
        const mapDir = urlParts[urlParts.length - 2];
        
        const detailsUrl = `./maps/${mapDir}/details.js`;
        
        const response = await fetch(detailsUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch details.js: ${response.status}`);
        }
        const detailsText = await response.text();
        
        const widthMatch = detailsText.match(/map_image_width_pixels\s*=\s*(\d+)/);
        const heightMatch = detailsText.match(/map_image_height_pixels\s*=\s*(\d+)/);
        
        if (!widthMatch || !heightMatch) {
            console.warn(`Could not find image dimensions for map: ${mapDir}`);
            return;
        }
        
        const imageWidth = parseInt(widthMatch[1]);
        const imageHeight = parseInt(heightMatch[1]);
        const aspectRatio = imageWidth / imageHeight;
        
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        
        const header = modalContainer.querySelector('.map-modal-header');
        const headerHeight = header ? header.offsetHeight : 60;
        
        const maxModalHeight = viewportHeight * 0.85;
        const maxContentHeight = maxModalHeight - headerHeight;
        
        let contentHeight = maxContentHeight;
        let contentWidth = contentHeight * aspectRatio;
        
        const maxContentWidth = viewportWidth * 0.9;
        if (contentWidth > maxContentWidth) {
            contentWidth = maxContentWidth;
            contentHeight = contentWidth / aspectRatio;
        }
        
        const modalWidth = contentWidth;
        const modalHeight = contentHeight + headerHeight;
        
        modalContainer.style.width = `${modalWidth}px`;
        modalContainer.style.height = `${modalHeight}px`;
        modalContainer.style.maxWidth = 'none';
        modalContainer.style.maxHeight = 'none';
        
        const contentArea = modalContainer.querySelector('.map-modal-content');
        if (contentArea) {
            contentArea.style.width = `${contentWidth}px`;
            contentArea.style.height = `${contentHeight}px`;
            contentArea.style.flex = 'none';
        }
        
    } catch (error) {
        console.error('Error setting modal aspect ratio:', error);
    }
}

async function openMap(mapUrl) {
    const button = event.target;
    const originalText = button.textContent;
    
    button.textContent = 'Loading...';
    button.disabled = true;
    
    await createMapModal(mapUrl, () => {
        button.textContent = originalText;
        button.disabled = false;
    });
}

async function createMapModal(mapUrl, onClose) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'map-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="map-modal-container">
            <div class="map-modal-header">
                <h3 class="map-modal-title">Loading Map...</h3>
                <button class="map-modal-close" aria-label="Close map">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="map-modal-content">
                <div class="map-loading">
                    <div class="loading-spinner"></div>
                    <p>Loading interactive map...</p>
                </div>
                <iframe class="map-iframe" src="${mapUrl}" style="display: none;"></iframe>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    const modalContainer = modalOverlay.querySelector('.map-modal-container');
    await setModalAspectRatio(modalContainer, mapUrl);
    
    const closeBtn = modalOverlay.querySelector('.map-modal-close');
    const iframe = modalOverlay.querySelector('.map-iframe');
    const loadingDiv = modalOverlay.querySelector('.map-loading');
    const titleElement = modalOverlay.querySelector('.map-modal-title');
    
    const closeModal = () => {
        modalOverlay.classList.add('closing');
        setTimeout(() => {
            document.body.removeChild(modalOverlay);
            document.body.classList.remove('modal-open');
            if (onClose) onClose();
        }, 300);
    };
    
    closeBtn.addEventListener('click', closeModal);
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
    
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    iframe.addEventListener('load', () => {
        loadingDiv.style.display = 'none';
        iframe.style.display = 'block';
        
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeTitle = iframeDoc.title;
            if (iframeTitle && iframeTitle !== 'Document') {
                titleElement.textContent = iframeTitle;
            } else {
                const mapName = getMapNameFromUrl(mapUrl);
                titleElement.textContent = mapName;
            }
        } catch (e) {
            const mapName = getMapNameFromUrl(mapUrl);
            titleElement.textContent = mapName;
        }
    });
    
    iframe.addEventListener('error', () => {
        loadingDiv.innerHTML = `
            <div class="loading-error">
                <p>Failed to load map</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    });
    
    document.body.classList.add('modal-open');
    
    setTimeout(() => {
        modalOverlay.classList.add('show');
    }, 10);
}

function getMapNameFromUrl(url) {
    const mapNames = {
        'S2E1': 'Paris Hub - Episode 1',
        'S2E2': 'India Hub - Episode 2',
        'S2E4': 'Prague Hub - Episode 4',
        'S2E6': 'Canada Hub - Episode 6',
        'sailing': 'Sailing Map',
        'china': 'China Hub - Episode 1',
        'india': 'India Hub - Episode 2', 
        'outback': 'Outback Hub - Episode 3',
        'kaine': 'Kaine Island - Episode 4',
        'venice': 'Venice Hub - Episode 5',
        'holland': 'Holland Hub - Episode 6',
        'pirates': 'Pirate Ship - Episode 8'
    };
    
    for (const [key, name] of Object.entries(mapNames)) {
        if (url.includes(key)) {
            return name;
        }
    }
    
    return 'Interactive Map';
}

document.addEventListener('DOMContentLoaded', function() {
    // Add click functionality to map cards (excluding coming soon ones)
    const mapCards = document.querySelectorAll('.map-card:not(.coming-soon)');
    
    mapCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on the button
            if (e.target.classList.contains('open-map-btn')) {
                return;
            }
            
            // Find the button in this card and trigger its click
            const button = card.querySelector('.open-map-btn');
            if (button) {
                e.preventDefault();
                // Extract the map URL from the button's onclick attribute
                const onclickAttr = button.getAttribute('onclick');
                const urlMatch = onclickAttr.match(/openMap\('([^']+)'\)/);
                if (urlMatch) {
                    const mapUrl = urlMatch[1];
                    const buttonEvent = { target: button };
                    // Temporarily set the global event for the openMap function
                    window.event = buttonEvent;
                    openMap(mapUrl).catch(console.error);
                }
            }
        });
        
        // Add hover effects
        card.addEventListener('mouseenter', function() {
            if (!document.body.classList.contains('modal-open')) {
                this.style.transform = 'translateY(-8px) scale(1.02)';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            if (!document.body.classList.contains('modal-open')) {
                this.style.transform = 'translateY(0) scale(1)';
            }
        });
    });
    
    // Add smooth scroll for any future navigation
    const smoothScrollLinks = document.querySelectorAll('a[href^="#"]');
    smoothScrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add parallax effect to header
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const header = document.querySelector('.header');
        const parallaxSpeed = 0.5;
        
        if (header) {
            header.style.transform = `translateY(${scrolled * parallaxSpeed}px)`;
        }
    });
    
    // Add staggered animation to game sections
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe game sections for scroll animations
    const gameSections = document.querySelectorAll('.game-section');
    gameSections.forEach(section => {
        observer.observe(section);
    });
    
    // Add keyboard navigation support
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            const focusedElement = document.activeElement;
            if (focusedElement.classList.contains('map-card') && !focusedElement.classList.contains('coming-soon')) {
                e.preventDefault();
                const button = focusedElement.querySelector('.open-map-btn');
                if (button) {
                    // Extract the map URL from the button's onclick attribute
                    const onclickAttr = button.getAttribute('onclick');
                    const urlMatch = onclickAttr.match(/openMap\('([^']+)'\)/);
                    if (urlMatch) {
                        const mapUrl = urlMatch[1];
                        const buttonEvent = { target: button };
                        window.event = buttonEvent;
                        openMap(mapUrl).catch(console.error);
                    }
                }
            }
        }
    });
    
    // Make map cards focusable for accessibility
    mapCards.forEach(card => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Open ${card.querySelector('h3').textContent} map`);
    });
    
    // Add loading indicator for the entire page
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });
});

// Utility function to add loading states
function showLoading(element) {
    element.classList.add('loading');
    element.disabled = true;
}

function hideLoading(element) {
    element.classList.remove('loading');
    element.disabled = false;
}

// Add some interactive effects
document.addEventListener('DOMContentLoaded', function() {
    // Create floating particles effect
    createFloatingParticles();
    
    // Add typing effect to the main title
    addTypingEffect();
});

function createFloatingParticles() {
    const particleContainer = document.createElement('div');
    particleContainer.className = 'particles-container';
    particleContainer.style.position = 'fixed';
    particleContainer.style.top = '0';
    particleContainer.style.left = '0';
    particleContainer.style.width = '100%';
    particleContainer.style.height = '100%';
    particleContainer.style.pointerEvents = 'none';
    particleContainer.style.zIndex = '-1';
    
    document.body.appendChild(particleContainer);
    
    // Create particles
    for (let i = 0; i < 20; i++) {
        createParticle(particleContainer);
    }
}

function createParticle(container) {
    const particle = document.createElement('div');
    particle.style.position = 'absolute';
    particle.style.width = '2px';
    particle.style.height = '2px';
    particle.style.background = 'rgba(0, 212, 255, 0.6)';
    particle.style.borderRadius = '50%';
    particle.style.boxShadow = '0 0 6px rgba(0, 212, 255, 0.8)';
    
    // Random position
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    
    // Random animation duration
    const duration = 10 + Math.random() * 20;
    particle.style.animation = `float ${duration}s linear infinite`;
    
    container.appendChild(particle);
    
    // Add CSS animation if not already added
    if (!document.getElementById('particle-animations')) {
        const style = document.createElement('style');
        style.id = 'particle-animations';
        style.textContent = `
            @keyframes float {
                0% {
                    transform: translateY(100vh) translateX(0px);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100px) translateX(100px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function addTypingEffect() {
    const titleElement = document.querySelector('.title-main');
    if (!titleElement) return;
    
    const originalText = titleElement.textContent;
    titleElement.textContent = '';
    
    let i = 0;
    const typeInterval = setInterval(() => {
        titleElement.textContent += originalText.charAt(i);
        i++;
        
        if (i >= originalText.length) {
            clearInterval(typeInterval);
            // Add cursor blink effect
            titleElement.style.borderRight = '3px solid #00d4ff';
            titleElement.style.animation = 'blink 1s infinite';
            
            // Remove cursor after 3 seconds
            setTimeout(() => {
                titleElement.style.borderRight = 'none';
                titleElement.style.animation = 'none';
            }, 3000);
        }
    }, 100);
    
    // Add blink animation CSS
    if (!document.getElementById('typing-animations')) {
        const style = document.createElement('style');
        style.id = 'typing-animations';
        style.textContent = `
            @keyframes blink {
                0%, 50% { border-color: transparent; }
                51%, 100% { border-color: #00d4ff; }
            }
        `;
        document.head.appendChild(style);
    }
}