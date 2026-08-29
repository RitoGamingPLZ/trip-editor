<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import seed from './itinerary.js'

const KEY = 'van-trip'
const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
const days = ref(saved?.days ?? seed)
const places = ref(saved?.places ?? []) // saved location library
const dayIdx = ref(0)
const day = computed(() => days.value[dayIdx.value])
const query = ref('')
const results = ref([])
const searching = ref(false)
const error = ref('')

watch([days, places], () => localStorage.setItem(KEY, JSON.stringify({ days: days.value, places: places.value })), { deep: true })

// --- itinerary edits ---
const addStop = (stop = {}) => day.value.stops.push({ time: '', place: 'New stop', note: '', lat: null, lng: null, ...stop })
const removeStop = (i) => day.value.stops.splice(i, 1)
// drag & drop reorder (native HTML5 DnD)
const dragFrom = ref(null)
const drop = (to) => {
  const from = dragFrom.value
  dragFrom.value = null
  if (from == null || from === to) return
  const [s] = day.value.stops.splice(from, 1)
  day.value.stops.splice(to, 0, s)
}
const addDay = () => { days.value.push({ date: 'New day', stops: [] }); dayIdx.value = days.value.length - 1 }
const removeDay = () => { if (days.value.length > 1 && confirm(`Delete ${day.value.date}?`)) { days.value.splice(dayIdx.value, 1); dayIdx.value = Math.max(0, dayIdx.value - 1) } }
const reset = () => { if (confirm('Reset to the original itinerary? Saved places are kept.')) days.value = structuredClone(seed) }

// --- saved places library ---
const savePlace = (r) => { if (!places.value.some(p => p.lat === r.lat && p.lng === r.lng)) places.value.push({ ...r }) }
const removePlace = (i) => places.value.splice(i, 1)
const addFromLibrary = (p) => addStop({ place: p.place, note: p.address, lat: p.lat, lng: p.lng })

// --- Leaflet + OpenStreetMap (no API key) ---
let map, polyline, layer
const mapEl = ref(null)
const numIcon = (n) => L.divIcon({ className: 'pin', html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })

onMounted(() => {
  map = L.map(mapEl.value).setView([49.28, -123.12], 10)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  map.on('click', (e) => addStop({ lat: e.latlng.lat, lng: e.latlng.lng }))
  layer = L.layerGroup().addTo(map)
  polyline = L.polyline([], { color: '#e53935', weight: 3 }).addTo(map)
  watch(day, render, { deep: true, immediate: true })
})

function render() {
  if (!map) return
  layer.clearLayers()
  const path = []
  day.value.stops.forEach((s, i) => {
    if (s.lat == null) return
    const m = L.marker([s.lat, s.lng], { icon: numIcon(i + 1), title: s.place, draggable: true }).addTo(layer)
    m.on('dragend', (e) => { const p = e.target.getLatLng(); s.lat = p.lat; s.lng = p.lng })
    m.on('click', () => { if (confirm(`Remove pin "${s.place}"?`)) removeStop(i) })
    path.push([s.lat, s.lng])
  })
  polyline.setLatLngs(path)
  if (path.length > 1) map.fitBounds(path, { padding: [60, 60] })
  else if (path.length === 1) map.panTo(path[0])
}

