// Workout-Musik (Dean 2026-11-26): drei lange Mixe (public/music/*.mp3) mit Kapiteln je Lied
// (public/music/playlists.json, aus den Kapitelmarken + Credits erzeugt). Ein Player für die ganze App
// (läuft beim Seitenwechsel weiter), merkt sich Playlist + Stelle, Sperrbildschirm-Anzeige (Media Session),
// wird leiser, wenn Coach/Ansagen sprechen (Ereignis „tyc:duck“). Lizenz CC BY 4.0 -> Credits je Lied anzeigen.
import { useSyncExternalStore } from "react";
import { track } from "./usage";

const KEY = "tyc_music_state";
const DUCK = 0.3;

const readSaved = () => { try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const save = (v) => { try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* egal */ } };

let data = null; // { license, playlists: [{ id, file, duration, tracks: [{ title, artist, start, end, source }] }] }
let loading = null;
let audio = null;
let state = { ready: false, playing: false, plId: null, time: 0, volume: 0.7, ducked: false };
const listeners = new Set();
let saveTimer = 0;

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function trackAt(pl, t) {
  if (!pl) return { index: -1, track: null };
  let i = pl.tracks.findIndex((tr) => t >= tr.start && t < tr.end);
  if (i < 0) i = t >= pl.duration - 1 ? pl.tracks.length - 1 : 0;
  return { index: i, track: pl.tracks[i] };
}
const playlist = (id) => data?.playlists.find((p) => p.id === id) || data?.playlists[0] || null;

function applyVolume() {
  if (audio) audio.volume = Math.max(0, Math.min(1, state.volume * (state.ducked ? DUCK : 1)));
}

// Workout-Modus übernimmt den Sperrbildschirm (Runde/Phase statt Liedtitel); danach wieder Musik
let claimed = false;
export function claimMediaSession() { claimed = true; }
export function restoreMediaSession() {
  claimed = false;
  if (!("mediaSession" in navigator)) return;
  try {
    if (!audio) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      for (const k of ["play", "pause", "previoustrack", "nexttrack"]) navigator.mediaSession.setActionHandler(k, null);
    }
    navigator.mediaSession.setPositionState?.();
  } catch { /* egal */ }
  if (audio) { registerHandlers(); updateMediaSession(); }
}
function registerHandlers() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
  } catch { /* egal */ }
}

function updateMediaSession() {
  if (!("mediaSession" in navigator) || claimed) return;
  const pl = playlist(state.plId);
  const { track } = trackAt(pl, state.time);
  if (!track) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: track.title, artist: track.artist, album: "TrackYourCrew", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] });
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
  } catch { /* egal */ }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  let lastTrack = -1;
  audio.addEventListener("timeupdate", () => {
    set({ time: audio.currentTime });
    const idx = trackAt(playlist(state.plId), audio.currentTime).index;
    if (idx !== lastTrack) { lastTrack = idx; updateMediaSession(); }
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const s = readSaved();
      save({ ...s, plId: state.plId, volume: state.volume, pos: { ...(s.pos || {}), [state.plId]: Math.floor(audio.currentTime) } });
    }, 1000);
  });
  audio.addEventListener("play", () => { window.__tycMusicPlaying = true; set({ playing: true }); updateMediaSession(); });
  audio.addEventListener("pause", () => { window.__tycMusicPlaying = false; set({ playing: false }); updateMediaSession(); });
  audio.addEventListener("ended", () => { // Mix zu Ende -> nächste Playlist
    const i = data.playlists.findIndex((p) => p.id === state.plId);
    selectPlaylist(data.playlists[(i + 1) % data.playlists.length].id, true, 0);
  });
  window.addEventListener("tyc:duck", (e) => { set({ ducked: !!e.detail }); applyVolume(); });
  if (!claimed) registerHandlers();
  return audio;
}

export function loadMusic() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = fetch("/music/playlists.json")
      .then((r) => r.json())
      .then((d) => {
        data = d;
        const s = readSaved();
        set({ ready: true, plId: playlist(s.plId)?.id || d.playlists[0].id, volume: typeof s.volume === "number" ? s.volume : 0.7, time: s.pos?.[s.plId] || 0 });
        return d;
      })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

export function musicData() { return data; }

function selectPlaylist(id, autoplay, at) {
  const pl = playlist(id);
  if (!pl) return;
  const a = ensureAudio();
  const s = readSaved();
  const pos = at ?? s.pos?.[pl.id] ?? 0;
  if (state.plId !== pl.id || !a.src) {
    a.src = pl.file;
    try { a.currentTime = pos; } catch { /* erst nach Laden */ }
    a.addEventListener("loadedmetadata", () => { try { if (Math.abs(a.currentTime - pos) > 1) a.currentTime = pos; } catch { /* egal */ } }, { once: true });
  }
  set({ plId: pl.id, time: pos });
  save({ ...s, plId: pl.id });
  applyVolume();
  if (autoplay) a.play().catch(() => set({ playing: false }));
}

export async function play() {
  track("music_played");
  await loadMusic();
  if (!data) return;
  const a = ensureAudio();
  if (!a.src) selectPlaylist(state.plId, false, state.time);
  applyVolume();
  a.play().catch(() => set({ playing: false }));
}
export function pause() { audio?.pause(); }
export function toggle() { if (state.playing) pause(); else play(); }
export async function choosePlaylist(id) { await loadMusic(); selectPlaylist(id, true); }

function seekTo(t) {
  const a = ensureAudio();
  if (!a.src) selectPlaylist(state.plId, false, t);
  try { a.currentTime = Math.max(0, t); } catch { /* egal */ }
  set({ time: Math.max(0, t) });
}
export function next() {
  const pl = playlist(state.plId);
  const { index } = trackAt(pl, state.time);
  if (!pl) return;
  if (index < pl.tracks.length - 1) seekTo(pl.tracks[index + 1].start + 0.05);
  else { const i = data.playlists.findIndex((p) => p.id === pl.id); selectPlaylist(data.playlists[(i + 1) % data.playlists.length].id, state.playing, 0); }
}
export function prev() {
  const pl = playlist(state.plId);
  const { index, track } = trackAt(pl, state.time);
  if (!pl) return;
  // wie üblich: nach 3 s erst an den Liedanfang, sonst ein Lied zurück
  if (state.time - track.start > 3 || index === 0) seekTo(track.start + 0.05);
  else seekTo(pl.tracks[index - 1].start + 0.05);
}
export function seekInTrack(fraction) {
  const pl = playlist(state.plId);
  const { track } = trackAt(pl, state.time);
  if (track) seekTo(track.start + (track.end - track.start) * Math.max(0, Math.min(0.999, fraction)));
}
export function setVolume(v) {
  set({ volume: Math.max(0, Math.min(1, v)) });
  applyVolume();
  save({ ...readSaved(), volume: state.volume });
}

export function useMusic() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
