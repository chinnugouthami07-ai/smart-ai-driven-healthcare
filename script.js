// API Configuration
const API_BASE_URL = 'https://fallertrack-be.my.id';

// State
let map = null;
let homeMarker = null;
let currentMarker = null;
let isNavigating = false;
let audioUrl = '';
let updateInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    startDataUpdates();
    loadLogs();
});

// Navigation
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function showPage(pageId, navLink) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    document.getElementById(pageId).classList.add('active');

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    navLink.classList.add('active');

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }

    // Refresh map if dashboard
    if (pageId === 'dashboard' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
}

// Map Functions
function initMap() {
    const defaultCenter = [-5.3388405, 105.3268809];

    map = L.map('map').setView(defaultCenter, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function updateMap(homeLocation, currentLocation) {
    if (!map) return;

    // Clear existing markers
    if (homeMarker) map.removeLayer(homeMarker);
    if (currentMarker) map.removeLayer(currentMarker);

    // Add home marker
    if (homeLocation) {
        const homeIcon = L.divIcon({
            html: '<div style="background:#3b82f6;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">🏠</div>',
            className: 'custom-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        homeMarker = L.marker([homeLocation.latitude, homeLocation.longitude], { icon: homeIcon })
            .addTo(map)
            .bindPopup(`<strong>Home</strong><br>${homeLocation.nama || 'Home Location'}<br>Radius: ${homeLocation.radius}m`);

        // Add circle for safe zone
        L.circle([homeLocation.latitude, homeLocation.longitude], {
            radius: homeLocation.radius,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.1
        }).addTo(map);
    }

    // Add current location marker
    if (currentLocation) {
        const currentIcon = L.divIcon({
            html: '<div style="background:#10b981;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">📍</div>',
            className: 'custom-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        currentMarker = L.marker([currentLocation.latitude, currentLocation.longitude], { icon: currentIcon })
            .addTo(map)
            .bindPopup(`<strong>Current Location</strong><br>Distance: ${Math.round(currentLocation.distance)}m`);

        map.panTo([currentLocation.latitude, currentLocation.longitude]);
    }
}

// API Functions
async function fetchWithError(url, options = {}) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
}

// Data Updates
function startDataUpdates() {
    updateDashboard();
    updateInterval = setInterval(updateDashboard, 5000);
}

async function updateDashboard() {
    try {
        // Fetch all data in parallel
        const [home, current, fall] = await Promise.allSettled([
            fetchWithError('/api/home'),
            fetchWithError('/api/current-distance'),
            fetchWithError('/api/fall-notification')
        ]);

        // Update Home Status
        if (home.status === 'fulfilled') {
            document.getElementById('home-status').textContent = 'Set';
            document.getElementById('home-address').textContent = home.value.nama || 'Home configured';
            updateMap(home.value, current.status === 'fulfilled' ? current.value : null);
        } else {
            document.getElementById('home-status').textContent = 'Not Set';
            document.getElementById('home-address').textContent = 'Configure in settings';
        }

        // Update Current Location
        if (current.status === 'fulfilled') {
            const data = current.value;
            document.getElementById('current-distance').textContent = `${Math.round(data.distance)}m`;
            document.getElementById('location-status').textContent = data.isWithinRange ? 'Within safe zone' : 'Outside safe zone';
            document.getElementById('location-status').style.color = data.isWithinRange ? '#10b981' : '#ef4444';
            document.getElementById('last-update').textContent = new Date(data.time).toLocaleString();

            // Update Navigation Status
            if (data.navigationStatus) {
                document.getElementById('nav-status').textContent = data.navigationStatus.onRoute ? 'On Route' : 'Off Route';
                document.getElementById('nav-instruction').textContent = data.navigationStatus.instruction || 'No active navigation';
            }
        }

        // Update Fall Status
        if (fall.status === 'fulfilled' && fall.value.fallStatus?.detected) {
            document.getElementById('fall-status').textContent = 'DETECTED';
            document.getElementById('fall-status').style.color = '#ef4444';
            document.getElementById('fall-time').textContent = new Date(fall.value.fallStatus.timestamp).toLocaleString();
            document.getElementById('fall-card').classList.add('alert');
        } else {
            document.getElementById('fall-status').textContent = 'Clear';
            document.getElementById('fall-status').style.color = '#0f172a';
            document.getElementById('fall-time').textContent = 'No incidents';
            document.getElementById('fall-card').classList.remove('alert');
        }

    } catch (error) {
        console.error('Dashboard update error:', error);
    }
}

// Navigation Functions
async function toggleNavigation() {
    const btn = document.getElementById('nav-btn');
    const btnText = document.getElementById('nav-btn-text');
    const idleView = document.getElementById('nav-idle');
    const activeView = document.getElementById('active-nav');
    const statusValue = document.getElementById('nav-info-status');

    if (!isNavigating) {
        // Start navigation
        try {
            await fetchWithError('/api/navigation', { method: 'POST' });
            isNavigating = true;

            idleView.style.display = 'none';
            activeView.style.display = 'block';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-danger');
            btnText.textContent = 'Stop Navigation';
            statusValue.textContent = 'Active';
            statusValue.classList.add('active');

            // Get first instruction
            updateInstruction();
        } catch (error) {
            alert('Failed to start navigation: ' + error.message);
        }
    } else {
        // Stop navigation
        isNavigating = false;

        idleView.style.display = 'block';
        activeView.style.display = 'none';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        btnText.textContent = 'Start Navigation';
        statusValue.textContent = 'Idle';
        statusValue.classList.remove('active');
    }
}

async function updateInstruction() {
    if (!isNavigating) return;

    try {
        const speech = await fetchWithError('/api/speech/text-to-speech');
        if (speech.text) {
            document.getElementById('instruction-text').textContent = speech.text;
            document.getElementById('distance-text').textContent = speech.meters > 0 ? `${speech.meters} meters ahead` : '';
            audioUrl = speech.downloadUrl;
        }
    } catch (error) {
        console.error('Instruction error:', error);
    }
}

function playInstruction() {
    if (audioUrl) {
        const audio = new Audio(`${API_BASE_URL}${audioUrl}`);
        audio.play();
    }
}

// Emergency Functions
async function handleSOS() {
    const btn = document.getElementById('sos-btn');
    const text = document.getElementById('sos-text');

    try {
        await fetchWithError('/api/alert', {
            method: 'POST',
            body: JSON.stringify({ sos: true })
        });

        btn.classList.add('active');
        text.textContent = 'SOS ACTIVE';

        // Find emergency services
        const services = await fetchWithError('/api/sos-location', {
            method: 'POST',
            body: JSON.stringify({ radius: 5000 })
        });

        displayServices(services.results || []);

    } catch (error) {
        alert('SOS Error: ' + error.message);
    }
}

function displayServices(services) {
    const container = document.getElementById('services-list');

    if (services.length === 0) {
        container.innerHTML = `
            <div class="no-services">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <p>No emergency services found nearby</p>
            </div>`;
        return;
    }

    container.innerHTML = services.map(service => `
        <div class="service-item">
            <div class="service-info">
                <h4>${service.name}</h4>
                <p>${service.vicinity}</p>
                ${service.rating ? `<span class="rating">★ ${service.rating}</span>` : ''}
            </div>
            <button class="btn btn-primary btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                Call
            </button>
        </div>
    `).join('');
}

async function testFallDetection() {
    try {
        // Simulate fall with high acceleration/gyro values
        const result = await fetchWithError('/api/fall-detection', {
            method: 'POST',
            body: JSON.stringify({
                accelero: [90.8, 0.1, 0.1],
                gyro: [100.1, 0.2, 0.3]
            })
        });

        if (result.status) {
            document.getElementById('accel-status').textContent = 'ALERT';
            document.getElementById('accel-status').style.color = '#ef4444';
            document.getElementById('gyro-status').textContent = 'ALERT';
            document.getElementById('gyro-status').style.color = '#ef4444';

            alert('Fall detected! Emergency services notified.');

            // Reset after 3 seconds
            setTimeout(() => {
                document.getElementById('accel-status').textContent = 'Normal';
                document.getElementById('accel-status').style.color = '#10b981';
                document.getElementById('gyro-status').textContent = 'Normal';
                document.getElementById('gyro-status').style.color = '#10b981';
            }, 3000);
        }
    } catch (error) {
        alert('Test failed: ' + error.message);
    }
}

// Logs Functions
async function loadLogs() {
    try {
        const data = await fetchWithError('/api/log-history?limit=50');
        const tbody = document.getElementById('logs-tbody');

        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-cell">
                        <div class="empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <line x1="10" y1="9" x2="8" y2="9"/>
                            </svg>
                            <p>No activity logs available</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = data.logs.map(log => `
            <tr>
                <td>${new Date(log.timestamp || log.time).toLocaleString()}</td>
                <td>${log.event || log.type || 'N/A'}</td>
                <td>${log.details || log.message || 'N/A'}</td>
                <td><span class="status-badge ${log.severity === 'high' ? 'status-danger' : 'status-normal'}">${log.severity || 'Normal'}</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}