// Nominatim (OSM) search. ponytail: public endpoint, ~1 req/s limit; self-host or use Photon if it throttles.
async function search(text = query.value) {
  if (!text.trim()) return
  searching.value = true; error.value = ''
  try {
    const b = map.getBounds()
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(text)}&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`
    const found = await (await fetch(url)).json()
    results.value = found.map(p => ({ place: p.name || p.display_name.split(',')[0], address: p.display_name, lat: +p.lat, lng: +p.lon }))
    if (!results.value.length) error.value = 'No results'
  } catch (e) { error.value = e.message }
  searching.value = false
}
const pick = (r) => { addStop({ place: r.place, note: r.address, lat: r.lat, lng: r.lng }); results.value = []; query.value = '' }
// "Locate" a stop that has no coords: search its name and take the first hit
async function locate(s) {
  await search(s.place)
  const r = results.value[0]
  if (r) { s.lat = r.lat; s.lng = r.lng; results.value = [] }
}
const focus = (s) => { if (s.lat != null && map) map.setView([s.lat, s.lng], 14) }

</script>

<template>
  <div class="app">
    <aside>
      <header>
        <select v-model="dayIdx">
          <option v-for="(d, i) in days" :key="i" :value="i">{{ d.date }}</option>
        </select>
        <input v-model="day.date" class="date" />
        <button @click="addDay" title="Add day">+ day</button>
        <button @click="removeDay" title="Delete day">🗑</button>
        <button @click="reset" title="Reset itinerary">↺</button>
      </header>

      <form class="search" @submit.prevent="search()">
        <input v-model="query" placeholder="Search a place (OpenStreetMap)…" />
        <button :disabled="searching">{{ searching ? '…' : 'Search' }}</button>
      </form>
      <p v-if="error" class="err">{{ error }}</p>
      <ul v-if="results.length" class="results">
        <li v-for="r in results" :key="r.lat + r.lng">
          <div><b>{{ r.place }}</b><br /><small>{{ r.address }}</small></div>
          <button @click="pick(r)" title="Add to this day">+ day</button>
          <button @click="savePlace(r)" title="Save to places list">☆</button>
        </li>
      </ul>

      <ol class="stops">
        <li v-for="(s, i) in day.stops" :key="i" :class="{ nopin: s.lat == null, over: dragFrom != null && dragFrom !== i }"
            draggable="true" @dragstart="dragFrom = i" @dragover.prevent @drop="drop(i)" @dragend="dragFrom = null">
          <span class="n" @click="focus(s)" title="Drag to reorder · click to focus">{{ i + 1 }}</span>
          <input v-model="s.time" class="time" placeholder="Time" />
          <input v-model="s.place" class="place" placeholder="Place" />
          <input v-model="s.note" class="note" placeholder="Note" />
          <span class="btns">
            <button v-if="s.lat == null" @click="locate(s)" title="Find on map">📍</button>
            <button @click="removeStop(i)">✕</button>
          </span>
        </li>
      </ol>
      <button class="add" @click="addStop()">+ stop (or click the map)</button>

      <details class="library" open>
        <summary>Saved places ({{ places.length }})</summary>
        <p v-if="!places.length"><small>Search above and press ☆ to save a place here.</small></p>
        <ul>
          <li v-for="(p, i) in places" :key="i">
            <div><b>{{ p.place }}</b><br /><small>{{ p.address }}</small></div>
            <button @click="addFromLibrary(p)" title="Add to this day">+ day</button>
            <button @click="removePlace(i)">✕</button>
          </li>
        </ul>
      </details>
    </aside>
    <div ref="mapEl" class="map"></div>
  </div>
</template>

<style>
* { box-sizing: border-box }
body { margin: 0; font: 14px system-ui, sans-serif }
.app { height: 100vh; position: relative }
.map { position: absolute; inset: 0; z-index: 0 }
aside { position: absolute; top: 12px; left: 12px; bottom: 12px; z-index: 1000; width: 440px; max-width: calc(100vw - 24px); overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: rgba(255,255,255,.94); border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.25) }
.pin span { display: block; width: 26px; height: 26px; border-radius: 50%; background: #e53935; color: #fff; text-align: center; line-height: 26px; font: bold 12px system-ui; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); box-sizing: border-box }
header, .search { display: flex; gap: 4px }
header .date { width: 90px }
.search input { flex: 1 }
input { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; min-width: 0 }
button { cursor: pointer; padding: 3px 7px; border: 1px solid #bbb; border-radius: 4px; background: #f6f6f6 }
button:disabled { opacity: .4; cursor: default }
.err { color: #c00; margin: 0 }
ul, ol { list-style: none; margin: 0; padding: 0 }
.results li, .library li { display: flex; gap: 6px; align-items: center; padding: 6px; border-bottom: 1px solid #eee }
.results li div, .library li div { flex: 1 }
.results { background: #fffbe6; border: 1px solid #f0e2a0; border-radius: 4px }
.stops li { display: grid; grid-template-columns: 22px 70px 1fr auto; gap: 4px; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee }
.stops .note { grid-column: 2 / -1 }
.stops .n { width: 22px; height: 22px; border-radius: 50%; background: #e53935; color: #fff; text-align: center; line-height: 22px; font-size: 12px; cursor: pointer }
.stops .nopin .n { background: #999 }
.stops li { cursor: grab }
.stops li.over { border-top: 2px dashed #e53935 }
.btns { display: flex; gap: 2px }
.add { align-self: flex-start }
.library summary { cursor: pointer; font-weight: 600; margin-top: 8px }
</style>
