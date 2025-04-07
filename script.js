/**
 * TaskDestiny Web App
 * Author: Surya Kiran Reddy Vanukuri
 * License: MIT
 * Description: Location-based task planner with route visualization, task filtering, and Firebase integration.
 * Year: 2025
 */

const OPENCAGE_API_KEY = "ba9029f2300b4ffb838129b14ab86573";
const ORS_API_KEY = "5b3ce3597851110001cf6248388d85dc7f2b4cda9d7ac36e231d1264";

let map;
let currentLat = null;
let currentLng = null;
let routePolyline = null;
let currentTaskMarkers = [];

// Initialize map and get current location
navigator.geolocation.getCurrentPosition(position => {
  currentLat = position.coords.latitude;
  currentLng = position.coords.longitude;

  map = L.map("map").setView([currentLat, currentLng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  L.marker([currentLat, currentLng]).addTo(map).bindPopup("You are here").openPopup();

  loadTasksByStatus("pending"); // Load pending tasks by default
}, () => {
  alert("Failed to get location.");
});

// Universal function to load tasks by status
async function loadTasksByStatus(status = "pending") {
  clearTaskMarkers(); // Remove existing task markers first

  const snapshot = await window.getDocs(window.collection(window.db, "tasks"));

  snapshot.forEach(doc => {
    const task = doc.data();
    if (task.status === status) {
      const marker = L.marker([task.lat, task.lng], {
        icon: status === "completed" ? greenIcon() : defaultIcon()
      }).addTo(map);

      // Popup box
      const popup = document.createElement("div");
      popup.innerHTML = `<b>${task.title}</b><br>Status: ${task.status}`;

      // Add completion button for pending tasks
      if (status === "pending") {
        const btn = document.createElement("button");
        btn.textContent = "✅ Mark as Completed";
        btn.style.marginTop = "5px";
        btn.style.cursor = "pointer";
        btn.onclick = async () => {
          await markTaskCompleted(doc.id);
          map.removeLayer(marker);
        };
        popup.appendChild(btn);
      }

      marker.bindPopup(popup);
      currentTaskMarkers.push(marker);
    }
  });
}

// Clear all current task markers from the map
function clearTaskMarkers() {
  currentTaskMarkers.forEach(marker => map.removeLayer(marker));
  currentTaskMarkers = [];
}

// Update a task’s status to “completed”
async function markTaskCompleted(taskId) {
  const projectId = "taskdestiny-8e819";
  const allDocs = await window.getDocs(window.collection(window.db, "tasks"));
  const taskDoc = allDocs.docs.find(doc => doc.id === taskId);
  if (!taskDoc) return;

  const docPath = taskDoc.ref.path;

  await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}?updateMask.fieldPaths=status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { status: { stringValue: "completed" } } })
  });
}

//  Add a task with location and description
document.getElementById("taskForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const place = document.getElementById("placeInput").value;
  const task = document.getElementById("taskInput").value;

  const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(place)}&key=${OPENCAGE_API_KEY}`);
  const data = await response.json();

  if (data.results.length > 0) {
    const loc = data.results[0].geometry;

    L.marker([loc.lat, loc.lng])
      .addTo(map)
      .bindPopup(`<b>${task}</b><br>${place}`)
      .openPopup();

    await window.addDoc(window.collection(window.db, "tasks"), {
      title: task,
      lat: loc.lat,
      lng: loc.lng,
      status: "pending",
      created_at: new Date().toISOString()
    });

    document.getElementById("placeInput").value = "";
    document.getElementById("taskInput").value = "";
  } else {
    alert("Place not found!");
  }
});

// Plan route with animated drawing and show nearby tasks
document.getElementById("routeForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const destination = document.getElementById("destinationInput").value;

  const geoResponse = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(destination)}&key=${OPENCAGE_API_KEY}`);
  const geoData = await geoResponse.json();

  if (geoData.results.length === 0) {
    alert("Destination not found!");
    return;
  }

  const destLat = geoData.results[0].geometry.lat;
  const destLng = geoData.results[0].geometry.lng;

  const routeResponse = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Authorization": ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [
        [currentLng, currentLat],
        [destLng, destLat]
      ]
    })
  });

  const routeData = await routeResponse.json();
  const coords = routeData.features[0].geometry.coordinates;

  if (routePolyline) map.removeLayer(routePolyline);

  animateRoute(coords.map(c => [c[1], c[0]])); // Animate route line

  showTasksAlongRoute(coords);
});

// Haversine formula to calculate distance between 2 geo-points
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Show tasks near the route
function showTasksAlongRoute(routeCoords) {
  window.getDocs(window.collection(window.db, "tasks")).then(snapshot => {
    snapshot.forEach(doc => {
      const task = doc.data();
      if (task.status === "pending") {
        for (let i = 0; i < routeCoords.length; i++) {
          const dist = getDistance(task.lat, task.lng, routeCoords[i][1], routeCoords[i][0]);
          if (dist <= 1000) {
            const marker = L.marker([task.lat, task.lng]).addTo(map);
            const div = document.createElement("div");
            div.innerHTML = `<b>${task.title}</b><br>📍 Near your route`;

            const btn = document.createElement("button");
            btn.textContent = "✅ Mark as Completed";
            btn.style.marginTop = "5px";
            btn.style.cursor = "pointer";

            btn.onclick = async () => {
              await markTaskCompleted(doc.id);
              map.removeLayer(marker);
            };

            div.appendChild(btn);
            marker.bindPopup(div);
            break;
          }
        }
      }
    });
  });
}

// Animate polyline (draw route line point by point)
function animateRoute(latlngs) {
  let index = 0;
  const animatedLine = L.polyline([], { color: 'blue' }).addTo(map);
  routePolyline = animatedLine;

  const interval = setInterval(() => {
    if (index < latlngs.length) {
      animatedLine.addLatLng(latlngs[index]);
      index++;
    } else {
      clearInterval(interval);
    }
  }, 20); // speed: 20ms per point
}

// Create marker icon for "completed" tasks
function greenIcon() {
  return L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/190/190411.png",
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
}

// Default blue icon
function defaultIcon() {
  return L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41]
  });
}

// Tab switching for Pending / Completed
document.getElementById("showPending").addEventListener("click", () => {
  activateTab("showPending");
  loadTasksByStatus("pending");
});

document.getElementById("showCompleted").addEventListener("click", () => {
  activateTab("showCompleted");
  loadTasksByStatus("completed");
});

// Highlight the active tab
function activateTab(activeId) {
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.classList.remove("active");
  });
  document.getElementById(activeId).classList.add("active");
}
